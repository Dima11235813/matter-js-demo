import React, { useEffect, useRef } from "react";
import "./App.css";
import { inject, observer } from "mobx-react";
import { MenuStore } from "./stores/MenuStore";
import { GameStore } from "./stores/GameStore";
import deps from "./matterJsComp/Deps";
import { logger } from "./utils/logger";
import type { ThemeName } from "./theme/palette";

interface WordWorldProps {
  menuStore?: MenuStore;
  gameStore?: GameStore;
}

interface Destroyable {
  destroy(): void;
}

/** Captures the live board and its spawn queue so a world of the same view can adopt them (2D <-> 3D switch). */
function captureHandoff(view: string) {
  if (view === "sandbox") deps.lettersBoard = deps.activeWorld?.letterSnapshot?.();
  const probes = deps.activeWorld?.wordProbes() ?? [];
  deps.worldHandoff = {
    view,
    words: probes.map(({ text, x, y, color }) => ({ word: text, x, y, color })),
    pending: [...deps.pendingWordSpawns],
    molecules: deps.activeWorld?.moleculeWords() ?? [],
  };
}

type WorldFactory = (container: HTMLElement) => Destroyable;

/** Each world's code is loaded once and kept (a failed load is retried next time). */
function cachedImport<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => (pending ??= load().catch(error => { pending = undefined; throw error; }));
}

const load2d = cachedImport(() => import("./matterJsComp/WorldContainer").then(({ WorldContainer }): WorldFactory => container => new WorldContainer(container)));
/** The 3D view's code (three.js and the space world): preloaded in idle time so the 3D switch is instant. */
export const load3d = cachedImport(() => import("./space/SpaceWorld").then(({ SpaceWorld }): WorldFactory => container => new SpaceWorld(container)));

/** Runs `work` when the browser is idle (or soon, without requestIdleCallback); returns a cancel function. */
function whenIdle(work: () => void, timeout: number): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(work, { timeout });
    return () => window.cancelIdleCallback(handle);
  }
  const timer = window.setTimeout(work, Math.min(timeout, 1500));
  return () => window.clearTimeout(timer);
}

/**
 * Gets the 3D view ready while the player is in 2D (Epic 4 · Task 4.5.15): first its code (fix F1), then, in a
 * separate idle slot, the shared WebGL renderer with its shaders compiled (fix F1b), so the switch itself only
 * builds the scene.
 */
function preload3dWhenIdle(theme: ThemeName): () => void {
  let cancelWarm: (() => void) | undefined;
  const cancelLoad = whenIdle(() => {
    void load3d()
      .then(() => import("./space/sharedRenderer"))
      .then(({ warmUp }) => { cancelWarm = whenIdle(() => { void warmUp(theme); }, 4000); })
      .catch(() => { /* retried on the switch itself */ });
  }, 4000);
  return () => { cancelLoad(); cancelWarm?.(); };
}

/**
 * Mounts the 2D world (Matter + a Canvas2D sketch) or, with hint mode on and 3D selected, the three.js space.
 * Both are code-split: the page (menu, dashboard) renders first, while the world's engine downloads in
 * parallel with the vocabulary (Epic 4 · Tasks 4.5.6, 4.5.7).
 *
 * A 2D <-> 3D switch keeps the current world on screen until the next one's code has loaded, then swaps them
 * in one go (owner, 2026-11-01: during the load the board went blank and looked as if the words were lost).
 * A view change (letters, Discovery, Guess) still tears the old world down at once: it must never run under
 * a view it wasn't built for.
 */
const WordWorld = inject("menuStore", "gameStore")(observer((props: WordWorldProps) => {
  const view = props.menuStore!.view;
  const spaceActive = props.gameStore!.spaceActive;
  // 3D is one tap away once the vocabulary is in and hint mode is on: preload its code then.
  const preload = props.menuStore!.engineStatus === "ready" && props.gameStore!.hintMode;
  const current = useRef<{ world: Destroyable; view: string } | undefined>(undefined);

  const retire = () => {
    const old = current.current;
    if (!old) return;
    captureHandoff(old.view);
    old.world.destroy();
    current.current = undefined;
  };

  useEffect(() => {
    const container = document.getElementById("worldContainter");
    if (!container) return;
    if (current.current && current.current.view !== view) retire();
    let cancelled = false;
    (spaceActive ? load3d : load2d)().then(make => {
      if (cancelled) return;
      retire();
      current.current = { world: make(container), view };
    }).catch(error => logger.error("Could not load the world", error));
    return () => { cancelled = true; };
  }, [view, spaceActive]);

  // Unmount: the last world goes too.
  useEffect(() => retire, []);

  // The theme only colors the warm-up scene, so a theme change doesn't restart the preload.
  const theme = props.menuStore!.theme;
  useEffect(() => (preload ? preload3dWhenIdle(theme) : undefined), [preload]);

  return <div id="worldContainter"></div>;
}));

export default WordWorld;

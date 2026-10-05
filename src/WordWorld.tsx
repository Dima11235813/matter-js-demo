import React, { useEffect } from "react";
import "./App.css";
import { inject, observer } from "mobx-react";
import { MenuStore } from "./stores/MenuStore";
import { GameStore } from "./stores/GameStore";
import deps from "./matterJsComp/Deps";

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
  };
}

/**
 * Mounts the 2D world (Matter + p5) or, with hint mode on and 3D selected, the three.js space.
 * Both are code-split: the page (menu, dashboard) renders first, while the world's engine downloads in
 * parallel with the vocabulary (p5 alone is ~1 MB; see Epic 4 · Task 4.5.6).
 */
const WordWorld = inject("menuStore", "gameStore")(observer((props: WordWorldProps) => {
  const view = props.menuStore!.view;
  const spaceActive = props.gameStore!.spaceActive;

  useEffect(() => {
    const container = document.getElementById("worldContainter");
    if (!container) return;
    let world: Destroyable | undefined;
    let disposed = false;
    if (spaceActive) {
      import("./space/SpaceWorld").then(({ SpaceWorld }) => {
        if (!disposed) world = new SpaceWorld(container);
      });
    } else {
      import("./matterJsComp/WorldContainer").then(({ WorldContainer }) => {
        if (!disposed) world = new WorldContainer(container);
      });
    }
    return () => {
      disposed = true;
      if (world) captureHandoff(view);
      world?.destroy();
    };
  }, [view, spaceActive]);

  return <div id="worldContainter"></div>;
}));

export default WordWorld;

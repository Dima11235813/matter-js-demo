import * as THREE from "three";
import type { SpaceBody } from "../physics/spaceSimulation";
import type { OrbitalLink } from "../physics/orbitalForces";
import type { ThemeName } from "../theme/palette";
import { SpaceScene } from "./SpaceScene";
import { FOV } from "./CameraDirector";

/**
 * One WebGL renderer for every 3D world (Epic 4 · Task 4.5.15, owner 2026-11-01: "the transition triggered by
 * the user should be instantaneous"). Creating a renderer per world meant a new WebGL context and every shader
 * program compiled again on each 2D -> 3D switch: about 150 ms of JavaScript plus the GPU's own compile at 4x CPU.
 * The renderer outlives the worlds (its canvas is detached in 2D), and `warmUp` compiles the 3D view's shaders
 * ahead of time, while the player is still in 2D.
 */
let shared: THREE.WebGLRenderer | undefined;
/** Kept alive on purpose: three.js frees a shader program once no material uses it. */
let warmScene: SpaceScene | undefined;
let warming: Promise<void> | undefined;

export function acquireRenderer(): THREE.WebGLRenderer {
    if (!shared) {
        shared = new THREE.WebGLRenderer({ antialias: true });
        shared.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
    return shared;
}

/** Detaches the renderer from a world that is going away; the context and its compiled programs stay. */
export function releaseRenderer(renderer: THREE.WebGLRenderer): void {
    renderer.setAnimationLoop(null);
    renderer.domElement.remove();
}

/**
 * Compiles the programs the 3D view uses (labels, glow, halos, threads, bonds, pills, fog) on a two-word sample
 * scene built by the same `SpaceScene`, so the materials match exactly. Uses the GPU's parallel compile when
 * available (`compileAsync`). Safe to call more than once.
 */
export function warmUp(theme: ThemeName): Promise<void> {
    if (!warming) {
        warming = (async () => {
            const renderer = acquireRenderer();
            const view = new SpaceScene();
            view.applyTheme(theme);
            const body = (id: number, x: number): SpaceBody => ({
                id, word: "warm", vector: new Float32Array(1), rank: 0, position: [x, 0, 0], velocity: [0, 0, 0], radius: 20, orbitAxis: [0, 0, 1],
            });
            const bodies = [body(-1, 0), body(-2, 120)];
            const links: OrbitalLink[] = [{ i: 0, j: 1, similarity: 0.5, strength: 1, core: 0 }];
            view.syncLabels(bodies, () => "#8899aa", new Set([-2]), new Set([-1]));
            view.syncMoleculeHalos(bodies, [{ id: 1, members: [-1, -2], bonds: [[-1, -2]] }]);
            view.syncThreads(bodies, links, -1);
            view.syncPills(bodies, links, -1);
            const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 20000);
            camera.position.set(0, 0, 600);
            if (typeof renderer.compileAsync === "function") await renderer.compileAsync(view.scene, camera);
            else renderer.compile(view.scene, camera);
            warmScene = view;
        })().catch(() => { warming = undefined; });
    }
    return warming;
}

/** True once the shaders are compiled (tests and probes). */
export function isWarm(): boolean {
    return warmScene !== undefined;
}

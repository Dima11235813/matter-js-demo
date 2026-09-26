import deps from "./matterJsComp/Deps";
import { stores } from "./stores";
import { semanticEngine } from "./services/semanticEngine";
import { layoutFidelity, LayoutFidelity } from "./physics/layoutMetrics";

export interface WordBoxProbe {
    text: string
    x: number
    y: number
}

/**
 * Dev-only console/e2e handle: `window.__lexical.wordBoxes()` lists word positions in canvas
 * coordinates, `semanticEngine.neighbors("king")` explores the space, and `layoutFidelity()`
 * measures how well on-screen distance mirrors similarity (-1 is perfect). Not in prod builds.
 */
export function installDevtools(): void {
    const handle = {
        deps,
        stores,
        semanticEngine,
        /** Word positions in canvas pixels (3D: projected through the camera), for clicking. */
        wordBoxes: (): WordBoxProbe[] =>
            (deps.activeWorld?.wordProbes() ?? []).map(({ text, x, y }) => ({ text, x, y })),
        /** Words currently highlighted by focus (new words, HUD links, the analogies panel). */
        focusedWords: (): string[] => deps.activeWorld?.focusedWords() ?? [],
        /** Fidelity in the world's own space: 2D pixels or 3D world units. */
        layoutFidelity: (): LayoutFidelity => {
            const probes = deps.activeWorld?.wordProbes() ?? []
            return layoutFidelity(probes.map(p => p.position), probes.map(p => semanticEngine.lookup(p.text)!))
        },
    };
    (window as unknown as { __lexical: typeof handle }).__lexical = handle;
}

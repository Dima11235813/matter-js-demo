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
        wordBoxes: (): WordBoxProbe[] =>
            (deps.activeWorld?.shapesFac.boxes ?? [])
                .filter(box => box.embedding && box.body)
                .map(box => ({ text: box.text, x: box.body!.position.x, y: box.body!.position.y })),
        layoutFidelity: (): LayoutFidelity => {
            const boxes = handle.wordBoxes()
            return layoutFidelity(boxes.map(b => [b.x, b.y]), boxes.map(b => semanticEngine.lookup(b.text)!))
        },
    };
    (window as unknown as { __lexical: typeof handle }).__lexical = handle;
}

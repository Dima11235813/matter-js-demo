import deps from "./matterJsComp/Deps";
import { stores } from "./stores";
import { semanticEngine } from "./services/semanticEngine";

export interface WordBoxProbe {
    text: string
    x: number
    y: number
}

/**
 * Dev-only console/e2e handle: `window.__lexical.wordBoxes()` lists word positions in canvas
 * coordinates, `semanticEngine.neighbors("king")` explores the space. Not included in prod builds.
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
    };
    (window as unknown as { __lexical: typeof handle }).__lexical = handle;
}

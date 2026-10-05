import { semanticEngine } from "./semanticEngine";
import { defaultGroupThreshold, similarityGroups, similarityMatrix } from "../physics/orbitalForces";
import { semanticColors } from "../theme/semanticColors";

/**
 * Color hint mode (Epic 5 · Feature 5.17): one painter for the 2D and 3D worlds. Colors are computed
 * only when the board's words or molecules change, and the last hues are kept across worlds, so a
 * 2D <-> 3D switch (or a new word) does not repaint the board. The flag is a per-device preference,
 * independent of hint mode, gravity, and dimension (decided 2026-09-24).
 */
const STORAGE_KEY = "lexical-fountain.colorHints";

export function loadColorHints(): boolean {
    try {
        return window.localStorage.getItem(STORAGE_KEY) === "on";
    } catch {
        return false;
    }
}

export function saveColorHints(on: boolean): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    } catch {
        /* storage blocked: the choice still applies for this session */
    }
}

class ColorHintPainter {
    private key = "";
    private colors = new Map<string, string>();
    private previous = new Map<string, number>();

    /**
     * Semantic colors by word for the words on the board. `molecules` lists words bonded together;
     * they share one hue. Words without a vector are left out (they keep their own color).
     */
    colorsFor(words: readonly string[], molecules: readonly (readonly string[])[] = []): ReadonlyMap<string, string> {
        if (!semanticEngine.isReady) return this.colors;
        const known = [...new Set(words)].filter(word => semanticEngine.lookup(word)).sort();
        const key = known.join("|") + "#" + molecules.map(m => [...m].sort().join("+")).sort().join("|");
        if (key === this.key) return this.colors;
        this.key = key;
        const sims = similarityMatrix(known.map(word => semanticEngine.lookup(word)!));
        const groups = similarityGroups(sims, known.length, defaultGroupThreshold(semanticEngine.calibration));
        // Molecule members join one group (the first member's), so a molecule takes one hue.
        for (const molecule of molecules) {
            const indices = molecule.map(word => known.indexOf(word)).filter(i => i >= 0);
            if (indices.length < 2) continue;
            const target = groups[indices[0]];
            const merged = new Set(indices.map(i => groups[i]));
            groups.forEach((g, i) => { if (merged.has(g)) groups[i] = target; });
        }
        const colors = semanticColors({ words: known, sims, groups, previous: this.previous });
        this.colors = new Map(known.map((word, i) => [word, colors[i].hex]));
        this.previous = new Map(known.map((word, i) => [word, colors[i].hue]));
        return this.colors;
    }
}

export const colorHintPainter = new ColorHintPainter();

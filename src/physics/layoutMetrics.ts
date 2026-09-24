import { dot } from "../embeddings/vectorMath";

export interface LayoutFidelity {
    /** Spearman rank correlation between pair similarity and pair distance; -1 is a perfect map. */
    spearman: number;
    pairs: number;
}

/**
 * How faithfully a layout maps meaning to space: for every pair of words, rank their similarity
 * and their on-screen distance, and correlate the ranks. Works for 2D and 3D positions.
 * Needs at least 3 words (3 pairs) to be meaningful; returns 0 otherwise.
 */
export function layoutFidelity(positions: readonly number[][], vectors: readonly Float32Array[]): LayoutFidelity {
    const sims: number[] = [];
    const dists: number[] = [];
    for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
            sims.push(dot(vectors[i], vectors[j]));
            dists.push(distance(positions[i], positions[j]));
        }
    }
    return { spearman: sims.length < 3 ? 0 : spearman(sims, dists), pairs: sims.length };
}

export function spearman(a: readonly number[], b: readonly number[]): number {
    const ra = ranks(a);
    const rb = ranks(b);
    const mean = (a.length - 1) / 2;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) {
        num += (ra[i] - mean) * (rb[i] - mean);
        da += (ra[i] - mean) ** 2;
        db += (rb[i] - mean) ** 2;
    }
    return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/** Average ranks, so ties do not bias the correlation. */
function ranks(values: readonly number[]): number[] {
    const order = values.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]);
    const out = new Array<number>(values.length);
    for (let start = 0; start < order.length;) {
        let end = start;
        while (end + 1 < order.length && order[end + 1][0] === order[start][0]) end++;
        const rank = (start + end) / 2;
        for (let k = start; k <= end; k++) out[order[k][1]] = rank;
        start = end + 1;
    }
    return out;
}

function distance(a: readonly number[], b: readonly number[]): number {
    let sum = 0;
    for (let k = 0; k < a.length; k++) sum += (a[k] - b[k]) ** 2;
    return Math.sqrt(sum);
}

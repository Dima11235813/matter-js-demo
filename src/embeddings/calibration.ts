/**
 * Similarity calibration. Raw cosine values are model-specific, so the game reasons in
 * percentiles of random word-pair similarity measured at vocab build time. "p95" means 95% of
 * random pairs are less similar than this value.
 */
export interface Calibration {
    p1: number;
    p5: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
}

const KNOWN_PERCENTILES: Array<[number, keyof Calibration]> = [
    [1, "p1"], [5, "p5"], [10, "p10"], [25, "p25"], [50, "p50"],
    [75, "p75"], [90, "p90"], [95, "p95"], [99, "p99"],
];

/**
 * Maps a centered cosine similarity to "more related than X% of random word pairs",
 * interpolating linearly between measured percentiles and clamping to [0, 100].
 */
export function similarityPercentile(sim: number, cal: Calibration): number {
    const points: Array<[number, number]> = [[0, -1], ...KNOWN_PERCENTILES.map(([p, key]): [number, number] => [p, cal[key]]), [100, 1]];
    if (sim <= points[0][1]) return 0;
    for (let i = 1; i < points.length; i++) {
        const [pHigh, sHigh] = points[i];
        const [pLow, sLow] = points[i - 1];
        if (sim <= sHigh) {
            const span = sHigh - sLow;
            return span <= 0 ? pHigh : pLow + ((sim - sLow) / span) * (pHigh - pLow);
        }
    }
    return 100;
}

export interface MagnetismTuning {
    /** Force per unit of normalized attraction strength. */
    attraction: number;
    /** Force per unit of normalized repulsion strength at 150px distance. */
    repulsion: number;
}

export const defaultMagnetismTuning: MagnetismTuning = { attraction: 0.0004, repulsion: 0.0002 };

/**
 * Signed force magnitude between two word bodies (positive pulls together).
 * Only pairs in the top 10% of relatedness attract; only the bottom 10% repel, fading with
 * distance so unrelated words drift apart without flinging each other off-screen.
 */
export function magnetismMagnitude(
    sim: number,
    distance: number,
    cal: Calibration,
    tuning: MagnetismTuning = defaultMagnetismTuning
): number {
    if (sim > cal.p90) {
        const strength = Math.min(1, (sim - cal.p90) / (1 - cal.p90));
        return strength * tuning.attraction;
    }
    if (sim < cal.p10) {
        const strength = Math.min(1, (cal.p10 - sim) / (cal.p10 + 1));
        return -strength * tuning.repulsion * (150 / (distance + 1));
    }
    return 0;
}

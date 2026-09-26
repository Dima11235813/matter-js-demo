/**
 * A learning hint shown after every analogy, in the sandbox and timed rounds (Epic 2 · Feature 2.11;
 * docs/research/analogy-scoring.md §5). It tells the player whether the embedding carried the
 * relation a → b over to c → d; it never changes points. Held-out analogies: 54% "carried", known-good
 * set 77%, synonym-exploit plays 4%, random words 1%.
 */
export type RelationHint = "carried" | "collapsed" | "unclear";

export interface RelationStats {
    /** Similarity of the question pair a, b. */
    ab: number;
    /** Similarities of the answer d to c, a, and b. */
    dc: number;
    da: number;
    db: number;
    /** cos(b − a, d − c): does the same relation carry over? */
    offset: number;
}

export const HINT_OFFSET_MIN = 0.2;

/**
 * Thresholds from the calibration: `related` = p90 (a, b more alike than 90% of random pairs; p99
 * would reject man → king at 0.10 in this model), `near` = p95, `link` = p99 (the hint layout's link).
 */
export interface HintThresholds {
    related: number;
    near: number;
    link: number;
}

export function relationHint(stats: RelationStats, thresholds: HintThresholds): RelationHint {
    const { ab, dc, da, db, offset } = stats;
    if (dc < thresholds.near && Math.max(da, db) >= thresholds.link) return "collapsed";
    if (ab >= thresholds.related && dc >= thresholds.near && offset >= HINT_OFFSET_MIN) return "carried";
    return "unclear";
}

export function relationHintText(hint: RelationHint, a: string, b: string): string {
    switch (hint) {
        case "carried":
            return `✓ the relation ${a} → ${b} carried over`;
        case "collapsed":
            return `✗ the answer fell back onto ${a} / ${b}`;
        default:
            return `· no clear relation carried over`;
    }
}

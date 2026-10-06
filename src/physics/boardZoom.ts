/**
 * 2D "zoom out" for small and crowded boards (Epic 5 · Task 5.7.0; owner play-test on a phone: "on
 * mobile we zoomed out to make enough space in the hint mode as well as when they're in a pile").
 * Word boxes were drawn at desktop size, so a 352 px phone board fit only a few words. The scale is
 * the smaller of a screen cap (the word size's `floor` on a phone, 1 on a desktop) and a crowd cap (words
 * cover at most `maxFill` of the board), stepped so it doesn't jitter as words come and go.
 */
export const ZOOM = {
    /** Canvas width (px) at which words reach full size. */
    fullWidth: 1100,
    max: 1,
    step: 0.05,
} as const;

/**
 * Word size setting (owner, 2026-10-05: half size was "a bit too small of a tap target when they're in
 * a pile"; wanted "a middle ground"). `floor` is the zoom on a phone, `min` the most a crowded board may
 * shrink (taps stay possible), `maxFill` the share of the board words may cover before shrinking.
 */
export type WordSize = "small" | "medium" | "large";
export const WORD_SIZES: Readonly<Record<WordSize, { floor: number; min: number; maxFill: number }>> = {
    small: { floor: 0.5, min: 0.4, maxFill: 0.22 },
    medium: { floor: 0.7, min: 0.6, maxFill: 0.3 },
    large: { floor: 0.9, min: 0.8, maxFill: 0.4 },
};

/** The zoom for a board of `width` x `height` holding words whose full-size areas are `areas`. */
export function boardZoom(width: number, height: number, areas: readonly number[], size: WordSize = "medium"): number {
    const { floor, min, maxFill } = WORD_SIZES[size];
    const screen = Math.min(ZOOM.max, Math.max(floor, width / ZOOM.fullWidth));
    const total = areas.reduce((s, a) => s + a, 0);
    const crowd = total > 0 ? Math.sqrt((maxFill * width * height) / total) : ZOOM.max;
    const zoom = Math.max(min, Math.min(screen, crowd, ZOOM.max));
    return Math.floor(zoom / ZOOM.step + 1e-9) * ZOOM.step;
}

const SIZE_KEY = "lexical-fountain.wordSize";

export function loadWordSize(): WordSize {
    try {
        const saved = window.localStorage.getItem(SIZE_KEY);
        return saved === "small" || saved === "large" ? saved : "medium";
    } catch {
        return "medium";
    }
}

export function saveWordSize(size: WordSize): void {
    try {
        window.localStorage.setItem(SIZE_KEY, size);
    } catch {
        /* storage blocked: the size still applies for this session */
    }
}

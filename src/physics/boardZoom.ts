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
    return boardLayout(width, height, areas, size).zoom;
}

/** The word size's zoom on this screen before any crowding (phones: the size's floor; desktops: 1). */
export function screenZoom(width: number, size: WordSize = "medium"): number {
    return Math.min(ZOOM.max, Math.max(WORD_SIZES[size].floor, width / ZOOM.fullWidth));
}

/**
 * Hint-mode spacing (Epic 5 · Task 5.7.4; owner, 2026-10-10: "our 2d view gets crowded quickly and we
 * should auto adjust the zoom when we add so that there is space between the words so they can push and
 * repel"). Shrinking only the boxes left the layout's lengths (separation 380 px x viewport) at full size,
 * so 20+ words pressed against the walls and the map of meaning collapsed (phone, 30 words: 40% at a wall,
 * fidelity -0.19). Every word claims a square of `perWord` x the unlinked separation; the layout's lengths
 * scale down until the words fit `fill` of the board, and a narrow board fits `narrowUnits` separations
 * across. (Link components were tried as the unit and failed: p99 links chain 35 of 40 words into one.)
 */
export const SPACE = {
    perWord: 0.6,
    fill: 1,
    narrowUnits: 2,
    /** Lengths never shrink below this share (words stay distinguishable from their neighbours). */
    minLengths: 0.4,
} as const;

/** Room (px²) the hint layout needs at full lengths for `words` words at this unlinked `separation`. */
export function layoutNeed(words: number, separation: number): number {
    return words * (SPACE.perWord * separation) ** 2;
}

export interface BoardLayout {
    /** Word box zoom. */
    zoom: number;
    /** Share of the hint layout's lengths (separation, rest lengths, far target) to use, 0.4..1. */
    lengths: number;
}

/**
 * Zoom and layout lengths together, like a camera zooming out: with `need` (layoutNeed at full lengths,
 * 0 outside hint mode), lengths shrink until the layout fits, and boxes shrink with them (down to the
 * word size's minimum, so taps stay possible; lengths may keep shrinking past it, to `minLengths`).
 * `separation` is the full-length unlinked separation in px, for the narrow-board check.
 */
export function boardLayout(width: number, height: number, areas: readonly number[], size: WordSize = "medium", need = 0, separation = 0): BoardLayout {
    const { min, maxFill } = WORD_SIZES[size];
    const screen = screenZoom(width, size);
    const total = areas.reduce((s, a) => s + a, 0);
    const crowd = total > 0 ? Math.sqrt((maxFill * width * height) / total) : ZOOM.max;
    let lengths = 1;
    if (need > 0) {
        const fit = Math.sqrt((SPACE.fill * width * height) / need);
        const narrow = separation > 0 ? Math.min(width, height) / (SPACE.narrowUnits * separation) : 1;
        lengths = stepDown(Math.max(SPACE.minLengths, Math.min(1, fit, narrow)));
    }
    const zoom = Math.max(min, Math.min(screen, crowd, screen * lengths, ZOOM.max));
    return { zoom: stepDown(zoom), lengths };
}

function stepDown(value: number): number {
    return Math.floor(value / ZOOM.step + 1e-9) * ZOOM.step;
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

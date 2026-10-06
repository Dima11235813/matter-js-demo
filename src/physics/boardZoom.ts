/**
 * 2D "zoom out" for small and crowded boards (Epic 5 · Task 5.7.0; owner play-test on a phone: "on
 * mobile we zoomed out to make enough space in the hint mode as well as when they're in a pile").
 * Word boxes were drawn at desktop size, so a 352 px phone board fit only a few words. The scale is
 * the smaller of a screen cap (≈ 0.5 on a phone, 1 on a desktop) and a crowd cap (words cover at most
 * `maxFill` of the board), stepped so it doesn't jitter as words come and go.
 */
export const ZOOM = {
    /** Canvas width (px) at which words reach full size. */
    fullWidth: 1100,
    min: 0.4,
    max: 1,
    /** Largest share of the board the word boxes may cover. */
    maxFill: 0.22,
    step: 0.05,
} as const;

/** The zoom for a board of `width` x `height` holding words whose full-size areas are `areas`. */
export function boardZoom(width: number, height: number, areas: readonly number[]): number {
    const screen = Math.min(ZOOM.max, Math.max(0.5, width / ZOOM.fullWidth));
    const total = areas.reduce((s, a) => s + a, 0);
    const crowd = total > 0 ? Math.sqrt((ZOOM.maxFill * width * height) / total) : ZOOM.max;
    const zoom = Math.max(ZOOM.min, Math.min(screen, crowd, ZOOM.max));
    return Math.floor(zoom / ZOOM.step + 1e-9) * ZOOM.step;
}

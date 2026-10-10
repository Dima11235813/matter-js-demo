import { WordSize, WORD_SIZES, ZOOM } from "../physics/boardZoom";

/**
 * 3D on phones (Epic 5 · Task 5.7.3; owner, 2026-10-10: "improve the 3d on the phone for zoom and label
 * size"). Measured on a Pixel 7 emulation before this: the camera framed a 20-word board at distance
 * 4,883, so labels were 6 px tall (3 px text) and the layout filled the middle third of the screen.
 * Three pure pieces:
 *   - labels never shrink below the 2D word size on screen (`labelScale`), so zooming out keeps them
 *     readable and zooming in still magnifies them;
 *   - auto-framing fits the words' projected extent, labels included, separately in width and height
 *     (`fitDistanceToExtents`), instead of a bounding sphere that wastes the height of a portrait screen;
 *   - the layout turns in the screen plane so its long axis follows the screen's long axis (`rollToFit`).
 */

/** Height of a 2D word box at zoom 1 (ShapesFactory), the reference for 3D labels. */
const BOX_HEIGHT_2D = 40;

/** On-screen height (px) a 3D label keeps at least: the 2D word box height at this screen's zoom. */
export function minLabelPx(width: number, size: WordSize = "medium"): number {
    const { floor } = WORD_SIZES[size];
    const screen = Math.min(ZOOM.max, Math.max(floor, width / ZOOM.fullWidth));
    return BOX_HEIGHT_2D * screen;
}

/** Pixels per world unit at `distance` from the camera, for a vertical field of view over `height` px. */
export function pixelsPerUnit(distance: number, height: number, fovDegrees: number): number {
    return height / (2 * Math.max(1e-6, distance) * Math.tan((fovDegrees * Math.PI) / 360));
}

/**
 * Label scale (>= 1) for labels `labelHeight` world units tall seen from `distance`: grows as the camera
 * backs off so they stay `minPx` tall on screen, and is 1 once the camera is close enough.
 */
export function labelScale(distance: number, height: number, fovDegrees: number, labelHeight: number, minPx: number): number {
    return Math.max(1, minPx / (labelHeight * pixelsPerUnit(distance, height, fovDegrees)));
}

/** A word in camera coordinates relative to the orbit target: right, up, toward the camera; label half size. */
export interface ViewPoint {
    right: number;
    up: number;
    depth: number;
    /** Label half width and height in world units (at scale 1). */
    halfWidth: number;
    halfHeight: number;
}

export interface ViewFrame {
    width: number;
    /** Full canvas height (the camera's field of view spans it). */
    height: number;
    /** Visible height below the docked dashboard (<= height). */
    available: number;
    fovDegrees: number;
    /** Labels keep at least this many px of height on screen (their width follows their aspect). */
    minLabelPx: number;
    /** Clear margin at the screen edges, px. */
    margin: number;
}

/**
 * Smallest camera distance (from the target, along the view axis) at which every word and its label is
 * inside the visible area. Labels are world-sized close up and screen-sized (minLabelPx) far away, so
 * each word takes whichever of the two needs more room.
 */
export function fitDistanceToExtents(points: readonly ViewPoint[], frame: ViewFrame): number {
    const focal = frame.height / 2 / Math.tan((frame.fovDegrees * Math.PI) / 360);
    const halfW = frame.width / 2 - frame.margin;
    const halfH = frame.available / 2 - frame.margin;
    let distance = 0;
    for (const p of points) {
        // Screen-sized label: its px half extents, from the label's aspect at minLabelPx.
        const pxHalfH = frame.minLabelPx / 2;
        const pxHalfW = pxHalfH * (p.halfWidth / Math.max(1e-6, p.halfHeight));
        const needs = [
            p.depth + ((Math.abs(p.right) + p.halfWidth) * focal) / Math.max(1, halfW),
            p.depth + ((Math.abs(p.up) + p.halfHeight) * focal) / Math.max(1, halfH),
            p.depth + (Math.abs(p.right) * focal) / Math.max(20, halfW - pxHalfW),
            p.depth + (Math.abs(p.up) * focal) / Math.max(20, halfH - pxHalfH),
        ];
        distance = Math.max(distance, ...needs);
    }
    return distance;
}

/** Centre of the words' extent in the screen plane (right, up), so lopsided layouts are centred. */
export function extentCenter(points: readonly ViewPoint[]): [number, number] {
    if (points.length === 0) return [0, 0];
    const xs = points.flatMap(p => [p.right - p.halfWidth, p.right + p.halfWidth]);
    const ys = points.flatMap(p => [p.up - p.halfHeight, p.up + p.halfHeight]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/**
 * Screen-plane angle (radians, counter-clockwise) by which to turn the layout so its long axis lies along
 * the screen's long axis: vertical on a portrait screen, horizontal on a landscape one. 0 when the layout
 * is round (no long axis to speak of) or the screen is close to square.
 */
export function rollToFit(points: readonly ViewPoint[], width: number, height: number, minElongation = 1.3): number {
    if (points.length < 3) return 0;
    const portrait = height > width * 1.15;
    const landscape = width > height * 1.15;
    if (!portrait && !landscape) return 0;
    const n = points.length;
    const mx = points.reduce((s, p) => s + p.right, 0) / n;
    const my = points.reduce((s, p) => s + p.up, 0) / n;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of points) {
        const [x, y] = [p.right - mx, p.up - my];
        sxx += x * x;
        syy += y * y;
        sxy += x * y;
    }
    const trace = sxx + syy;
    const diff = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy ** 2);
    const [major, minor] = [trace / 2 + diff, trace / 2 - diff];
    if (major <= 0 || major < minor * minElongation ** 2) return 0;
    const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy); // the major axis, from +right
    const goal = portrait ? Math.PI / 2 : 0;
    // An axis has no direction: turn by the smallest angle, within (-90°, 90°].
    let turn = goal - angle;
    while (turn > Math.PI / 2) turn -= Math.PI;
    while (turn <= -Math.PI / 2) turn += Math.PI;
    return turn;
}

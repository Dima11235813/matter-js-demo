/**
 * Coordinate hand-off between the 2D canvas and the 3D space (Epic 5, Task 5.4.1.3).
 *
 * 2D canvas: pixels, origin top-left, y down. 3D world: same units, origin at the canvas centre,
 * y up. The camera starts at the distance where the z = 0 plane maps 1:1 onto canvas pixels, so
 * switching 2D -> 3D looks identical until the layout inflates into depth.
 */
export type Size = [number, number];

/** A word on its way between dimensions: canvas pixels for 2D, world units for 3D. */
export interface WordHandoff {
    word: string;
    x: number;
    y: number;
    /** Box color, kept so words look the same after switching dimensions. */
    color?: string;
}

export function canvasToSpace([x, y]: [number, number], [width, height]: Size): [number, number] {
    return [x - width / 2, height / 2 - y];
}

export function spaceToCanvas([x, y]: [number, number], [width, height]: Size): [number, number] {
    return [x + width / 2, height / 2 - y];
}

/** Normalized device coordinates (-1..1, y up) to canvas pixels, clamped inside the canvas. */
export function ndcToCanvas([nx, ny]: [number, number], [width, height]: Size, margin = 40): [number, number] {
    const x = ((nx + 1) / 2) * width;
    const y = ((1 - ny) / 2) * height;
    return [clamp(x, margin, width - margin), clamp(y, margin, height - margin)];
}

/** Camera distance at which the z = 0 plane shows `height` world units across the viewport height. */
export function pixelMatchedDistance(height: number, fovDegrees: number): number {
    return height / 2 / Math.tan((fovDegrees * Math.PI) / 360);
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.min(Math.max(v, lo), Math.max(lo, hi));
}

/**
 * Camera distance at which a sphere of `radius` fits inside the view, limited by whichever of the
 * vertical or horizontal field of view is narrower.
 */
export function fitDistance(radius: number, fovDegrees: number, aspect: number): number {
    const vertical = (fovDegrees * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
    return radius / Math.sin(Math.min(vertical, horizontal) / 2);
}

/** Centroid and bounding radius (including each word's own radius) of a set of 3D positions. */
export function boundingSphere(points: ReadonlyArray<{ position: number[]; radius: number }>): { center: [number, number, number]; radius: number } {
    if (points.length === 0) return { center: [0, 0, 0], radius: 0 };
    const center = [0, 1, 2].map(k => points.reduce((sum, p) => sum + p.position[k], 0) / points.length) as [number, number, number];
    const radius = Math.max(...points.map(p => Math.hypot(p.position[0] - center[0], p.position[1] - center[1], p.position[2] - center[2]) + p.radius));
    return { center, radius };
}

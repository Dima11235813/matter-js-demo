/**
 * Coordinate hand-off between the 2D canvas and the 3D space (Epic 5, Task 5.4.1.3).
 *
 * 2D canvas: pixels, origin top-left, y down. 3D world: same units, origin at the canvas centre,
 * y up. The camera starts at the distance where the z = 0 plane maps 1:1 onto canvas pixels, so
 * switching 2D -> 3D looks identical until the layout inflates into depth.
 */
export type Size = [number, number];

/** A queued spawn (same shape as `WordSpawnRequest` in Deps, kept here so this module stays pure). */
export interface SpawnRequest {
    word: string;
    x?: number;
    y?: number;
    color?: string;
    focus?: boolean;
    focusGroup?: readonly string[];
}

/** The board a world leaves behind: words on it, plus spawns still queued (a new board, an answer). */
export interface BoardHandoff {
    view: string;
    words: WordHandoff[];
    pending: SpawnRequest[];
}

/**
 * The spawn queue a new world of `view` starts with: the handed-over words at their positions,
 * then the requests that were still queued, so a switch right after a play or a fresh board
 * loses nothing. Undefined when there is nothing to adopt or the view changed.
 */
export function handoffQueue(handoff: BoardHandoff | undefined, view: string): SpawnRequest[] | undefined {
    if (!handoff || handoff.view !== view) return undefined;
    const onBoard = new Set(handoff.words.map(w => w.word));
    const queue: SpawnRequest[] = [
        ...handoff.words.map(({ word, x, y, color }) => ({ word, x, y, color })),
        ...handoff.pending.filter(request => !onBoard.has(request.word) || request.focus || request.focusGroup),
    ];
    return queue.length > 0 ? queue : undefined;
}

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

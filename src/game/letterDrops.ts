/**
 * Letters mode drops (owner, 2026-10-06: "improve how the single letter drop looks and works so we
 * can't drop too many letters too quickly"). Before: a drag dropped a letter on almost every pointer
 * event (one 4-second drag left 30 letters), letters had random sizes (4 sizes in one drag), and random
 * colors. Pure: the pacing rule and the tile style.
 */
export const LETTER_DROPS = {
    /** At most one letter per this many milliseconds. */
    minIntervalMs: 220,
    /** A drag drops again only after the pointer moved this far (px) from the last drop. */
    minDragDistance: 40,
    /** Letters and merged pieces the board holds before asking the player to merge some. */
    maxOnBoard: 60,
    /** Every single letter is a square tile of this size (px). */
    tile: 36,
} as const;

export type DropVerdict = { ok: true } | { ok: false; reason: "tooFast" | "tooClose" | "full" };

export interface DropState {
    lastAt: number;
    lastX: number;
    lastY: number;
}

/** Whether a letter may drop at (x, y) now; `dragging` adds the distance rule (no stacks on one spot). */
export function canDrop(state: DropState | undefined, now: number, x: number, y: number, onBoard: number, dragging: boolean): DropVerdict {
    if (onBoard >= LETTER_DROPS.maxOnBoard) return { ok: false, reason: "full" };
    if (!state) return { ok: true };
    if (now - state.lastAt < LETTER_DROPS.minIntervalMs) return { ok: false, reason: "tooFast" };
    if (dragging && Math.hypot(x - state.lastX, y - state.lastY) < LETTER_DROPS.minDragDistance) return { ok: false, reason: "tooClose" };
    return { ok: true };
}

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

/** Tile color: vowels warm, consonants cool, each letter its own steady shade (helps spot what spells). */
export function letterTileColor(letter: string): string {
    const l = letter.toLowerCase();
    const index = Math.max(0, l.charCodeAt(0) - 97);
    if (VOWELS.has(l)) {
        const warm = ["#f6b04e", "#f28c4a", "#f7c95c", "#ee9a6a", "#f4a259"];
        return warm[["a", "e", "i", "o", "u"].indexOf(l)];
    }
    const cool = ["#5ab0c8", "#4f9fd6", "#62b8a7", "#6c9bd2", "#58c0b8", "#7aa7e0", "#4cb3a0"];
    return cool[index % cool.length];
}

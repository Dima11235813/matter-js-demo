import { puzzleKey } from "@lexical/shared";

/**
 * Connect-All results (Epic 2 · Tasks 2.10.5, 2.10.7): the best result per puzzle. Since IndexedDB v7 each
 * board's best is a record of its own that syncs (the `puzzles` collection; the play log never syncs), and
 * the v7 upgrade fills it from the play log. A puzzle is identified by its words, not only its number: a
 * generator or vocabulary change can deal a different board for the same number, and a best from another
 * board must not count.
 */
export interface PuzzleResult {
    /** Moves used: words added plus words removed. */
    moves: number;
    par: number;
}

/** A solved board, as the best-per-board record stores it. */
export interface PuzzleSolve extends PuzzleResult {
    /** The puzzle's own words (identifies the board). */
    words: string[];
    seed?: number;
    solvedAt: number;
}

/** The fields a solved puzzle writes to its `puzzle` play event. */
export interface PuzzlePlayPayload {
    seed: number;
    band: string;
    par: number;
    /** The puzzle's own words (identifies the board). */
    words: string[];
    /** The player's words on the board at the end. */
    moves: string[];
    /** Words the player added and removed again (each removal is a move). */
    removed: string[];
    moveCount: number;
}

export { puzzleKey };

/** Moves a puzzle used so far: every word added (including ones removed later) plus every removal. */
export function puzzleMoveCount(puzzle: { moves: readonly string[]; removed?: readonly string[] }): number {
    return puzzle.moves.length + 2 * (puzzle.removed?.length ?? 0);
}

/** The solve a `puzzle` play event records; undefined for other events and malformed payloads. */
export function puzzleSolveOf(event: { type: string; at?: number; payload: Record<string, unknown> }): PuzzleSolve | undefined {
    const { payload } = event;
    if (event.type !== "puzzle" || !Array.isArray(payload.words) || !payload.words.every(w => typeof w === "string")) return undefined;
    const moves = typeof payload.moveCount === "number" ? payload.moveCount : Array.isArray(payload.moves) ? payload.moves.length : undefined;
    if (moves === undefined || typeof payload.par !== "number") return undefined;
    return {
        words: payload.words as string[], moves, par: payload.par,
        ...(typeof payload.seed === "number" ? { seed: payload.seed } : {}),
        solvedAt: event.at ?? 0,
    };
}

/** True when `solve` is a new best for its board: fewer moves than `best` (a tie keeps the first). */
export function beatsBest(solve: PuzzleResult, best: PuzzleResult | undefined): boolean {
    return !best || solve.moves < best.moves;
}

/** Best (fewest moves) result for this board among `puzzle` play events; undefined when never solved. */
export function bestPuzzleResult(events: ReadonlyArray<{ type: string; payload: Record<string, unknown> }>, words: readonly string[]): PuzzleResult | undefined {
    const key = puzzleKey(words);
    let best: PuzzleResult | undefined;
    for (const event of events) {
        const solve = puzzleSolveOf(event);
        if (!solve || puzzleKey(solve.words) !== key) continue;
        if (beatsBest(solve, best)) best = { moves: solve.moves, par: solve.par };
    }
    return best;
}

/** The best solve per board key among play events (the v7 upgrade and play-log imports fold these in). */
export function bestSolvesByBoard(events: ReadonlyArray<{ type: string; at?: number; payload: Record<string, unknown> }>): Map<string, PuzzleSolve> {
    const bests = new Map<string, PuzzleSolve>();
    for (const event of events) {
        const solve = puzzleSolveOf(event);
        if (!solve || solve.words.length === 0) continue;
        const key = puzzleKey(solve.words);
        if (beatsBest(solve, bests.get(key))) bests.set(key, solve);
    }
    return bests;
}

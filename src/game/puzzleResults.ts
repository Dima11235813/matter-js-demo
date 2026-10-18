/**
 * Connect-All results (Epic 2 · Task 2.10.5): the best result per puzzle, read from the play log, so
 * results persist, export, and erase with it (no store of their own). The play log never syncs, so bests
 * stay on the device (syncing them: Task 2.10.7). A puzzle is identified by its
 * words, not only its number: a generator or vocabulary change can deal a different board for the same
 * number, and a best from another board must not count.
 */
export interface PuzzleResult {
    /** Moves used: words added plus words removed. */
    moves: number;
    par: number;
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

export function puzzleKey(words: readonly string[]): string {
    return [...words].sort().join(" ");
}

/** Moves a puzzle used so far: every word added (including ones removed later) plus every removal. */
export function puzzleMoveCount(puzzle: { moves: readonly string[]; removed?: readonly string[] }): number {
    return puzzle.moves.length + 2 * (puzzle.removed?.length ?? 0);
}

/** Best (fewest moves) result for this board among `puzzle` play events; undefined when never solved. */
export function bestPuzzleResult(events: ReadonlyArray<{ type: string; payload: Record<string, unknown> }>, words: readonly string[]): PuzzleResult | undefined {
    const key = puzzleKey(words);
    let best: PuzzleResult | undefined;
    for (const { type, payload } of events) {
        if (type !== "puzzle" || !Array.isArray(payload.words) || puzzleKey(payload.words as string[]) !== key) continue;
        const moves = typeof payload.moveCount === "number" ? payload.moveCount : Array.isArray(payload.moves) ? payload.moves.length : undefined;
        if (moves === undefined || typeof payload.par !== "number") continue;
        if (!best || moves < best.moves) best = { moves, par: payload.par };
    }
    return best;
}

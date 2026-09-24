/**
 * Analogies played on the current board, newest first, capped. Pure so the list rules are
 * unit-testable; `MenuStore` holds the list and the board lifecycle clears it.
 */
export const MAX_BOARD_ANALOGIES = 50;

export interface AnalogyWords {
    a: string;
    b: string;
    c: string;
    answer: string;
}

export function prependBoardAnalogy<T>(list: readonly T[], entry: T, max = MAX_BOARD_ANALOGIES): T[] {
    return [entry, ...list].slice(0, max);
}

/** The words an analogy focuses: its question and answer, without duplicates. */
export function analogyWords({ a, b, c, answer }: AnalogyWords): string[] {
    return [...new Set([a, b, c, answer])];
}

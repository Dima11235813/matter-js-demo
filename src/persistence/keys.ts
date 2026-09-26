/**
 * One normalizer for every natural key (Epic 6 · Task 6.1.1.2): trimmed, lowercased, Unicode NFC. Records
 * from two devices only merge if their keys match exactly, so "King", " king" and a decomposed
 * accent must all become the same key before anything is stored or synced.
 */
export function normalizeKey(word: string): string {
    return word.trim().toLowerCase().normalize("NFC");
}

/** The analogy collection's key: "a:b::c", from normalized words. */
export function analogyKey(a: string, b: string, c: string): string {
    return `${normalizeKey(a)}:${normalizeKey(b)}::${normalizeKey(c)}`;
}

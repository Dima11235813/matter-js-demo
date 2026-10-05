/**
 * Merge rules for letters mode (Epic 4 · Task 4.5.10). Two colliding boxes merge when their
 * combined text (in either order) is in `letterCombos[length]`; `wordLookup` holds whole words.
 *
 * "vocabulary": the game's own word list (plus common stopwords like "the"), and only prefixes:
 * pieces merge when they start a word, so words grow left to right. Measured on 40 sprinkled
 * letters x 4 trials: 3.8 real words (≥ 3 letters) vs 1.5 with the original dictionary's
 * any-substring rule, 8.5 vs 9.3 fragments, built in ~12 ms. Every vocabulary word it forms also
 * has an embedding, so it carries into Discovery (Feature 2.14).
 * "dictionary": the original game's dictionary (any substring), used when the vocabulary is not
 * available (see utils/textUtils.ts `DictionaryTools`).
 */
export interface LetterRules {
    readonly source: "vocabulary" | "dictionary";
    /** Index = combined length; value = how many words contain (vocabulary: start with) that text. */
    letterCombos: Record<string, number>[];
    wordLookup: Map<string, number>;
}

const LETTERS = /^[a-z]+$/;

/** Prefix merge rules from a word list; words outside 2..maxLength letters (a-z only) are skipped. */
export function prefixLetterRules(words: Iterable<string>, maxLength: number): LetterRules {
    const letterCombos: Record<string, number>[] = [];
    const wordLookup = new Map<string, number>();
    for (const raw of words) {
        const word = raw.toLowerCase();
        if (word.length < 2 || word.length > maxLength || !LETTERS.test(word) || wordLookup.has(word)) continue;
        wordLookup.set(word, 1);
        for (let k = 2; k <= word.length; k++) {
            const prefix = word.slice(0, k);
            const table = (letterCombos[k] ??= {});
            table[prefix] = (table[prefix] ?? 0) + 1;
        }
    }
    return { source: "vocabulary", letterCombos, wordLookup };
}

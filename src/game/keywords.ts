/**
 * Picks the words from a pasted text worth putting on the board (Epic 2 · Feature 2.8).
 * Score = count in the text × rarity, with the vocabulary's frequency rank as an IDF proxy, so
 * "photosynthesis" beats "people". Pure: the vocabulary is passed in as a `KeywordLexicon`.
 */
export interface KeywordLexicon {
    /** Frequency rank in the base vocabulary (0 = most common); undefined for unknown words. */
    rankOf(word: string): number | undefined;
    /** True for words the index knows (base vocabulary or player-added). */
    has(word: string): boolean;
    isAllowed(word: string): boolean;
    stopwords: ReadonlySet<string>;
    /** Base vocabulary size; unknown words are scored as rarer than any known word. */
    size: number;
}

export interface Keyword {
    word: string;
    count: number;
    score: number;
    /** Not in the vocabulary yet: needs the live encoder, and joins the player corpus. */
    isNew: boolean;
}

export interface KeywordResult {
    /** Every candidate, best first; the caller shows the first N and can reveal more. */
    ranked: Keyword[];
    distinctWords: number;
}

const WORD = /[a-z]+(?:['’][a-z]+)?/g;
const MIN_LENGTH = 3;
const MAX_LENGTH = 24;
/** A word the vocabulary does not know must appear this often to count (filters typos and names in passing). */
const MIN_NEW_WORD_COUNT = 2;

export function extractKeywords(text: string, lexicon: KeywordLexicon): KeywordResult {
    const counts = new Map<string, number>();
    const distinct = new Set<string>();
    for (const match of text.toLowerCase().matchAll(WORD)) {
        const token = stripPossessive(match[0]);
        if (!token) continue;
        distinct.add(token);
        if (token.length < MIN_LENGTH || token.length > MAX_LENGTH || lexicon.stopwords.has(token)) continue;
        const word = canonical(token, lexicon);
        counts.set(word, (counts.get(word) ?? 0) + 1);
    }

    const ranked: Keyword[] = [];
    for (const [word, count] of counts) {
        if (!lexicon.isAllowed(word)) continue;
        const known = lexicon.has(word);
        if (!known && count < MIN_NEW_WORD_COUNT) continue;
        const rank = lexicon.rankOf(word) ?? lexicon.size;
        ranked.push({ word, count, score: count * Math.log(2 + rank), isNew: !known });
    }
    ranked.sort((x, y) => y.score - x.score || x.word.localeCompare(y.word));
    return { ranked, distinctWords: distinct.size };
}

/** "dog's" -> "dog"; other contractions ("don't", "we'll") are function words: dropped. */
function stripPossessive(token: string): string | undefined {
    const apostrophe = token.search(/['’]/);
    if (apostrophe < 0) return token;
    return token.slice(apostrophe + 1) === "s" ? token.slice(0, apostrophe) : undefined;
}

/**
 * The vocabulary keeps singulars only (plurals of present words are dropped at build time), so a
 * plural in the text maps to its singular when the vocabulary has it: "cells" -> "cell",
 * "berries" -> "berry", "boxes" -> "box", "leaves" -> "leaf", "wolves" -> "wolf", "knives" -> "knife".
 * The f-plurals are tried before plain "s" because "leaves" is far more often leaf than leave.
 */
function canonical(token: string, lexicon: KeywordLexicon): string {
    if (!token.endsWith("s")) return token;
    const fPlural = token.match(/^(.+(?:l|ea|ar))ves$/)?.[1];
    const fePlural = token.match(/^(.+i)ves$/)?.[1];
    const fForm = [fPlural && `${fPlural}f`, fePlural && `${fePlural}fe`].find(c => c && lexicon.has(c));
    if (fForm) return fForm;
    if (lexicon.has(token)) return token;
    const candidates = [
        token.endsWith("ies") ? `${token.slice(0, -3)}y` : undefined,
        token.endsWith("es") ? token.slice(0, -2) : undefined,
        token.slice(0, -1),
    ];
    return candidates.find(c => c && c.length >= MIN_LENGTH && lexicon.has(c)) ?? token;
}

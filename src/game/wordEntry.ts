/**
 * What the player typed into the dashboard's word box (Epic 2 · Features 2.8, 2.9):
 *   - one word: add it to the board (and the corpus if new);
 *   - an expression with + and −: vector arithmetic, e.g. `king - man + woman`
 *     (also `man : king :: woman` and "man is to king as woman is to");
 *   - anything longer: a text to import keywords from.
 * Pure, so the grammar is unit-testable and shared with voice input later (Task 2.7.5).
 */
export interface ExpressionTerm {
    word: string;
    sign: 1 | -1;
}

export type WordEntry =
    | { kind: "empty" }
    | { kind: "word"; word: string }
    | { kind: "expression"; terms: ExpressionTerm[] }
    | { kind: "text"; text: string }
    | { kind: "error"; message: string };

const TERM = /^[a-z]{2,24}$/;
/** Unicode minus and en/em dashes are always operators; an ASCII hyphen only with spaces around it. */
const ALWAYS_MINUS = /[−–—]/g;
const ANALOGY_COLONS = /^\s*([a-z]+)\s*:\s*([a-z]+)\s*::\s*([a-z]+)(?:\s*:\s*\??)?\s*$/;
const ANALOGY_WORDS = /^\s*([a-z]+)\s+is\s+to\s+([a-z]+)\s+as\s+([a-z]+)(?:\s+is\s+to)?\s*\??\s*$/;

export function parseEntry(raw: string): WordEntry {
    const input = raw.trim().toLowerCase();
    if (!input) return { kind: "empty" };

    const analogy = input.match(ANALOGY_COLONS) ?? input.match(ANALOGY_WORDS);
    if (analogy) {
        const [, a, b, c] = analogy;
        return { kind: "expression", terms: [{ word: b, sign: 1 }, { word: a, sign: -1 }, { word: c, sign: 1 }] };
    }

    // Normalize operators into standalone tokens: "+" anywhere, dashes always, "-" only between spaces
    // (or leading), so hyphenated words like "well-known" stay one token.
    const spaced = ` ${input.replace(ALWAYS_MINUS, " - ").replace(/\+/g, " + ")} `;
    const tokens = spaced.split(/\s+/).filter(Boolean);
    const hasOperator = tokens.some(t => t === "+" || t === "-");
    if (!hasOperator) {
        if (tokens.length === 1) return { kind: "word", word: tokens[0] };
        return { kind: "text", text: raw.trim() };
    }
    return parseExpression(tokens);
}

function parseExpression(tokens: string[]): WordEntry {
    const terms: ExpressionTerm[] = [];
    let sign: 1 | -1 = 1;
    let expectTerm = true;
    for (const token of tokens) {
        if (token === "+" || token === "-") {
            if (!expectTerm) {
                sign = token === "-" ? -1 : 1;
                expectTerm = true;
                continue;
            }
            if (terms.length > 0) return { kind: "error", message: `Two operators in a row before "${token}"` };
            sign = token === "-" ? -1 : 1; // a leading sign: "- man + king"
            continue;
        }
        if (!expectTerm) return { kind: "error", message: `Put + or − between "${terms[terms.length - 1].word}" and "${token}"` };
        if (!TERM.test(token)) return { kind: "error", message: `"${token}" is not a word (2-24 letters a-z)` };
        terms.push({ word: token, sign });
        sign = 1;
        expectTerm = false;
    }
    if (expectTerm) return { kind: "error", message: "Add a word after the last operator" };
    if (terms.length < 2) return { kind: "error", message: "An expression needs at least two words" };
    const words = new Set<string>();
    for (const { word } of terms) {
        if (words.has(word)) return { kind: "error", message: `"${word}" appears twice` };
        words.add(word);
    }
    return { kind: "expression", terms };
}

/**
 * The analogy an expression spells, if it is exactly `b - a + c` (in any order): one negative term,
 * two positive. The first positive term is b, the second c: `king - man + woman` is man : king :: woman.
 */
export function expressionAsAnalogy(terms: readonly ExpressionTerm[]): { a: string; b: string; c: string } | undefined {
    if (terms.length !== 3) return undefined;
    const negative = terms.filter(t => t.sign === -1);
    const positive = terms.filter(t => t.sign === 1);
    if (negative.length !== 1 || positive.length !== 2) return undefined;
    return { a: negative[0].word, b: positive[0].word, c: positive[1].word };
}

/** `king − man + woman`, for display. */
export function formatExpression(terms: readonly ExpressionTerm[]): string {
    return terms.map((t, i) => (i === 0 ? (t.sign === -1 ? `−${t.word}` : t.word) : `${t.sign === -1 ? "−" : "+"} ${t.word}`)).join(" ");
}

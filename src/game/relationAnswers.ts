import { AnalogyResult, isInflectionOf, isMorphologicalQuestion, sharesStem, solveAnalogy } from "../embeddings/analogy";
import { normalizeInPlace } from "../embeddings/vectorMath";
import { VectorIndex } from "../embeddings/VectorIndex";
import { RelationBank, RelationPair } from "./relationPairs";

/**
 * Knowledge-grounded analogy answers (Epic 2 · Feature 2.17; docs/research/analogy-recognition.md). On everyday
 * relations the vectors alone are right about 15% of the time, barely above no analogy at all, while knowing the
 * relation is what works. So a : b :: c is answered in this order:
 *   1. bank:     a → b is a known relation pair and c has a pair in that relation: its word, exactly; or the
 *                swapped form (a → c known, b in it: man : king :: woman → man → woman applied to king = queen);
 *   2. relation: a → b is a known pair but c isn't in the bank: c + the relation's average offset (3CosAvg;
 *                +7 points top 1 on the Google set, +10 top 5 on everyday relations);
 *   3. model:    the relation is unknown: the vectors (3CosAdd), labelled as the model's guess.
 */
export type AnswerSource = "bank" | "relation" | "model";

export interface SourcedAnalogy extends AnalogyResult {
    source: AnswerSource;
    /** The bank category a → b belongs to (bank and relation answers). */
    category?: string;
}

/** The bank category where a → b is a pair, and whether the question reads it backwards (b → a). */
export function findRelation(bank: RelationBank, a: string, b: string): { category: string; reversed: boolean } | undefined {
    for (const [category, pairs] of bank) {
        for (const p of pairs) {
            if (p.x === a && p.y === b) return { category, reversed: false };
            if (p.y === a && p.x === b) return { category, reversed: true };
        }
    }
    return undefined;
}

/** The bank's answer for c in the relation (c's partner in the same direction as a → b), if c is in it. */
export function bankAnswer(pairs: readonly RelationPair[], reversed: boolean, c: string, exclude: readonly string[]): string | undefined {
    for (const p of pairs) {
        const [from, to] = reversed ? [p.y, p.x] : [p.x, p.y];
        if (from === c && !exclude.includes(to)) return to;
    }
    return undefined;
}

/**
 * Solves a : b :: c with the relation bank first (see above). `allow` filters words (the profanity policy).
 * Returns undefined when a word has no vector.
 */
export function solveWithBank(
    index: VectorIndex,
    bank: RelationBank,
    a: string,
    b: string,
    c: string,
    allow?: (word: string) => boolean,
    alternatives = 5
): SourcedAnalogy | undefined {
    const [va, vb, vc] = [a, b, c].map(w => index.getVector(w));
    if (!va || !vb || !vc) return undefined;
    const inputs = [a, b, c];
    const usable = (word: string | undefined): word is string => !!word && index.has(word) && (!allow || allow(word));
    const match = findRelation(bank, a, b);
    // The swapped form: a : b :: c : d holds exactly when a : c :: b : d (man : king :: woman is man → woman,
    // a known pair, applied to king). Only for exact bank answers.
    const swapped = findRelation(bank, a, c);
    const swappedAnswer = swapped ? bankAnswer(bank.get(swapped.category) ?? [], swapped.reversed, b, inputs) : undefined;
    if (!(match && usable(bankAnswer(bank.get(match.category) ?? [], match.reversed, c, inputs))) && swapped && usable(swappedAnswer)) {
        const model = solveAnalogy(index, a, b, c, allow, alternatives + 1);
        const target = index.getVector(swappedAnswer)!;
        let similarity = 0;
        const t = new Float32Array(index.dim);
        for (let d = 0; d < t.length; d++) t[d] = vb[d] - va[d] + vc[d];
        normalizeInPlace(t);
        for (let d = 0; d < t.length; d++) similarity += t[d] * target[d];
        const rest = model ? [{ word: model.answer, similarity: model.similarity }, ...model.alternatives] : [];
        return {
            a, b, c, answer: swappedAnswer, similarity, alternatives: rest.filter(n => n.word !== swappedAnswer).slice(0, alternatives),
            source: "bank", category: swapped.category,
        };
    }
    if (!match) {
        const model = solveAnalogy(index, a, b, c, allow, alternatives);
        return model && { ...model, source: "model" };
    }

    // The relation's average offset (in the question's direction) over its pairs with vectors.
    const pairs = bank.get(match.category) ?? [];
    const offset = new Float32Array(index.dim);
    let counted = 0;
    for (const p of pairs) {
        const [from, to] = match.reversed ? [p.y, p.x] : [p.x, p.y];
        const [vf, vt] = [index.getVector(from), index.getVector(to)];
        if (!vf || !vt) continue;
        for (let d = 0; d < offset.length; d++) offset[d] += vt[d] - vf[d];
        counted++;
    }
    const target = new Float32Array(index.dim);
    for (let d = 0; d < target.length; d++) target[d] = vc[d] + (counted ? offset[d] / counted : vb[d] - va[d]);
    normalizeInPlace(target);

    const isVariant = isMorphologicalQuestion(a, b) ? isInflectionOf : sharesStem;
    const allowCandidate = (word: string) => (!allow || allow(word)) && !inputs.some(input => isVariant(word, input));
    const ranked = index.nearest(target, { k: alternatives + 2, exclude: new Set(inputs), allow: allowCandidate });
    const similarityTo = (word: string) => {
        const v = index.getVector(word)!;
        let s = 0;
        for (let d = 0; d < v.length; d++) s += v[d] * target[d];
        return s;
    };

    const known = bankAnswer(pairs, match.reversed, c, inputs);
    if (usable(known)) {
        return {
            a, b, c, answer: known, similarity: similarityTo(known),
            alternatives: ranked.filter(n => n.word !== known).slice(0, alternatives),
            source: "bank", category: match.category,
        };
    }
    if (ranked.length === 0) return undefined;
    const [best, ...rest] = ranked;
    return { a, b, c, answer: best.word, similarity: best.similarity, alternatives: rest.slice(0, alternatives), source: "relation", category: match.category };
}

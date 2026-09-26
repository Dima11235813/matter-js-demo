import { analogyTarget, normalizeInPlace } from "./vectorMath";
import { Neighbor, VectorIndex } from "./VectorIndex";

export interface AnalogyResult {
    a: string;
    b: string;
    c: string;
    answer: string;
    similarity: number;
    /** Runner-up answers, best first, excluding `answer`. */
    alternatives: Neighbor[];
}

/**
 * True when `candidate` is just a spelling variant of `input` (king -> kings, box -> boxes).
 * 3CosAdd reliably lands next to the query words themselves, so these are excluded the same
 * way the query words are.
 */
export function isInflectionOf(candidate: string, input: string): boolean {
    const [shorter, longer] = candidate.length <= input.length ? [candidate, input] : [input, candidate];
    if (!longer.startsWith(shorter)) return false;
    const suffix = longer.slice(shorter.length);
    return suffix === "s" || suffix === "es" || suffix === "'s";
}

/**
 * True when two words are forms of one stem: one is a prefix of the other (summer / summertime,
 * fish / fishing), or they differ only after a long shared prefix that covers all but the last
 * letter of the shorter word (arrive / arriving, create / creation).
 */
export function sharesStem(candidate: string, input: string): boolean {
    const shorter = Math.min(candidate.length, input.length);
    if (shorter < 3) return false;
    if (candidate.startsWith(input) || input.startsWith(candidate)) return true;
    let common = 0;
    while (common < shorter && candidate[common] === input[common]) common++;
    return common >= 5 && common >= shorter - 1;
}

/**
 * A question is morphological when b is a word form of a (big -> bigger, walk -> walked).
 * Then the answer is expected to share c's stem (small -> smaller), so stem filtering is skipped.
 */
export function isMorphologicalQuestion(a: string, b: string): boolean {
    return sharesStem(b, a);
}

/**
 * Solves "a is to b as c is to ?" with 3CosAdd over the centered space.
 * For semantic questions, candidates sharing a stem with any input are excluded: 3CosAdd lands
 * close to c, and without this "hot : cold :: summer" answers "summertime" instead of "winter".
 * Returns undefined when any of the three words has no vector.
 */
export function solveAnalogy(
    index: VectorIndex,
    a: string,
    b: string,
    c: string,
    allow?: (word: string) => boolean,
    alternatives = 5
): AnalogyResult | undefined {
    const [va, vb, vc] = [a, b, c].map(w => index.getVector(w));
    if (!va || !vb || !vc) return undefined;

    const inputs = [a, b, c];
    const exclude = new Set(inputs);
    const isVariant = isMorphologicalQuestion(a, b) ? isInflectionOf : sharesStem;
    const allowCandidate = (word: string) =>
        (!allow || allow(word)) && !inputs.some(input => isVariant(word, input));

    const ranked = index.nearest(analogyTarget(va, vb, vc), { k: alternatives + 1, exclude, allow: allowCandidate });
    if (ranked.length === 0) return undefined;
    const [best, ...rest] = ranked;
    return { a, b, c, answer: best.word, similarity: best.similarity, alternatives: rest };
}

export interface SignedWord {
    word: string;
    sign: 1 | -1;
}

/**
 * Nearest words to a signed sum of word vectors (`ocean + desert`, `paris - france + italy`).
 * Like semantic analogies, candidates sharing a stem with any input are excluded. Returns undefined
 * when a word has no vector.
 */
export function solveExpression(
    index: VectorIndex,
    terms: readonly SignedWord[],
    allow?: (word: string) => boolean,
    k = 6
): Neighbor[] | undefined {
    const target = new Float32Array(index.dim);
    for (const { word, sign } of terms) {
        const vector = index.getVector(word);
        if (!vector) return undefined;
        for (let d = 0; d < target.length; d++) target[d] += sign * vector[d];
    }
    const inputs = terms.map(t => t.word);
    const allowCandidate = (word: string) => (!allow || allow(word)) && !inputs.some(input => sharesStem(word, input));
    return index.nearest(normalizeInPlace(target), { k, exclude: new Set(inputs), allow: allowCandidate });
}

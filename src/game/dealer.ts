import { sharesStem } from "../embeddings/analogy";
import { VectorIndex } from "../embeddings/VectorIndex";

export interface DealOptions {
    count: number;
    /** Words already in play; dealt words never repeat or share a stem with these. */
    inPlay: Iterable<string>;
    allow: (word: string) => boolean;
    /** Minimum similarity for a partner word (typically calibration p99). */
    partnerThreshold: number;
    /** Seeds come from the most common words so hands stay recognisable. */
    seedMaxRank?: number;
    partnerMaxRank?: number;
    random?: () => number;
}

/**
 * Deals words in related pairs (a common seed plus one close neighbour) so every hand contains
 * visible relationships: in hint mode each pair forms an orbit, and pairs give analogies a
 * meaningful "a is to b" to start from. An odd count ends with a lone seed.
 */
export function dealWords(index: VectorIndex, options: DealOptions): string[] {
    const { count, allow, partnerThreshold, seedMaxRank = 3000, partnerMaxRank = 12000, random = Math.random } = options;
    const taken = new Set(options.inPlay);
    const dealt: string[] = [];
    const isFree = (word: string) =>
        allow(word) && !taken.has(word) && ![...taken].some(t => sharesStem(word, t));
    const take = (word: string) => { taken.add(word); dealt.push(word); };

    const seedLimit = Math.min(seedMaxRank, index.baseSize);
    for (let guard = 0; dealt.length < count && guard < count * 40; guard++) {
        const seed = index.baseWordAt(Math.floor(random() * seedLimit));
        if (!isFree(seed)) continue;
        take(seed);
        if (dealt.length >= count) break;
        const partner = findPartner(index, seed, isFree, partnerThreshold, partnerMaxRank);
        if (partner) take(partner);
    }
    return dealt;
}

function findPartner(
    index: VectorIndex,
    seed: string,
    isFree: (word: string) => boolean,
    threshold: number,
    maxRank: number
): string | undefined {
    const vector = index.getVector(seed);
    if (!vector) return undefined;
    const withinRank = (word: string) => (index.rankOf(word) ?? Infinity) <= maxRank;
    const [best] = index.nearest(vector, { k: 1, allow: w => w !== seed && withinRank(w) && isFree(w) });
    return best && best.similarity >= threshold ? best.word : undefined;
}

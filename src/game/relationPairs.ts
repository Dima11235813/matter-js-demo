import { sharesStem } from "../embeddings/analogy";

/**
 * Designed questions for timed rounds (Epic 2 · Feature 2.11; docs/research/analogy-scoring.md §7).
 * A round deals relation pairs (france → paris, man → woman) from analogy categories; a play
 * scores when its answer completes a dealt pair of the same category, in the same direction.
 * Pure: the bank, dealing, and scoring are unit-tested; the controller owns side effects.
 */
export interface RelationPair {
    x: string;
    y: string;
    category: string;
}

export type RelationBank = ReadonlyMap<string, readonly RelationPair[]>;

/** Parses `: category` headers followed by `x y` lines; # starts a comment. */
export function parseRelationBank(text: string): RelationBank {
    const bank = new Map<string, RelationPair[]>();
    let category = "";
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        if (line.startsWith(":")) {
            category = line.slice(1).trim();
            bank.set(category, []);
            continue;
        }
        const [x, y] = line.toLowerCase().split(/\s+/);
        if (category && x && y) bank.get(category)!.push({ x, y, category });
    }
    return bank;
}

/** Friendly names for the HUD ("Relation: capitals"). */
export function categoryLabel(category: string): string {
    const labels: Record<string, string> = {
        "capital-common-countries": "capitals",
        "capital-world": "capitals",
        "city-in-state": "city → state",
        family: "family",
        "gram2-opposite": "opposites",
        "gram3-comparative": "comparatives",
        "gram4-superlative": "superlatives",
        "gram5-present-participle": "-ing forms",
        "gram6-nationality-adjective": "nationalities",
        "gram7-past-tense": "past tense",
    };
    return labels[category] ?? category.replace(/^gram\d+-/, "").replace(/-/g, " ");
}

export interface DealRelationOptions {
    /** Pairs from the round's main category (the relation to discover). */
    mainPairs: number;
    /** Pairs from one other category (decoys that still form analogies among themselves). */
    otherPairs: number;
    /** Words already in play: dealt words never repeat or share a stem with these. */
    inPlay?: Iterable<string>;
    /** Force the main category (reward deals keep the round's relation). */
    category?: string;
    allow?: (word: string) => boolean;
    random?: () => number;
}

export interface RelationDeal {
    category: string;
    pairs: RelationPair[];
    words: string[];
}

/**
 * Deals `mainPairs` pairs from one category plus `otherPairs` from another, stem-free across pairs
 * (a pair may share a stem within itself: big → bigger). Returns what it could deal.
 */
export function dealRelationPairs(bank: RelationBank, options: DealRelationOptions): RelationDeal {
    const { mainPairs, otherPairs, allow = () => true, random = Math.random } = options;
    const taken = [...(options.inPlay ?? [])];
    const sized = (min: number) => [...bank.keys()].filter(c => (bank.get(c)?.length ?? 0) >= min);
    // The main category needs a spare pair so reward deals can keep the relation going.
    const mainCategories = sized(mainPairs + 1);
    const category = options.category ?? mainCategories[Math.floor(random() * mainCategories.length)];
    const pairs: RelationPair[] = [];
    const isFree = (word: string) => allow(word) && !taken.includes(word) && !taken.some(t => sharesStem(t, word));
    const pick = (from: string, count: number) => {
        const pool = [...(bank.get(from) ?? [])];
        while (count > 0 && pool.length > 0) {
            const [pair] = pool.splice(Math.floor(random() * pool.length), 1);
            if (!isFree(pair.x) || !isFree(pair.y)) continue;
            taken.push(pair.x, pair.y);
            pairs.push(pair);
            count--;
        }
    };
    pick(category, mainPairs);
    if (otherPairs > 0) {
        const others = sized(otherPairs).filter(c => c !== category);
        if (others.length > 0) pick(others[Math.floor(random() * others.length)], otherPairs);
    }
    return { category, pairs, words: pairs.flatMap(p => [p.x, p.y]) };
}

/**
 * The word that completes a designed play: a → b is a dealt pair and c starts (or ends) another pair
 * of the same category, in the same direction. Undefined when (a, b, c) is not a designed play.
 */
export function designedAnswer(pairs: readonly RelationPair[], a: string, b: string, c: string): string | undefined {
    for (const p of pairs) {
        const forward = p.x === a && p.y === b;
        const backward = p.y === a && p.x === b;
        if (!forward && !backward) continue;
        for (const q of pairs) {
            if (q === p || q.category !== p.category) continue;
            if (forward && q.x === c) return q.y;
            if (backward && q.y === c) return q.x;
        }
    }
    return undefined;
}

export type PlayVerdict = "full" | "penalty" | "none";

export interface RelationSimilarities {
    /** Answer to c, a, and b. */
    dc: number;
    da: number;
    db: number;
}

export interface DesignedScore {
    verdict: PlayVerdict;
    points: number;
    /** The word the play lands on: the designed answer when it is among the top answers, else the solver's first. */
    answer: string;
}

export const DESIGNED_POINTS = { full: 100, penalty: -10 } as const;
/** A designed answer anywhere in the solver's top 3 counts (research §7: skilled 55.8 -> 68.9, random unchanged). */
export const DESIGNED_TOP_K = 3;

/**
 * Scores a timed-round play. Full when the designed answer is among the solver's top `DESIGNED_TOP_K`
 * answers; a penalty when the answer connects to a or b (>= link) but not to c (< nearThreshold), i.e. it
 * fell back onto the first pair; otherwise nothing. Partial credit was dropped: it made guessing pay.
 */
export function scoreDesignedPlay(
    pairs: readonly RelationPair[],
    a: string,
    b: string,
    c: string,
    ranked: readonly string[],
    similarities: RelationSimilarities,
    thresholds: { link: number; near: number }
): DesignedScore {
    const expected = designedAnswer(pairs, a, b, c);
    if (expected && ranked.slice(0, DESIGNED_TOP_K).includes(expected)) {
        return { verdict: "full", points: DESIGNED_POINTS.full, answer: expected };
    }
    const answer = ranked[0];
    const { dc, da, db } = similarities;
    if (dc < thresholds.near && Math.max(da, db) >= thresholds.link) {
        return { verdict: "penalty", points: DESIGNED_POINTS.penalty, answer };
    }
    return { verdict: "none", points: 0, answer };
}

export interface GuessGrade {
    /** a → b and c → d are two different dealt pairs of one relation, in the same direction. */
    correct: boolean;
    /** The shared relation of a correct guess. */
    category?: string;
    points: number;
}

/** Guess mode: a correct four-word analogy earns this; anything else earns nothing (no penalty). */
export const GUESS_POINTS = 100;

/**
 * Grades a four-word guess a : b :: c : d against the round's dealt pairs (Epic 2 · Feature 2.13).
 * Correct when a → b and c → d are different pairs of the same category, both forward or both
 * reversed. This is research §7's "board-only" case: skilled 94.6 points per play, random −0.7.
 */
export function gradeGuess(pairs: readonly RelationPair[], a: string, b: string, c: string, d: string): GuessGrade {
    const [wa, wb, wc, wd] = [a, b, c, d].map(w => w.toLowerCase());
    for (const p of pairs) {
        const forward = p.x === wa && p.y === wb;
        const backward = p.y === wa && p.x === wb;
        if (!forward && !backward) continue;
        for (const q of pairs) {
            if (q === p || q.category !== p.category) continue;
            if ((forward && q.x === wc && q.y === wd) || (backward && q.y === wc && q.x === wd)) {
                return { correct: true, category: p.category, points: GUESS_POINTS };
            }
        }
    }
    return { correct: false, points: 0 };
}

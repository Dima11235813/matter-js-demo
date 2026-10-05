/**
 * Skill rating → puzzle complexity (Epic 2 · Feature 2.12). Elo-style: a player's rating moves after
 * every graded guess against the difficulty of the relation it was played in, and each Guess round
 * deals its main relation from the categories nearest the rating. Each account (persona) keeps its
 * own rating, so test personas see different games.
 *
 * Difficulties are priors on the Elo scale, ordered by how familiar each relation is to a player
 * (everyday family words and opposites first; world capitals and US city → state last). The model's
 * own completion rates (analogy-scoring §7) don't apply here: Guess mode grades exact picks, so
 * difficulty is about human knowledge. Calibrate from real play logs later (Task 2.12.1 follow-up).
 */
export const CATEGORY_DIFFICULTY: Readonly<Record<string, number>> = {
    family: 800,
    "gram2-opposite": 850,
    "gram3-comparative": 900,
    "gram5-present-participle": 900,
    "gram4-superlative": 950,
    "gram7-past-tense": 950,
    "capital-common-countries": 1150,
    "gram6-nationality-adjective": 1200,
    "capital-world": 1450,
    "city-in-state": 1500,
};

export const RATING_RULES = {
    start: 1000,
    min: 100,
    max: 3000,
    /** Update size; larger for the first plays so a new player finds their level quickly. */
    k: 32,
    kProvisional: 64,
    provisionalPlays: 10,
} as const;

export interface Rating {
    value: number;
    plays: number;
}

export const NEW_RATING: Rating = { value: RATING_RULES.start, plays: 0 };

/** Probability a player of `rating` gets a guess right in a relation of `difficulty` (Elo logistic). */
export function expectedScore(rating: number, difficulty: number): number {
    return 1 / (1 + 10 ** ((difficulty - rating) / 400));
}

export function difficultyOf(category: string): number {
    return CATEGORY_DIFFICULTY[category] ?? RATING_RULES.start;
}

/** The rating after one graded guess: up when right, down when wrong, by how surprising that was. Bounded. */
export function rateGuess(rating: Rating, difficulty: number, correct: boolean): Rating {
    const k = rating.plays < RATING_RULES.provisionalPlays ? RATING_RULES.kProvisional : RATING_RULES.k;
    const next = rating.value + k * ((correct ? 1 : 0) - expectedScore(rating.value, difficulty));
    return { value: Math.round(Math.min(RATING_RULES.max, Math.max(RATING_RULES.min, next))), plays: rating.plays + 1 };
}

/**
 * The relation a round should deal for this rating: one of the `spread` categories whose difficulty is
 * nearest the rating, chosen at random so a player doesn't see the same relation every round.
 */
export function pickCategory(rating: number, categories: readonly string[], random: () => number = Math.random, spread = 3): string {
    const nearest = [...categories].sort((a, b) => Math.abs(difficultyOf(a) - rating) - Math.abs(difficultyOf(b) - rating) || a.localeCompare(b));
    const pool = nearest.slice(0, Math.max(1, Math.min(spread, nearest.length)));
    return pool[Math.floor(random() * pool.length)];
}

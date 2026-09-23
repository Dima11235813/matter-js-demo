/**
 * Pure rules for the timed analogy game. The store and controller own time and side effects;
 * these functions only compute the next state, so every rule is unit-testable.
 *
 * Word supply is deliberately scarce: a round starts with a fixed hand of words, and more are
 * dealt only when the score crosses each `rewardEveryPoints` milestone, up to a hard cap.
 */
export interface TimedGameRules {
    durationMs: number;
    initialWords: number;
    rewardEveryPoints: number;
    wordsPerReward: number;
    /** Cap on dealt words per round (analogy answers still spawn beyond it). */
    maxDealtWords: number;
}

export const TIMED_RULES_VERSION = 1;

export const defaultTimedRules: TimedGameRules = {
    durationMs: 120_000,
    initialWords: 10,
    rewardEveryPoints: 150,
    wordsPerReward: 2,
    maxDealtWords: 30,
};

export type GamePhase = "running" | "over";

export interface TimedGameState {
    phase: GamePhase;
    startedAt: number;
    endsAt: number;
    score: number;
    analogies: number;
    dealt: number;
    rewardsGranted: number;
    playedQuestions: readonly string[];
}

export interface PlayOutcome {
    state: TimedGameState;
    points: number;
    duplicate: boolean;
    wordsToDeal: number;
}

/** Points for one analogy: cosine of the answer to the target, as a percentage, minimum 10. */
export function analogyPoints(similarity: number): number {
    return Math.max(10, Math.round(similarity * 100));
}

export function startGame(now: number, rules: TimedGameRules = defaultTimedRules): TimedGameState {
    return {
        phase: "running",
        startedAt: now,
        endsAt: now + rules.durationMs,
        score: 0,
        analogies: 0,
        dealt: rules.initialWords,
        rewardsGranted: 0,
        playedQuestions: [],
    };
}

export function remainingMs(state: TimedGameState, now: number): number {
    return state.phase === "over" ? 0 : Math.max(0, state.endsAt - now);
}

export function tick(state: TimedGameState, now: number): TimedGameState {
    return state.phase === "running" && now >= state.endsAt ? { ...state, phase: "over" } : state;
}

export function nextRewardAt(state: TimedGameState, rules: TimedGameRules = defaultTimedRules): number | undefined {
    if (state.dealt >= rules.maxDealtWords) return undefined;
    return (state.rewardsGranted + 1) * rules.rewardEveryPoints;
}

/** Scores a played analogy. Repeating a question within a round scores nothing. */
export function applyPlay(
    state: TimedGameState,
    questionKey: string,
    similarity: number,
    now: number,
    rules: TimedGameRules = defaultTimedRules
): PlayOutcome {
    const live = tick(state, now);
    if (live.phase !== "running") return { state: live, points: 0, duplicate: false, wordsToDeal: 0 };
    if (live.playedQuestions.includes(questionKey)) return { state: live, points: 0, duplicate: true, wordsToDeal: 0 };

    const points = analogyPoints(similarity);
    const score = live.score + points;
    const milestones = Math.floor(score / rules.rewardEveryPoints);
    const newRewards = Math.max(0, milestones - live.rewardsGranted);
    const wordsToDeal = Math.min(newRewards * rules.wordsPerReward, rules.maxDealtWords - live.dealt);
    return {
        points,
        duplicate: false,
        wordsToDeal: Math.max(0, wordsToDeal),
        state: {
            ...live,
            score,
            analogies: live.analogies + 1,
            dealt: live.dealt + Math.max(0, wordsToDeal),
            rewardsGranted: live.rewardsGranted + newRewards,
            playedQuestions: [...live.playedQuestions, questionKey],
        },
    };
}

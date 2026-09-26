import deps from "../matterJsComp/Deps";
import { AnalogyResult } from "../embeddings/analogy";
import { applyPlay, PlayOutcome, startGame, tick, TIMED_RULES_VERSION, TimedGameState } from "../game/timedGame";
import { DesignedScore, scoreDesignedPlay } from "../game/relationPairs";
import { analogyKey } from "../persistence/LexicalRepository";
import { RootStore } from "../stores/RootStore";
import { logger } from "../utils/logger";
import { semanticEngine } from "./semanticEngine";

/**
 * Runs timed rounds: deals the opening hand, ticks the clock, scores analogies through the pure
 * rules in game/timedGame.ts, deals reward words, and saves the result when time runs out.
 * A round is abandoned (not saved) if the player leaves the game view.
 */
const TICK_MS = 200;
let timer: ReturnType<typeof setInterval> | undefined;

export function startTimedRound(stores: RootStore): void {
    if (!semanticEngine.isReady) return;
    stopTimer();
    const { gameStore, menuStore } = stores;
    deps.activeWorld?.clearWordBoxes();
    menuStore.clearWordSelection();
    menuStore.clearLastPlay();
    menuStore.clearBoardAnalogies();
    gameStore.setLastRoundPoints(null);

    const now = Date.now();
    gameStore.setNow(now);
    gameStore.setGame(startGame(now, gameStore.rules));
    // Designed questions: 3 pairs share the round's relation, 2 more come from another relation.
    const deal = semanticEngine.dealRelationPairs({ mainPairs: 3, otherPairs: 2 });
    gameStore.setRelationDeal(deal);
    queueWords(deal.words);
    timer = setInterval(() => tickRound(stores), TICK_MS);
}

/**
 * Scores a played analogy against the round's dealt relation pairs (designed questions) and deals
 * reward pairs of the round's relation when earned. `answer` is the word the play lands on.
 */
export function recordRoundAnalogy(stores: RootStore, result: AnalogyResult): (PlayOutcome & DesignedScore) | undefined {
    const { gameStore } = stores;
    const deal = gameStore.relationDeal;
    if (!gameStore.game || !deal) return undefined;
    const { a, b, c } = result;
    const ranked = [result.answer, ...result.alternatives.map(n => n.word)];
    const stats = semanticEngine.relationStats(a, b, c, result.answer);
    const { p95, p99 } = semanticEngine.calibration;
    const scored = scoreDesignedPlay(deal.pairs, a, b, c, ranked, stats ?? { dc: 1, da: 0, db: 0 }, { link: p99, near: p95 });
    const outcome = applyPlay(gameStore.game, analogyKey(a, b, c), scored.points, Date.now(), gameStore.rules);
    gameStore.setGame(outcome.state);
    gameStore.setLastRoundPoints({ points: outcome.points, duplicate: outcome.duplicate });
    if (outcome.wordsToDeal > 0) {
        const reward = semanticEngine.dealRelationPairs({ mainPairs: Math.ceil(outcome.wordsToDeal / 2), otherPairs: 0, category: deal.category, inPlay: wordsInPlay() });
        gameStore.setRelationDeal({ ...deal, pairs: [...deal.pairs, ...reward.pairs], words: [...deal.words, ...reward.words] });
        queueWords(reward.words);
    }
    if (outcome.state.phase === "over") void finishRound(stores, outcome.state);
    return { ...outcome, ...scored, points: outcome.points };
}

export function isRoundRunning(stores: RootStore): boolean {
    return stores.gameStore.game?.phase === "running";
}

function tickRound(stores: RootStore): void {
    const { gameStore, menuStore } = stores;
    if (menuStore.view !== "game" || !gameStore.game) {
        stopTimer();
        gameStore.setGame(null);
        return;
    }
    const now = Date.now();
    gameStore.setNow(now);
    const next = tick(gameStore.game, now);
    if (next !== gameStore.game) {
        gameStore.setGame(next);
        void finishRound(stores, next);
    }
}

async function finishRound(stores: RootStore, state: TimedGameState): Promise<void> {
    stopTimer();
    stores.privacyStore.noteRoundFinished();
    const { gameStore, menuStore } = stores;
    menuStore.clearWordSelection();
    try {
        const previousBest = gameStore.bestScore;
        await semanticEngine.saveGame({
            mode: "timed",
            rulesVersion: TIMED_RULES_VERSION,
            startedAt: state.startedAt,
            endedAt: Math.min(Date.now(), state.endsAt),
            score: state.score,
            analogies: state.analogies,
            wordsDealt: state.dealt,
            hintMode: gameStore.hintMode,
        });
        gameStore.setBestScore(await semanticEngine.bestGameScore(), state.score > previousBest);
    } catch (error) {
        logger.error("Failed to save timed round", error);
    }
}

function stopTimer(): void {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
}

function queueWords(words: string[]): void {
    words.forEach(word => deps.pendingWordSpawns.push({ word }));
}

function wordsInPlay(): string[] {
    const onBoard = deps.activeWorld?.wordTexts() ?? [];
    return [...onBoard, ...deps.pendingWordSpawns.map(s => s.word)];
}

import deps from "../matterJsComp/Deps";
import { AnalogyResult } from "../embeddings/analogy";
import { applyPlay, PlayOutcome, startGame, tick, TIMED_RULES_VERSION, TimedGameState } from "../game/timedGame";
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
    queueWords(semanticEngine.dealWords(gameStore.rules.initialWords, []));
    timer = setInterval(() => tickRound(stores), TICK_MS);
}

/** Scores a played analogy for the running round and deals reward words when earned. */
export function recordRoundAnalogy(stores: RootStore, result: AnalogyResult): PlayOutcome | undefined {
    const { gameStore } = stores;
    if (!gameStore.game) return undefined;
    const outcome = applyPlay(gameStore.game, analogyKey(result.a, result.b, result.c), result.similarity, Date.now(), gameStore.rules);
    gameStore.setGame(outcome.state);
    gameStore.setLastRoundPoints({ points: outcome.points, duplicate: outcome.duplicate });
    if (outcome.wordsToDeal > 0) queueWords(semanticEngine.dealWords(outcome.wordsToDeal, wordsInPlay()));
    if (outcome.state.phase === "over") void finishRound(stores, outcome.state);
    return outcome;
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

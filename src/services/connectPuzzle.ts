import deps from "../matterJsComp/Deps";
import { RootStore } from "../stores/RootStore";
import { ConnectNode, ConnectRules, connectionStats, isLegalMove } from "../game/connectAll";
import type { Puzzle } from "../game/connectPuzzles";
import { DealerReply, DealerRequest, inThreadBackend, packCandidates, PuzzleBackend, PuzzleDealer } from "../game/connectDealer";
import { PuzzlePlayPayload, puzzleMoveCount } from "../game/puzzleResults";
import { semanticEngine } from "./semanticEngine";
import { logger } from "../utils/logger";

/**
 * Connect-All puzzle mode (Epic 2 · Task 2.10.5): deals a seeded puzzle, records each typed word as a
 * move, and keeps the HUD's counts current. Rules and par come from the balance research
 * (docs/research/connect-all-balance.md): p99 link, degree ≥ 2, beam-search par. Puzzles are made in a
 * worker, the next one ahead of time (Task 2.10.6).
 */
const SEED_KEY = "lexical-fountain.puzzleSeed";

function savedSeed(): number {
    try {
        return Number(window.localStorage.getItem(SEED_KEY)) || 1;
    } catch {
        return 1;
    }
}

function saveSeed(seed: number): void {
    try {
        window.localStorage.setItem(SEED_KEY, String(seed));
    } catch {
        /* storage blocked: the puzzle number restarts next session */
    }
}

let puzzleDealer: PuzzleDealer | undefined;
/** Deals counted so far: a deal applies only if no newer one was asked for meanwhile. */
let dealsAsked = 0;

/**
 * The dealer (Task 2.10.6): puzzles are made in a Web Worker and the next one ahead of time, so dealing never
 * stalls the board on a slow phone. Without Worker support (or if it fails to start) it runs in-thread.
 */
function dealer(): PuzzleDealer {
    if (!puzzleDealer) {
        const candidates = semanticEngine.connectCandidates();
        const rules = semanticEngine.connectRules();
        puzzleDealer = new PuzzleDealer(workerBackend(candidates, rules) ?? inThreadBackend(candidates, rules));
    }
    return puzzleDealer;
}

function workerBackend(candidates: ConnectNode[], rules: ConnectRules): PuzzleBackend | undefined {
    if (typeof Worker === "undefined") return undefined;
    let worker: Worker;
    try {
        worker = new Worker(new URL("../workers/connectPuzzle.worker.ts", import.meta.url), { type: "module" });
    } catch (error) {
        logger.warn("Puzzle worker unavailable; dealing in-thread", error);
        return undefined;
    }
    const pending = new Map<number, { resolve(p: Puzzle): void; reject(e: Error): void }>();
    let nextId = 1;
    let fallback: PuzzleBackend | undefined;
    worker.onmessage = (event: MessageEvent<DealerReply>) => {
        const reply = event.data;
        const waiting = pending.get(reply.id);
        pending.delete(reply.id);
        if (reply.type === "puzzle") waiting?.resolve(reply.puzzle);
        else waiting?.reject(new Error(reply.message));
    };
    worker.onerror = event => {
        // The worker failed to load or crashed: finish what was asked in-thread, and keep going that way.
        logger.warn("Puzzle worker failed; dealing in-thread", event.message);
        fallback = inThreadBackend(candidates, rules);
        const waiting = [...pending.entries()];
        pending.clear();
        waiting.forEach(([, w]) => w.reject(new Error("Puzzle worker failed")));
        worker.terminate();
    };
    const packed = packCandidates(candidates);
    const init: DealerRequest = { type: "init", candidates: packed, rules };
    worker.postMessage(init, [packed.vectors.buffer, packed.ranks.buffer]);
    return {
        make: seed => {
            if (fallback) return fallback.make(seed);
            const id = nextId++;
            return new Promise<Puzzle>((resolve, reject) => {
                pending.set(id, { resolve, reject });
                const request: DealerRequest = { type: "make", id, seed };
                worker.postMessage(request);
            }).catch(error => (fallback ? fallback.make(seed) : Promise.reject(error)));
        },
    };
}

/**
 * Deals puzzle `seed` (default: where the player left off) onto a fresh board. Asynchronous: the puzzle comes
 * from the worker (usually already made). Applied only if the player is still in Connect mode and this is the
 * latest deal asked for.
 */
export async function startPuzzle(stores: RootStore, seed: number = savedSeed()): Promise<void> {
    if (!semanticEngine.isReady) return;
    const deal = ++dealsAsked;
    let puzzle: Puzzle;
    try {
        puzzle = await dealer().deal(seed);
    } catch (error) {
        logger.warn("Could not deal a puzzle", error);
        return;
    }
    if (deal !== dealsAsked || stores.menuStore.view !== "puzzle") return;
    saveSeed(puzzle.seed);
    stores.gameStore.setPuzzle({ ...puzzle, moves: [] });
    deps.activeWorld?.clearWordBoxes();
    stores.menuStore.clearBoardAnalogies();
    puzzle.words.forEach(word => deps.pendingWordSpawns.push({ word }));
    refreshPuzzleStats(stores);
    void loadPuzzleBest(stores);
}

/** The best earlier result on the current board (shown in the HUD), from the play log. */
async function loadPuzzleBest(stores: RootStore, lastWasBest = false): Promise<void> {
    const puzzle = stores.gameStore.puzzle;
    if (!puzzle) return;
    const best = await semanticEngine.bestPuzzleResult(puzzle.words);
    // Another puzzle may have been dealt meanwhile.
    if (stores.gameStore.puzzle?.seed === puzzle.seed) stores.gameStore.setPuzzleBest(best ?? null, lastWasBest);
}

/** The next puzzle number (after a win or a skip). */
export function nextPuzzle(stores: RootStore): void {
    const current = stores.gameStore.puzzle;
    void startPuzzle(stores, (current?.seed ?? savedSeed()) + 1);
}

/** Respawns the current puzzle's board (a world started in Connect mode without a hand-off). */
export function resumePuzzle(stores: RootStore): void {
    const { puzzle } = stores.gameStore;
    if (!puzzle) {
        void startPuzzle(stores);
        return;
    }
    [...puzzle.words, ...puzzle.moves].forEach(word => deps.pendingWordSpawns.push({ word }));
    refreshPuzzleStats(stores);
}

/**
 * Plays `word` as a move. Returns why it can't be played, or undefined when it was added (the caller
 * spawns it). Words already on the board, words sharing a stem with one, and unknown words are refused.
 */
export function playPuzzleMove(stores: RootStore, word: string): string | undefined {
    const { puzzle } = stores.gameStore;
    if (!puzzle) return "No puzzle on the board";
    if (puzzle.solved) return "Solved! Start the next puzzle";
    const node = semanticEngine.connectNode(word);
    if (!node) return `"${word}" has no meaning vector yet`;
    const board = [...puzzle.words, ...puzzle.moves].map(w => semanticEngine.connectNode(w)!).filter(Boolean);
    if (!isLegalMove(node, semanticEngine.connectRules(), board)) return `"${word}" is on the board already, or shares a stem with a board word`;
    stores.gameStore.addPuzzleMove(word);
    const stats = refreshPuzzleStats(stores);
    if (stats?.solved) void finishPuzzle(stores);
    return undefined;
}

/**
 * Takes one of the player's own words back off the board (Task 2.10.5). It counts as a move, like adding
 * it did. Puzzle words can't be removed (deleting the hard ones would skip the puzzle).
 */
export function removePuzzleWord(stores: RootStore, word: string): string | undefined {
    const { puzzle } = stores.gameStore;
    if (!puzzle) return "No puzzle on the board";
    if (puzzle.solved) return "Solved! Start the next puzzle";
    if (!puzzle.moves.includes(word)) return `"${word}" is a puzzle word: only your own words can be removed`;
    stores.gameStore.removePuzzleMove(word);
    deps.activeWorld?.removeWords([word]);
    deps.pendingWordSpawns = deps.pendingWordSpawns.filter(request => request.word !== word);
    const stats = refreshPuzzleStats(stores);
    if (stats?.solved) void finishPuzzle(stores);
    return undefined;
}

/** Solved: record the result in the play log, compare with the best, and light up the whole board. */
async function finishPuzzle(stores: RootStore): Promise<void> {
    const puzzle = stores.gameStore.puzzle;
    if (!puzzle) return;
    stores.gameStore.setPuzzleSolved();
    const moveCount = puzzleMoveCount(puzzle);
    const previous = stores.gameStore.puzzleBest;
    const payload: PuzzlePlayPayload = { seed: puzzle.seed, band: puzzle.band, par: puzzle.par, words: puzzle.words, moves: puzzle.moves, removed: puzzle.removed ?? [], moveCount };
    await semanticEngine.logPlay("puzzle", { view: "puzzle", dimension: stores.gameStore.dimension, hintMode: stores.gameStore.hintMode }, { ...payload });
    await loadPuzzleBest(stores, !previous || moveCount < previous.moves);
    // Completion burst: every word on the board glows (3D) or pulses (2D), once the last word has landed.
    setTimeout(() => deps.activeWorld?.focusWords([...puzzle.words, ...puzzle.moves]), 400);
}

/** Recomputes degrees from the puzzle's words and moves (the rules decide, not the physics). */
export function refreshPuzzleStats(stores: RootStore) {
    const { puzzle } = stores.gameStore;
    if (!puzzle) return undefined;
    const words = [...puzzle.words, ...puzzle.moves];
    const moveSet = new Set(puzzle.moves);
    const nodes = words.map(w => {
        const node = semanticEngine.connectNode(w);
        return node ? { ...node, added: moveSet.has(w) } : undefined;
    }).filter((n): n is NonNullable<typeof n> => n !== undefined);
    const stats = connectionStats(nodes, semanticEngine.connectRules());
    const summary = {
        connected: stats.degree.filter(d => d >= 2).length,
        total: nodes.length,
        ratio: stats.ratio,
        loose: stats.degree.flatMap((d, i) => (d < 2 ? [nodes[i].word] : [])),
        solved: stats.solved,
    };
    stores.gameStore.setPuzzleStats(summary);
    return summary;
}

import deps from "../matterJsComp/Deps";
import { RootStore } from "../stores/RootStore";
import { connectionStats, isLegalMove } from "../game/connectAll";
import { makePuzzle } from "../game/connectPuzzles";
import { semanticEngine } from "./semanticEngine";

/**
 * Connect-All puzzle mode (Epic 2 · Task 2.10.5): deals a seeded puzzle, records each typed word as a
 * move, and keeps the HUD's counts current. Rules and par come from the balance research
 * (docs/research/connect-all-balance.md): p99 link, degree ≥ 2, greedy-solver par.
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

/** Deals puzzle `seed` (default: where the player left off) onto a fresh board. */
export function startPuzzle(stores: RootStore, seed: number = savedSeed()): void {
    if (!semanticEngine.isReady) return;
    const puzzle = makePuzzle(seed, semanticEngine.connectCandidates(), semanticEngine.connectRules());
    saveSeed(puzzle.seed);
    stores.gameStore.setPuzzle({ ...puzzle, moves: [] });
    deps.activeWorld?.clearWordBoxes();
    stores.menuStore.clearBoardAnalogies();
    puzzle.words.forEach(word => deps.pendingWordSpawns.push({ word }));
    refreshPuzzleStats(stores);
}

/** The next puzzle number (after a win or a skip). */
export function nextPuzzle(stores: RootStore): void {
    const current = stores.gameStore.puzzle;
    startPuzzle(stores, (current?.seed ?? savedSeed()) + 1);
}

/** Respawns the current puzzle's board (a world started in Connect mode without a hand-off). */
export function resumePuzzle(stores: RootStore): void {
    const { puzzle } = stores.gameStore;
    if (!puzzle) return startPuzzle(stores);
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
    if (stats?.solved) {
        stores.gameStore.setPuzzleSolved();
        void semanticEngine.logPlay("puzzle", { view: "puzzle", dimension: stores.gameStore.dimension, hintMode: stores.gameStore.hintMode },
            { seed: puzzle.seed, band: puzzle.band, par: puzzle.par, moves: [...puzzle.moves, word] });
    }
    return undefined;
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

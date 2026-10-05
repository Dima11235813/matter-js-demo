import { sharesStem } from "../embeddings/analogy";

/**
 * Connect-All puzzles (Epic 2 · Feature 2.10): a board of loose words is solved when every word has at
 * least two connections. The player adds words; each added word is a node too, so it must end with
 * two connections itself. Pure rules, stats, and a greedy solver (par and hints), shared by the game
 * and the balance harness (docs/research/connect-all-balance.md).
 */
export interface ConnectNode {
    word: string;
    /** Unit vector (centred, normalized, as the semantic engine stores them). */
    vector: Float32Array;
    /** Frequency rank in the vocabulary (0 = most frequent). */
    rank: number;
    /** Added by the player (a move), as opposed to a puzzle word. */
    added?: boolean;
}

export interface ConnectRules {
    /** Similarity at or above which two words are connected (the hint layout's p99 link). */
    link: number;
    /** Words more frequent than this rank are "hubs" and need `hubLink` to connect. */
    hubRank: number;
    hubLink: number;
    /** The N most frequent words can't be played as moves. */
    bannedTopN: number;
    /** An added word connects to at most this many board words (its most similar). */
    maxLinksPerMove: number;
}

export const BASE_RULES: ConnectRules = { link: 0.23, hubRank: 0, hubLink: 0.23, bannedTopN: 0, maxLinksPerMove: Infinity };

export interface ConnectionStats {
    degree: number[];
    links: [number, number][];
    /** Exactly one connection. */
    dangling: number[];
    /** No connection. */
    free: number[];
    /** Share of words with two or more connections. */
    ratio: number;
    solved: boolean;
}

export function dot(a: Float32Array, b: Float32Array): number {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
}

export function linkThreshold(a: ConnectNode, b: ConnectNode, rules: ConnectRules): number {
    return a.rank < rules.hubRank || b.rank < rules.hubRank ? Math.max(rules.link, rules.hubLink) : rules.link;
}

/**
 * Whether a word may be played as a move: not banned by frequency, not already on the board, and no
 * shared stem with a board word ("dogs" can't bridge "dog").
 */
export function isLegalMove(node: ConnectNode, rules: ConnectRules, board: readonly ConnectNode[] = []): boolean {
    return node.rank >= rules.bannedTopN && !board.some(b => b.word === node.word || sharesStem(b.word, node.word));
}

/**
 * Degrees and links. Puzzle words link wherever similarity clears the threshold; an added word keeps
 * only its `maxLinksPerMove` strongest links (to any word).
 */
export function connectionStats(nodes: readonly ConnectNode[], rules: ConnectRules, sim: (i: number, j: number) => number = (i, j) => dot(nodes[i].vector, nodes[j].vector)): ConnectionStats {
    const n = nodes.length;
    const candidate: [number, number, number][] = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const s = sim(i, j);
        if (s >= linkThreshold(nodes[i], nodes[j], rules)) candidate.push([i, j, s]);
    }
    // Cap added words' links: a link touching an added word survives only if it is among that word's
    // `maxLinksPerMove` strongest (for a link between two added words: among both words' strongest).
    let links = candidate;
    if (Number.isFinite(rules.maxLinksPerMove)) {
        const strongest = new Map<number, Set<string>>();
        for (let i = 0; i < n; i++) {
            if (!nodes[i].added) continue;
            const top = candidate.filter(([a, b]) => a === i || b === i).sort((x, y) => y[2] - x[2]).slice(0, rules.maxLinksPerMove);
            strongest.set(i, new Set(top.map(([a, b]) => `${a}-${b}`)));
        }
        links = candidate.filter(([a, b]) => [a, b].every(i => !nodes[i].added || strongest.get(i)!.has(`${a}-${b}`)));
    }
    const degree = new Array<number>(n).fill(0);
    for (const [a, b] of links) { degree[a]++; degree[b]++; }
    const dangling = degree.flatMap((d, i) => (d === 1 ? [i] : []));
    const free = degree.flatMap((d, i) => (d === 0 ? [i] : []));
    const connected = degree.filter(d => d >= 2).length;
    return { degree, links: links.map(([a, b]) => [a, b]), dangling, free, ratio: n === 0 ? 1 : connected / n, solved: n > 0 && connected === n };
}

/**
 * What playing `candidate` would do: the board words it would link to (after the cap), and how many
 * under-connected words (degree < 2) it would lift by one. Uses precomputed similarities to the board.
 */
export function moveValue(candidate: ConnectNode, candidateSims: readonly number[], board: readonly ConnectNode[], degree: readonly number[], rules: ConnectRules): { links: number[]; gain: number } {
    let links = board.map((node, j) => [j, candidateSims[j]] as const).filter(([j, s]) => s >= linkThreshold(candidate, board[j], rules));
    if (Number.isFinite(rules.maxLinksPerMove)) links = [...links].sort((x, y) => y[1] - x[1]).slice(0, rules.maxLinksPerMove);
    const indices = links.map(([j]) => j);
    return { links: indices, gain: indices.filter(j => degree[j] < 2).length };
}

export interface SolveResult {
    moves: string[];
    solved: boolean;
}

/**
 * Greedy solver (par and hints): repeatedly plays the legal candidate that lifts the most
 * under-connected words while linking to at least two words itself (ties: the stronger links).
 * `simsOf(candidateIndex)` returns that candidate's similarities to the current board, in board order.
 */
export function solveGreedy(
    puzzle: readonly ConnectNode[],
    candidates: readonly ConnectNode[],
    rules: ConnectRules,
    simsOf: (candidate: number, board: readonly ConnectNode[]) => number[],
    maxMoves = 12
): SolveResult {
    const board = [...puzzle];
    const moves: string[] = [];
    const used = new Set(board.map(n => n.word));
    for (let step = 0; step < maxMoves; step++) {
        const stats = connectionStats(board, rules);
        if (stats.solved) return { moves, solved: true };
        let best = -1, bestGain = 0, bestStrength = -Infinity;
        for (let c = 0; c < candidates.length; c++) {
            const cand = candidates[c];
            if (used.has(cand.word) || !isLegalMove(cand, rules, board)) continue;
            const sims = simsOf(c, board);
            const { links, gain } = moveValue(cand, sims, board, stats.degree, rules);
            if (links.length < 2 || gain === 0) continue;
            const strength = links.reduce((s, j) => s + sims[j], 0);
            if (gain > bestGain || (gain === bestGain && strength > bestStrength)) { best = c; bestGain = gain; bestStrength = strength; }
        }
        if (best < 0) return { moves, solved: false };
        board.push({ ...candidates[best], added: true });
        used.add(candidates[best].word);
        moves.push(candidates[best].word);
    }
    return { moves, solved: connectionStats(board, rules).solved };
}

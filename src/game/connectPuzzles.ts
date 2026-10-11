import { sharesStem } from "../embeddings/analogy";
import { ConnectNode, ConnectRules, dot, solveBeam } from "./connectAll";

/**
 * Connect-All puzzle generation (Epic 2 · Task 2.10.4; docs/research/connect-all-balance.md). Shared by
 * the game and the balance harness. Purely random boards were all "hard" (par ~12: unrelated words
 * each need their own bridges), so a puzzle is built from a template: `pairs` related pairs (a word and
 * a close neighbour, both starting dangling) plus `loose` unrelated words. Seeds are deterministic, so
 * "puzzle #1042" is the same board for everyone with the same vocabulary.
 */
// Six templates, a third per band (docs/research/connect-all-balance.md §6, 2026-10-11): 3+0 is always easy,
// 3+1 and 2+2 medium, 2+5 and 3+4 hard. Interleaved, so consecutive puzzles change difficulty. (2026-10-04:
// 3+0, 3+1, 2+2, 3+2, 2+4 gave only 14 hard puzzles in 100.)
export const TEMPLATES = [
    { pairs: 3, loose: 0 }, { pairs: 3, loose: 1 }, { pairs: 2, loose: 5 }, { pairs: 3, loose: 0 }, { pairs: 2, loose: 2 }, { pairs: 3, loose: 4 },
] as const;

export interface PuzzleTemplate {
    readonly pairs: number;
    readonly loose: number;
}

export type PuzzleBand = "easy" | "medium" | "hard";

/** Difficulty band from par (the research's bands: ≤ 3, 4–6, ≥ 7). */
export function bandOf(par: number): PuzzleBand {
    return par <= 3 ? "easy" : par <= 6 ? "medium" : "hard";
}

export function lcg(seed: number): () => number {
    let s = seed >>> 0;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0xffffffff; };
}

/** The puzzle words for a seed. `candidates` are the playable vocabulary words, most frequent first. */
export function generatePuzzle(seed: number, candidates: readonly ConnectNode[], link: number, template: PuzzleTemplate = TEMPLATES[seed % TEMPLATES.length]): ConnectNode[] {
    const next = lcg(seed);
    const { pairs, loose } = template;
    const out: ConnectNode[] = [];
    const fits = (c: ConnectNode) => c.rank >= 200 && c.rank <= 4000 && !out.some(o => o.word === c.word || sharesStem(o.word, c.word));
    const pick = () => {
        for (let guard = 0; guard < 100_000; guard++) {
            const c = candidates[Math.floor(next() * candidates.length)];
            if (fits(c)) return c;
        }
        throw new Error("No puzzle words available");
    };
    // Pair seeds and loose words must not already link to anything on the board.
    const unlinked = (c: ConnectNode) => out.every(o => dot(o.vector, c.vector) < link);
    for (let guard = 0; out.length < pairs * 2 && guard < 10_000; guard++) {
        const seedWord = pick();
        if (!unlinked(seedWord)) continue;
        const near = candidates.filter(c => c !== seedWord && fits(c) && !sharesStem(c.word, seedWord.word))
            .map(c => [c, dot(c.vector, seedWord.vector)] as const)
            .filter(([, s]) => s >= link + 0.02 && s <= 0.65)
            .sort((a, b) => b[1] - a[1]).slice(0, 20);
        if (near.length === 0) continue;
        const [partner] = near[Math.floor(next() * near.length)];
        if (!unlinked(partner)) continue;
        out.push({ ...seedWord }, { ...partner });
    }
    for (let guard = 0; out.length < pairs * 2 + loose && guard < 10_000; guard++) {
        const c = pick();
        if (unlinked(c)) out.push({ ...c });
    }
    return out;
}

/** Candidate x board similarities: one column per board word, computed the first time it is needed. */
export class SimColumns {
    private columns = new Map<string, Float32Array>();
    constructor(private readonly candidates: readonly ConnectNode[]) {}
    private linkedCache = new Map<string, number[]>();
    row(c: number, board: readonly ConnectNode[]): number[] {
        return board.map(node => this.column(node)[c]);
    }

    /**
     * Candidates whose similarity to any of `nodes` reaches `link`, in ascending index order: the solvers'
     * `CandidatePool` (a move must link an under-connected word, so the rest can be skipped).
     */
    linked(nodes: readonly ConnectNode[], link: number): number[] {
        const out = new Set<number>();
        for (const node of nodes) {
            let list = this.linkedCache.get(node.word);
            if (!list) {
                const column = this.column(node);
                list = [];
                for (let i = 0; i < column.length; i++) if (column[i] >= link) list.push(i);
                this.linkedCache.set(node.word, list);
            }
            list.forEach(i => out.add(i));
        }
        return [...out].sort((a, b) => a - b);
    }

    private column(node: ConnectNode): Float32Array {
        let column = this.columns.get(node.word);
        if (!column) {
            column = new Float32Array(this.candidates.length);
            for (let i = 0; i < this.candidates.length; i++) column[i] = dot(this.candidates[i].vector, node.vector);
            this.columns.set(node.word, column);
        }
        return column;
    }
}

export interface Puzzle {
    seed: number;
    words: string[];
    /** Moves the beam-search solver needs (never more than greedy's); the solution doubles as a hint list. */
    par: number;
    band: PuzzleBand;
    solution: string[];
}

/**
 * The first solvable puzzle at or after `seed` (some seeds leave a word no vocabulary word can reach),
 * with its par from the beam-search solver (Task 2.10.2).
 */
export function makePuzzle(seed: number, candidates: readonly ConnectNode[], rules: ConnectRules, maxMoves = 15): Puzzle {
    for (let s = seed; s < seed + 50; s++) {
        const words = generatePuzzle(s, candidates, rules.link);
        const columns = new SimColumns(candidates);
        // The pool uses the base link: hub thresholds are stricter, so it can only include extra candidates.
        const solved = solveBeam(words, candidates, rules, (c, board) => columns.row(c, board), { maxMoves, pool: needy => columns.linked(needy, rules.link) });
        if (solved.solved && solved.moves.length > 0) {
            return { seed: s, words: words.map(w => w.word), par: solved.moves.length, band: bandOf(solved.moves.length), solution: solved.moves };
        }
    }
    throw new Error(`No solvable puzzle near seed ${seed}`);
}

import { ConnectNode, ConnectRules } from "./connectAll";
import { makePuzzle, Puzzle } from "./connectPuzzles";

/**
 * Dealing Connect-All puzzles without stalling the page (Epic 2 · Task 2.10.6). Making a puzzle runs the
 * beam-search solver: up to 1.1 s on a phone-speed CPU (4x throttle), on the main thread before this. The
 * dealer asks a backend (a Web Worker in the browser, in-thread elsewhere) and keeps the next puzzle made
 * ahead of time, so "Next puzzle" is usually instant and never freezes the board.
 */
export interface PuzzleBackend {
    make(seed: number): Promise<Puzzle>;
}

export class PuzzleDealer {
    private readonly cache = new Map<number, Promise<Puzzle>>();

    /** `keep`: puzzles held at once (the one being played and the one prefetched, plus a spare). */
    constructor(private readonly backend: PuzzleBackend, private readonly keep = 3) {}

    /** The puzzle for `seed` (the first solvable at or after it); then starts making the following one. */
    deal(seed: number): Promise<Puzzle> {
        const puzzle = this.get(seed);
        puzzle.then(p => this.prefetch(p.seed + 1), () => undefined);
        return puzzle;
    }

    /** Starts making `seed` in the background if it isn't made or being made already. */
    prefetch(seed: number): void {
        this.get(seed).catch(() => undefined);
    }

    /** Whether `seed` is already made or being made (tests and measurements). */
    has(seed: number): boolean {
        return this.cache.has(seed);
    }

    private get(seed: number): Promise<Puzzle> {
        let puzzle = this.cache.get(seed);
        if (!puzzle) {
            puzzle = this.backend.make(seed);
            this.cache.set(seed, puzzle);
            // A failure is not cached: the next request tries again.
            puzzle.catch(() => { if (this.cache.get(seed) === puzzle) this.cache.delete(seed); });
            while (this.cache.size > this.keep) this.cache.delete(this.cache.keys().next().value as number);
        }
        return puzzle;
    }
}

/** The candidate vocabulary in one transferable block: one copy to the worker, no per-word messages. */
export interface PackedCandidates {
    words: string[];
    ranks: Int32Array;
    dim: number;
    vectors: Float32Array;
}

export function packCandidates(candidates: readonly ConnectNode[]): PackedCandidates {
    const dim = candidates[0]?.vector.length ?? 0;
    const vectors = new Float32Array(candidates.length * dim);
    candidates.forEach((c, i) => vectors.set(c.vector, i * dim));
    return { words: candidates.map(c => c.word), ranks: Int32Array.from(candidates.map(c => c.rank)), dim, vectors };
}

/** Back to nodes; each vector is a view into the shared block (no copies). */
export function unpackCandidates({ words, ranks, dim, vectors }: PackedCandidates): ConnectNode[] {
    return words.map((word, i) => ({ word, rank: ranks[i], vector: vectors.subarray(i * dim, (i + 1) * dim) }));
}

/** Messages between the page and the puzzle worker. */
export type DealerRequest =
    | { type: "init"; candidates: PackedCandidates; rules: ConnectRules }
    | { type: "make"; id: number; seed: number };
export type DealerReply =
    | { type: "puzzle"; id: number; puzzle: Puzzle }
    | { type: "error"; id: number; message: string };

/** The worker's logic, kept out of the worker file so it is unit-tested: answers one request. */
export function createDealerHandler() {
    let candidates: ConnectNode[] | undefined;
    let rules: ConnectRules | undefined;
    return (request: DealerRequest): DealerReply | undefined => {
        if (request.type === "init") {
            candidates = unpackCandidates(request.candidates);
            rules = request.rules;
            return undefined;
        }
        if (!candidates || !rules) return { type: "error", id: request.id, message: "Puzzle worker not initialized" };
        try {
            return { type: "puzzle", id: request.id, puzzle: makePuzzle(request.seed, candidates, rules) };
        } catch (error) {
            return { type: "error", id: request.id, message: error instanceof Error ? error.message : String(error) };
        }
    };
}

/** In-thread backend (no Worker available, and unit tests): yields first, so the caller's frame can finish. */
export function inThreadBackend(candidates: readonly ConnectNode[], rules: ConnectRules): PuzzleBackend {
    return { make: seed => new Promise((resolve, reject) => setTimeout(() => { try { resolve(makePuzzle(seed, candidates, rules)); } catch (e) { reject(e); } }, 0)) };
}

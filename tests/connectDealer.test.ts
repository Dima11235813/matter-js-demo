import { describe, it, expect } from 'vitest';
import { createDealerHandler, inThreadBackend, packCandidates, PuzzleBackend, PuzzleDealer, unpackCandidates } from '../src/game/connectDealer';
import { BASE_RULES, ConnectNode } from '../src/game/connectAll';
import { lcg, makePuzzle, Puzzle } from '../src/game/connectPuzzles';

const fakePuzzle = (seed: number): Puzzle => ({ seed, words: [`w${seed}`], par: 3, band: 'easy', solution: [] });

/** A backend that records requests and resolves when told to. */
function controlled() {
  const asked: number[] = [];
  const waiting = new Map<number, { resolve(p: Puzzle): void; reject(e: Error): void }>();
  const backend: PuzzleBackend = { make: seed => { asked.push(seed); return new Promise((resolve, reject) => waiting.set(seed, { resolve, reject })); } };
  return { backend, asked, finish: (seed: number, as = seed) => waiting.get(seed)!.resolve(fakePuzzle(as)), fail: (seed: number) => waiting.get(seed)!.reject(new Error('boom')) };
}
const tick = () => new Promise(r => setTimeout(r, 0));

describe('puzzle dealer (Task 2.10.6)', () => {
  it('prefetches the puzzle after the one dealt, so "Next puzzle" is already made', async () => {
    const { backend, asked, finish } = controlled();
    const dealer = new PuzzleDealer(backend);
    const first = dealer.deal(10);
    finish(10, 12); // seeds 10 and 11 were unsolvable: puzzle #12
    expect((await first).seed).toBe(12);
    await tick();
    expect(asked).toEqual([10, 13]); // the next one is made ahead of time
    finish(13);
    const next = dealer.deal(13);
    expect((await next).seed).toBe(13);
    expect(asked.filter(s => s === 13)).toHaveLength(1); // not made twice
  });

  it('asks again after a failure instead of caching it', async () => {
    const { backend, asked, fail, finish } = controlled();
    const dealer = new PuzzleDealer(backend);
    const first = dealer.deal(5);
    fail(5);
    await expect(first).rejects.toThrow('boom');
    await tick();
    expect(dealer.has(5)).toBe(false);
    const again = dealer.deal(5);
    finish(5);
    expect((await again).seed).toBe(5);
    expect(asked.filter(s => s === 5)).toHaveLength(2);
  });

  it('keeps only a few puzzles (memory on small phones)', () => {
    const { backend } = controlled();
    const dealer = new PuzzleDealer(backend, 2);
    [1, 2, 3].forEach(s => dealer.prefetch(s));
    expect([1, 2, 3].map(s => dealer.has(s))).toEqual([false, true, true]);
  });
});

describe('puzzle worker protocol', () => {
  const next = lcg(9);
  const dim = 16;
  // Synthetic vocabulary: sparse unit vectors, so some words link and the generator finds pairs.
  const candidates: ConnectNode[] = Array.from({ length: 300 }, (_, i) => {
    const v = new Float32Array(dim);
    v[Math.floor(next() * dim)] = 1;
    v[Math.floor(next() * dim)] += 0.6;
    const n = Math.hypot(...v);
    return { word: `word${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}x`, rank: 200 + i * 10, vector: v.map(x => x / n) };
  });
  const rules = { ...BASE_RULES, link: 0.5 };

  it('packs the vocabulary into one block and back without changing a vector', () => {
    const packed = packCandidates(candidates);
    expect(packed.vectors.length).toBe(candidates.length * dim);
    const back = unpackCandidates(packed);
    expect(back.map(c => c.word)).toEqual(candidates.map(c => c.word));
    expect(Array.from(back[7].vector)).toEqual(Array.from(candidates[7].vector));
    expect(back[7].rank).toBe(candidates[7].rank);
  });

  it('the worker handler makes the same puzzle as the main thread would (determinism across threads)', () => {
    const handle = createDealerHandler();
    expect(handle({ type: 'make', id: 1, seed: 3 })).toEqual({ type: 'error', id: 1, message: 'Puzzle worker not initialized' });
    expect(handle({ type: 'init', candidates: packCandidates(candidates), rules })).toBeUndefined();
    const expected = makePuzzle(3, candidates, rules);
    expect(expected.words.length).toBeGreaterThan(0);
    expect(handle({ type: 'make', id: 2, seed: 3 })).toEqual({ type: 'puzzle', id: 2, puzzle: expected });
  });

  it('the in-thread fallback yields before solving (the caller frame finishes first)', async () => {
    let solved = false;
    const backend = inThreadBackend(candidates, rules);
    const made = backend.make(3).then(() => { solved = true; }, () => { solved = true; });
    expect(solved).toBe(false);
    await made;
    expect(solved).toBe(true);
  });
});

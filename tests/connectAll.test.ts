import { describe, it, expect } from 'vitest';
import { BASE_RULES, ConnectNode, ConnectRules, connectionStats, dot, isLegalMove, solveGreedy } from '../src/game/connectAll';

const unit = (...xs: number[]) => { const n = Math.hypot(...xs); return Float32Array.from(xs.map(x => x / n)); };
const node = (word: string, vector: Float32Array, rank = 5000, added = false): ConnectNode => ({ word, vector, rank, added });
const rules: ConnectRules = { ...BASE_RULES, link: 0.5 };

describe('Connect-All: connections (Feature 2.10)', () => {
  it('counts degrees: a chain leaves its ends dangling, a lone word free', () => {
    // a-b and b-c link (~0.71), a-c does not (0); d is orthogonal to all.
    const nodes = [node('a', unit(1, 0, 0, 0)), node('b', unit(1, 1, 0, 0)), node('c', unit(0, 1, 0, 0)), node('d', unit(0, 0, 0, 1))];
    const s = connectionStats(nodes, rules);
    expect(s.degree).toEqual([1, 2, 1, 0]);
    expect(s.dangling).toEqual([0, 2]);
    expect(s.free).toEqual([3]);
    expect(s.ratio).toBeCloseTo(0.25);
    expect(s.solved).toBe(false);
  });

  it('a triangle is solved: every word has two connections', () => {
    const nodes = [node('a', unit(1, 0.2, 0.2)), node('b', unit(0.2, 1, 0.2)), node('c', unit(0.6, 0.6, 0.3))];
    nodes.forEach((x, i) => nodes.forEach((y, j) => { if (i < j) expect(dot(x.vector, y.vector)).toBeGreaterThan(0.3); }));
    const s = connectionStats(nodes, { ...rules, link: 0.3 });
    expect(s.solved).toBe(true);
    expect(s.ratio).toBe(1);
  });

  it('hub words need the stricter hub threshold to connect', () => {
    const nodes = [node('thing', unit(1, 0.9, 0), 3), node('dog', unit(1, 0, 0))]; // similarity ~0.74
    expect(connectionStats(nodes, rules).links).toHaveLength(1);
    expect(connectionStats(nodes, { ...rules, hubRank: 100, hubLink: 0.8 }).links).toHaveLength(0);
  });

  it('caps the links an added word creates to its strongest ones', () => {
    const board = [node('a', unit(1, 0, 0, 0)), node('b', unit(0, 1, 0, 0)), node('c', unit(0, 0, 1, 0))];
    const hub = node('hub', unit(1.1, 1, 1, 0), 9000, true); // links all three (~0.6)
    expect(connectionStats([...board, hub], { ...rules, link: 0.5 }).degree[3]).toBe(3);
    expect(connectionStats([...board, hub], { ...rules, link: 0.5, maxLinksPerMove: 2 }).degree[3]).toBe(2);
  });

  it('bans the most frequent words as moves', () => {
    expect(isLegalMove(node('the', unit(1), 0), { ...rules, bannedTopN: 100 })).toBe(false);
    expect(isLegalMove(node('lantern', unit(1), 4000), { ...rules, bannedTopN: 100 })).toBe(true);
  });
});

describe('Connect-All: greedy solver (par)', () => {
  it('bridges two loose words with two bridge words, and refuses moves that cannot connect twice', () => {
    const a = node('a', unit(1, 0, 0)), c = node('c', unit(0, 1, 0));
    const candidates = [
      node('noise', unit(0, 0, 1)), // links nothing
      node('span', unit(1, 1, 0.2)),
      node('arch', unit(1, 1, -0.2)),
    ];
    const simsOf = (i: number, board: readonly ConnectNode[]) => board.map(b => dot(candidates[i].vector, b.vector));
    const result = solveGreedy([a, c], candidates, rules, simsOf);
    expect(result.solved).toBe(true);
    expect(result.moves.sort()).toEqual(['arch', 'span']);
  });

  it('reports an unsolvable board instead of looping', () => {
    const board = [node('a', unit(1, 0, 0)), node('c', unit(0, 1, 0))];
    const candidates = [node('noise', unit(0, 0, 1))];
    const result = solveGreedy(board, candidates, rules, (i, b) => b.map(x => dot(candidates[i].vector, x.vector)));
    expect(result).toEqual({ moves: [], solved: false });
  });
});

import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decodeVocabBinary, VocabManifest } from '../../../src/embeddings/vocabAsset';
import { VectorIndex } from '../../../src/embeddings/VectorIndex';
import { sharesStem } from '../../../src/embeddings/analogy';
import { BASE_RULES, ConnectNode, ConnectRules, connectionStats, dot, isLegalMove, linkThreshold, moveValue, solveGreedy } from '../../../src/game/connectAll';

/**
 * Connect-All balance harness (docs/research/connect-all-balance.md, Epic 2 · Task 2.10.3).
 * Generated puzzles x rule sets x bot strategies on the real vocabulary. A rule set is balanced
 * when cheap strategies (hub words, nearest neighbours, random words) can't match the solver, while
 * puzzles stay solvable with par spread across difficulty bands. Deterministic; writes
 * results/connect-all-balance.json.
 */
const ROOT = process.cwd();
const VOCAB = path.join(ROOT, 'public/vocab');
const manifest = JSON.parse(fs.readFileSync(path.join(VOCAB, 'vocab.json'), 'utf8')) as VocabManifest;
const bin = fs.readFileSync(path.join(VOCAB, 'vocab.bin'));
const index = VectorIndex.fromAsset(decodeVocabBinary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));
const profane = new Set(manifest.profane.map(i => manifest.words[i]));
const P99 = manifest.calibration.p99;
const PUZZLES = Number(process.env.CONNECT_PUZZLES ?? 100);
const MAX_MOVES = 15;
const FAIL_MOVES = 20;

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0xffffffff; };
}

const candidates: ConnectNode[] = [];
for (let rank = 0; rank < Math.min(8000, index.baseSize); rank++) {
  const word = index.baseWordAt(rank);
  if (/^[a-z]{3,}$/.test(word) && !profane.has(word)) candidates.push({ word, vector: index.getVector(word)!, rank });
}

/**
 * Puzzle templates: `pairs` related pairs (a word and a close neighbour, so both start dangling) plus
 * `loose` unrelated words. Purely random boards were all "hard" (par ~12: unrelated words each need
 * their own bridges), so difficulty comes from the template mix instead.
 */
export const TEMPLATES = [
  { pairs: 3, loose: 0 }, { pairs: 3, loose: 1 }, { pairs: 2, loose: 2 }, { pairs: 3, loose: 2 }, { pairs: 2, loose: 4 },
] as const;

function generatePuzzle(seed: number): ConnectNode[] {
  const next = lcg(seed);
  const { pairs, loose } = TEMPLATES[seed % TEMPLATES.length];
  const out: ConnectNode[] = [];
  const fits = (c: ConnectNode) => c.rank >= 200 && c.rank <= 4000 && !out.some(o => o.word === c.word || sharesStem(o.word, c.word));
  const pick = () => { for (;;) { const c = candidates[Math.floor(next() * candidates.length)]; if (fits(c)) return c; } };
  // Loose words and pair seeds must not already link to anything on the board.
  const unlinked = (c: ConnectNode) => out.every(o => dot(o.vector, c.vector) < P99);
  while (out.length < pairs * 2) {
    const seedWord = pick();
    if (!unlinked(seedWord)) continue;
    const near = candidates.filter(c => c !== seedWord && fits(c) && !sharesStem(c.word, seedWord.word))
      .map(c => [c, dot(c.vector, seedWord.vector)] as const)
      .filter(([, s]) => s >= P99 + 0.02 && s <= 0.65)
      .sort((a, b) => b[1] - a[1]).slice(0, 20);
    if (near.length === 0) continue;
    const [partner] = near[Math.floor(next() * near.length)];
    if (!out.every(o => dot(o.vector, partner.vector) < P99)) continue;
    out.push({ ...seedWord }, { ...partner });
  }
  while (out.length < pairs * 2 + loose) {
    const c = pick();
    if (unlinked(c)) out.push({ ...c });
  }
  return out;
}

/** Candidate x board similarities: one column per board word, computed the first time it is needed. */
class SimCache {
  private columns = new Map<string, Float32Array>();
  constructor(board: readonly ConnectNode[]) { board.forEach(b => this.add(b)); }
  add(node: ConnectNode) {
    if (this.columns.has(node.word)) return;
    const col = new Float32Array(candidates.length);
    for (let c = 0; c < candidates.length; c++) col[c] = dot(candidates[c].vector, node.vector);
    this.columns.set(node.word, col);
  }
  row(c: number, board: readonly ConnectNode[]): number[] {
    return board.map(node => { this.add(node); return this.columns.get(node.word)![c]; });
  }
}

type Bot = (board: readonly ConnectNode[], degree: readonly number[], rules: ConnectRules, cache: SimCache, used: ReadonlySet<string>, random: () => number) => number;

const notUsed = (used: ReadonlySet<string>, board: readonly ConnectNode[]) => (c: ConnectNode) => !used.has(c.word) && !board.some(b => sharesStem(b.word, c.word));

const bots: Record<string, Bot> = {
  /** The solver's greedy choice (fills the most missing connections, links twice itself). */
  solver: (board, degree, rules, cache, used) => {
    let best = -1, bestGain = 0, bestStrength = -Infinity;
    const free = notUsed(used, board);
    candidates.forEach((cand, c) => {
      if (!isLegalMove(cand, rules) || !free(cand)) return;
      const sims = cache.row(c, board);
      const { links, gain } = moveValue(cand, sims, board, degree, rules);
      if (links.length < 2 || gain === 0) return;
      const strength = links.reduce((s, j) => s + sims[j], 0);
      if (gain > bestGain || (gain === bestGain && strength > bestStrength)) { best = c; bestGain = gain; bestStrength = strength; }
    });
    return best;
  },
  /** Hub strategy: the word that links to the most board words, deficits ignored. */
  hub: (board, _degree, rules, cache, used) => {
    let best = -1, bestLinks = 0;
    const free = notUsed(used, board);
    candidates.forEach((cand, c) => {
      if (!isLegalMove(cand, rules) || !free(cand)) return;
      const sims = cache.row(c, board);
      const links = board.filter((b, j) => sims[j] >= linkThreshold(cand, b, rules)).length;
      const capped = Math.min(links, rules.maxLinksPerMove);
      if (capped > bestLinks) { best = c; bestLinks = capped; }
    });
    return best;
  },
  /** Nearest neighbour: patch the loosest word with its most similar legal word. */
  nearest: (board, degree, rules, cache, used) => {
    const target = degree.map((d, i) => [d, i] as const).sort((a, b) => a[0] - b[0])[0][1];
    let best = -1, bestSim = -Infinity;
    const free = notUsed(used, board);
    candidates.forEach((cand, c) => {
      if (!isLegalMove(cand, rules) || !free(cand)) return;
      const s = cache.row(c, board)[target];
      if (s > bestSim) { best = c; bestSim = s; }
    });
    return best;
  },
  /** Random legal words (a player guessing blindly). */
  random: (board, _degree, rules, _cache, used, random) => {
    const free = notUsed(used, board);
    for (let tries = 0; tries < 200; tries++) {
      const c = Math.floor(random() * Math.min(3000, candidates.length));
      if (isLegalMove(candidates[c], rules) && free(candidates[c])) return c;
    }
    return -1;
  },
};

function play(puzzle: readonly ConnectNode[], rules: ConnectRules, bot: Bot, seed: number): number {
  const board = puzzle.map(n => ({ ...n }));
  const cache = new SimCache(board);
  const used = new Set(board.map(b => b.word));
  const random = lcg(seed);
  for (let move = 0; move <= MAX_MOVES; move++) {
    const stats = connectionStats(board, rules);
    if (stats.solved) return move;
    if (move === MAX_MOVES) break;
    const c = bot(board, stats.degree, rules, cache, used, random);
    if (c < 0) break;
    const added = { ...candidates[c], added: true };
    board.push(added);
    cache.add(added);
    used.add(added.word);
  }
  return FAIL_MOVES;
}

const RULE_SETS: Record<string, ConnectRules> = {
  base: { ...BASE_RULES, link: P99 },
  hubStrict: { ...BASE_RULES, link: P99, hubRank: 500, hubLink: P99 + 0.08 },
  bannedTop300: { ...BASE_RULES, link: P99, bannedTopN: 300 },
  cap2: { ...BASE_RULES, link: P99, maxLinksPerMove: 2 },
  hubStrictCap3: { ...BASE_RULES, link: P99, hubRank: 500, hubLink: P99 + 0.08, maxLinksPerMove: 3 },
};

it('Connect-All balance: rule sets x bots x generated puzzles', () => {
  const results: Record<string, unknown> = {};
  const summary: Record<string, Record<string, string | number>> = {};
  for (const [name, rules] of Object.entries(RULE_SETS)) {
    const puzzles = [...Array(PUZZLES).keys()].map(i => generatePuzzle(1000 + i));
    const pars = puzzles.map(p => {
      const cache = new SimCache(p);
      const solved = solveGreedy(p, candidates, rules, (c, board) => cache.row(c, board), MAX_MOVES);
      return solved.solved ? solved.moves.length : FAIL_MOVES;
    });
    const solvable = puzzles.map((_, i) => i).filter(i => pars[i] < FAIL_MOVES && pars[i] > 0);
    const byBot: Record<string, { solveRate: number; meanOverPar: number }> = {};
    for (const [botName, bot] of Object.entries(bots)) {
      const moves = solvable.map(i => play(puzzles[i], rules, bot, 7 + i));
      const solvedRuns = moves.filter(m => m < FAIL_MOVES).length;
      const overPar = solvable.map((i, k) => moves[k] - pars[i]);
      byBot[botName] = { solveRate: +(solvedRuns / Math.max(1, solvable.length)).toFixed(2), meanOverPar: +(overPar.reduce((a, b) => a + b, 0) / Math.max(1, overPar.length)).toFixed(2) };
    }
    const parsOk = solvable.map(i => pars[i]);
    const bands = { easy: parsOk.filter(p => p <= 3).length, medium: parsOk.filter(p => p >= 4 && p <= 6).length, hard: parsOk.filter(p => p >= 7).length };
    results[name] = { rules, solvable: solvable.length, puzzles: PUZZLES, bands, meanPar: +(parsOk.reduce((a, b) => a + b, 0) / Math.max(1, parsOk.length)).toFixed(2), byBot };
    summary[name] = { solvable: `${solvable.length}/${PUZZLES}`, bands: `${bands.easy}/${bands.medium}/${bands.hard}`, ...Object.fromEntries(Object.entries(byBot).map(([b, r]) => [b, `${Math.round(r.solveRate * 100)}% +${r.meanOverPar}`])) };
  }
  console.table(summary);
  fs.writeFileSync(path.join(ROOT, 'docs/research/experiments/results/connect-all-balance.json'), JSON.stringify({ p99: P99, templates: TEMPLATES, maxMoves: MAX_MOVES, failMoves: FAIL_MOVES, candidates: candidates.length, results }, null, 2));
}, 3_600_000);

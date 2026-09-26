import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decodeVocabBinary, VocabManifest } from '../../../src/embeddings/vocabAsset';
import { VectorIndex } from '../../../src/embeddings/VectorIndex';
import { sharesStem, solveAnalogy } from '../../../src/embeddings/analogy';
import { analogyTarget, dot } from '../../../src/embeddings/vectorMath';

/**
 * Designed questions (docs/research/analogy-scoring.md, section 7): timed rounds deal relation pairs
 * from analogy categories, and a play scores when its answer completes a dealt pair. Simulates dealt
 * boards and player strategies to check the scoring can't be gamed, under two solvers: the game's
 * global solver (the answer can be any vocabulary word and spawns) and a board-restricted solver (the
 * answer must be a word already on the board). Deterministic; writes results/quad-boards.json.
 */
const ROOT = process.cwd();
const VOCAB = path.join(ROOT, 'public/vocab');
const manifest = JSON.parse(fs.readFileSync(path.join(VOCAB, 'vocab.json'), 'utf8')) as VocabManifest;
const bin = fs.readFileSync(path.join(VOCAB, 'vocab.bin'));
const index = VectorIndex.fromAsset(decodeVocabBinary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));
const LINK = manifest.calibration.p99;
const P95 = manifest.calibration.p95;
const BOARDS_PER_CATEGORY = 12;

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Pair { x: string; y: string; category: string }
const pairsByCategory = new Map<string, Pair[]>();
{
  let category = '';
  for (const line of fs.readFileSync(path.join(ROOT, 'docs/research/experiments/data/google-analogy-pairs.txt'), 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (line.startsWith(':')) { category = line.slice(1).trim(); pairsByCategory.set(category, []); continue; }
    const [x, y] = line.trim().split(/\s+/);
    pairsByCategory.get(category)!.push({ x, y, category });
  }
}

const vec = (w: string) => index.getVector(w)!;
const sim = (x: string, y: string) => dot(vec(x), vec(y));
type Solver = (a: string, b: string, c: string, board: readonly string[]) => string | undefined;
const globalSolver: Solver = (a, b, c) => solveAnalogy(index, a, b, c)?.answer;
const boardSolver: Solver = (a, b, c, board) => {
  const target = analogyTarget(vec(a), vec(b), vec(c));
  let best: string | undefined, bestScore = -Infinity;
  for (const w of board) {
    if (w === a || w === b || w === c) continue;
    const s = dot(vec(w), target);
    if (s > bestScore) { bestScore = s; best = w; }
  }
  return best;
};

/** Lenient scoring: when a board word is among the solver's top 3 answers, that board word counts. */
const globalTop3Solver: Solver = (a, b, c, board) => {
  const result = solveAnalogy(index, a, b, c, undefined, 2);
  if (!result) return undefined;
  const top = [result.answer, ...result.alternatives.map(n => n.word)];
  return top.find(w => board.includes(w)) ?? result.answer;
};

interface Board { words: string[]; pairs: Pair[]; main: string }

/** The designed plays on a board: a -> b and c -> d from two different pairs of one category, same direction. */
function designedPlays(board: Board): { a: string; b: string; c: string; d: string }[] {
  const plays: { a: string; b: string; c: string; d: string }[] = [];
  for (const p of board.pairs) for (const q of board.pairs) {
    if (p === q || p.category !== q.category) continue;
    plays.push({ a: p.x, b: p.y, c: q.x, d: q.y }, { a: p.y, b: p.x, c: q.y, d: q.x });
  }
  return plays;
}

type Outcome = 'full' | 'partial' | 'penalty' | 'none';
function outcomeOf(board: Board, a: string, b: string, c: string, answer: string | undefined): Outcome {
  if (!answer) return 'none';
  const designed = designedPlays(board).some(p => p.a === a && p.b === b && p.c === c && p.d === answer);
  if (designed) return 'full';
  const sDC = sim(answer, c);
  if (board.words.includes(answer) && sDC >= LINK) return 'partial';
  if (sDC < P95 && Math.max(sim(answer, a), sim(answer, b)) >= LINK) return 'penalty';
  return 'none';
}
const SCHEMES: Record<string, Record<Outcome, number>> = {
  'full100 partial25 penalty-10': { full: 100, partial: 25, penalty: -10, none: 0 },
  'full100 partial10 penalty-10': { full: 100, partial: 10, penalty: -10, none: 0 },
  'full100 partial0 penalty-10': { full: 100, partial: 0, penalty: -10, none: 0 },
  'full100 partial0 penalty-25': { full: 100, partial: 0, penalty: -25, none: 0 },
};

function freeOf(words: string[], w: string) {
  return !words.includes(w) && !words.some(t => sharesStem(t, w));
}

/** 3 pairs from the main category + 2 from another category; words distinct and stem-free. */
function dealBoard(main: string, random: () => number): Board | undefined {
  const others = [...pairsByCategory.keys()].filter(c => c !== main && pairsByCategory.get(c)!.length >= 8);
  const pick = (category: string, count: number, words: string[], pairs: Pair[]) => {
    const pool = [...pairsByCategory.get(category)!];
    for (let guard = 0; guard < 200 && count > 0 && pool.length > 0; guard++) {
      const [p] = pool.splice(Math.floor(random() * pool.length), 1);
      if (freeOf(words, p.x) && freeOf(words, p.y)) { words.push(p.x, p.y); pairs.push(p); count--; }
    }
    return count === 0;
  };
  const words: string[] = [], pairs: Pair[] = [];
  if (!pick(main, 3, words, pairs)) return undefined;
  if (!pick(others[Math.floor(random() * others.length)], 2, words, pairs)) return undefined;
  return { words, pairs, main };
}

it('designed-question boards: completable plays and strategy payoffs', () => {
  const random = mulberry32(20260925);
  const categories = [...pairsByCategory.keys()].filter(c => pairsByCategory.get(c)!.length >= 8);
  const strategies = ['skilled', 'pairPlusAny', 'mostSimilarPair', 'random'] as const;
  type Tally = Record<(typeof strategies)[number], Record<Outcome, number>>;
  const empty = (): Tally => Object.fromEntries(strategies.map(s => [s, { full: 0, partial: 0, penalty: 0, none: 0 }])) as Tally;
  const results: Record<string, { solver: string; completableMedian: number; boardsWith2: number; tally: Tally }[]> = {};

  for (const [solverName, solver] of [['global', globalSolver], ['globalTop3', globalTop3Solver], ['board', boardSolver]] as const) {
    for (const category of categories) {
      const tally = empty();
      const completable: number[] = [];
      for (let n = 0; n < BOARDS_PER_CATEGORY; n++) {
        const board = dealBoard(category, random);
        if (!board) continue;
        const play = (strategy: keyof Tally, a: string, b: string, c: string) => {
          tally[strategy][outcomeOf(board, a, b, c, solver(a, b, c, board.words))]++;
        };
        const designed = designedPlays(board);
        completable.push(designed.filter(p => solver(p.a, p.b, p.c, board.words) === p.d).length);
        designed.forEach(p => play('skilled', p.a, p.b, p.c));
        const w = board.words;
        const anyWord = () => w[Math.floor(random() * w.length)];
        for (let k = 0; k < 12; k++) {
          const [a, b, c] = [anyWord(), anyWord(), anyWord()];
          if (new Set([a, b, c]).size === 3) play('random', a, b, c);
          const p = board.pairs[Math.floor(random() * board.pairs.length)];
          const [pa, pb] = random() < 0.5 ? [p.x, p.y] : [p.y, p.x];
          const pc = anyWord();
          if (pc !== pa && pc !== pb) play('pairPlusAny', pa, pb, pc);
        }
        // The most similar two words on the board as a, b (the synonym-style play), c any other word.
        let best: [string, string] = [w[0], w[1]], bestSim = -Infinity;
        for (const x of w) for (const y of w) if (x < y && sim(x, y) > bestSim) { bestSim = sim(x, y); best = [x, y]; }
        for (const c of w) if (!best.includes(c)) play('mostSimilarPair', best[0], best[1], c);
      }
      const sorted = [...completable].sort((x, y) => x - y);
      (results[category] ??= []).push({
        solver: solverName,
        completableMedian: sorted[Math.floor(sorted.length / 2)] ?? 0,
        boardsWith2: +(completable.filter(c => c >= 2).length / Math.max(1, completable.length)).toFixed(2),
        tally,
      });
    }
  }

  const plays = (o: Record<Outcome, number>) => o.full + o.partial + o.penalty + o.none;
  const mean = (o: Record<Outcome, number>, scheme: Record<Outcome, number>) =>
    plays(o) ? +((o.full * scheme.full + o.partial * scheme.partial + o.penalty * scheme.penalty) / plays(o)).toFixed(1) : 0;
  const table = Object.entries(results).flatMap(([category, rows]) => rows.map(r => {
    const scheme = SCHEMES['full100 partial25 penalty-10'];
    return { category, solver: r.solver, completableMedian: r.completableMedian, boardsWith2: r.boardsWith2,
      skilled: mean(r.tally.skilled, scheme), pairPlusAny: mean(r.tally.pairPlusAny, scheme),
      mostSimilarPair: mean(r.tally.mostSimilarPair, scheme), random: mean(r.tally.random, scheme),
      outcomes: Object.fromEntries(strategies.map(s => [s, r.tally[s]])) };
  }));
  console.table(table.map(({ outcomes, ...row }) => row));
  // Payoff of each strategy relative to skilled play, per scheme, pooled over categories (global solver).
  const pooled = (solver: string) => {
    const sum = empty();
    for (const rows of Object.values(results)) for (const r of rows) if (r.solver === solver)
      for (const s of strategies) for (const o of ['full', 'partial', 'penalty', 'none'] as Outcome[]) sum[s][o] += r.tally[s][o];
    return sum;
  };
  const schemes = ['global', 'globalTop3', 'board'].flatMap(solver => Object.entries(SCHEMES).map(([name, scheme]) => {
    const sum = pooled(solver);
    const skilled = mean(sum.skilled, scheme);
    return { solver, scheme: name, skilled, ...Object.fromEntries(strategies.filter(s => s !== 'skilled').map(s => [s, `${mean(sum[s], scheme)} (${(mean(sum[s], scheme) / skilled).toFixed(2)})`])) };
  }));
  console.table(schemes);
  fs.writeFileSync(path.join(ROOT, 'docs/research/experiments/results/quad-boards.json'),
    JSON.stringify({ vocabVersion: manifest.version, schemes, boardsPerCategory: BOARDS_PER_CATEGORY, table }, null, 2));
});

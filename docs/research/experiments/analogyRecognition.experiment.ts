import { it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decodeVocabBinary, VocabManifest } from '../../../src/embeddings/vocabAsset';
import { VectorIndex } from '../../../src/embeddings/VectorIndex';
import { isInflectionOf, isMorphologicalQuestion, sharesStem } from '../../../src/embeddings/analogy';

/**
 * Analogy recognition on real analogies (docs/research/analogy-recognition.md, 2026-10-18). Owner: "make sure
 * our analogy recognition is optimized for actual analogies". Two datasets:
 *   - google:  the Google analogy test set's pairs (questions-words.txt, Mikolov et al. 2013, Apache 2.0):
 *              capitals, family, nationality, grammar;
 *   - lexical: everyday relations written for this project (antonyms, young animals, part-whole, tools,
 *              workplaces, sounds, colors, materials, kinds, synonyms; data/lexical-analogy-pairs.txt).
 * Two questions:
 *   1. Answers (Discovery, typed analogies): for a : b :: c, how often is a right d the answer (top 1) or in
 *      the top 5, per method: 3CosAdd (shipped), 3CosMul, 3CosAvg (the category's average offset over its
 *      other pairs, leave-one-out). "Hard" = questions where c's nearest word isn't a right answer.
 *   2. Recognition (Guess): how well a vector score separates real analogies a : b :: c : d from look-alikes
 *      (two pairs of different relations, a reversed second pair, random words). ROC AUC per score.
 * Deterministic; writes results/analogy-recognition.json (pilots write to the OS temp folder).
 */
const ROOT = process.cwd();
const VOCAB = path.join(ROOT, 'public/vocab');
const manifest = JSON.parse(fs.readFileSync(path.join(VOCAB, 'vocab.json'), 'utf8')) as VocabManifest;
const bin = fs.readFileSync(path.join(VOCAB, 'vocab.bin'));
const index = VectorIndex.fromAsset(decodeVocabBinary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));
const PER_CATEGORY = Number(process.env.ANALOGY_QUESTIONS ?? 150);
const SAMPLES = 300;

// --- vocabulary as one dense matrix (dequantized once) -------------------------------------------------
const N = index.baseSize;
const DIM = index.dim;
const words: string[] = [];
const matrix = new Float32Array(N * DIM);
for (let r = 0; r < N; r++) {
  const w = index.baseWordAt(r);
  words.push(w);
  matrix.set(index.getVector(w)!, r * DIM);
}
const rowOf = new Map(words.map((w, i) => [w, i]));
const vec = (w: string) => matrix.subarray(rowOf.get(w)! * DIM, (rowOf.get(w)! + 1) * DIM);
const dotv = (x: ArrayLike<number>, y: ArrayLike<number>) => { let s = 0; for (let d = 0; d < DIM; d++) s += x[d] * y[d]; return s; };
function simsTo(v: ArrayLike<number>): Float32Array {
  const out = new Float32Array(N);
  for (let r = 0; r < N; r++) { let s = 0; const o = r * DIM; for (let d = 0; d < DIM; d++) s += matrix[o + d] * v[d]; out[r] = s; }
  return out;
}
const normalize = (v: Float32Array) => { const n = Math.hypot(...v); return v.map(x => x / (n || 1)); };
function lcg(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0xffffffff; }; }

interface Pair { x: string; y: string }
function loadPairs(file: string): Map<string, Pair[]> {
  const categories = new Map<string, Pair[]>();
  let category = '';
  for (const line of fs.readFileSync(path.join(ROOT, 'docs/research/experiments/data', file), 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (line.startsWith(':')) { category = line.slice(1).trim(); categories.set(category, []); continue; }
    const [x, y] = line.trim().split(/\s+/);
    if (rowOf.has(x) && rowOf.has(y)) categories.get(category)!.push({ x, y });
  }
  for (const [c, pairs] of categories) if (pairs.length < 3) categories.delete(c); // too few for leave-one-out
  return categories;
}

/** The shipped solver's candidate filter: not an input, not a stem variant (an inflection for word-form questions). */
function allowed(word: string, q: { a: string; b: string; c: string }): boolean {
  if (word === q.a || word === q.b || word === q.c) return false;
  const variant = isMorphologicalQuestion(q.a, q.b) ? isInflectionOf : sharesStem;
  return ![q.a, q.b, q.c].some(input => variant(word, input));
}

/** Rank (1 = best) of the best right answer under `score`, among allowed candidates. */
function rankOfAnswers(q: { a: string; b: string; c: string }, answers: readonly string[], score: (r: number) => number): number {
  const rows = new Set(answers.map(a => rowOf.get(a)!));
  const best = Math.max(...[...rows].map(score));
  let rank = 1;
  for (let r = 0; r < N; r++) {
    if (rows.has(r)) continue;
    if (score(r) > best && allowed(words[r], q)) rank++;
  }
  return rank;
}

const methods = ['nearestC', 'add', 'mul', 'avg', 'blend'] as const;
type Method = typeof methods[number];
const emptyRanks = () => Object.fromEntries(methods.map(m => [m, []])) as unknown as Record<Method, number[]>;

function runDataset(name: string, categories: Map<string, Pair[]>) {
  // Questions: every ordered pair of different pairs in a category (a deterministic sample). Right answers for
  // c: every y paired with c in the category (lion → cub, bear → cub). Degenerate questions (a right answer is
  // one of the inputs: banana : yellow :: lemon : yellow) are left out.
  interface Question { category: string; a: string; b: string; c: string; answers: string[]; p: number; q: number }
  const questions: Question[] = [];
  for (const [category, pairs] of categories) {
    const all: Question[] = [];
    pairs.forEach((p, i) => pairs.forEach((q, j) => {
      if (i === j) return;
      const answers = pairs.filter(o => o.x === q.x).map(o => o.y).filter(y => y !== p.x && y !== p.y && y !== q.x);
      if (answers.length > 0 && !answers.includes(p.y)) all.push({ category, a: p.x, b: p.y, c: q.x, answers, p: i, q: j });
    }));
    const next = lcg(category.length * 7919);
    for (let k = all.length - 1; k > 0; k--) { const m = Math.floor(next() * (k + 1)); [all[k], all[m]] = [all[m], all[k]]; }
    questions.push(...all.slice(0, PER_CATEGORY));
  }

  const ranks = emptyRanks();
  const perCategory = new Map<string, Record<Method, number[]>>();
  for (const q of questions) {
    const [sa, sb, sc] = [q.a, q.b, q.c].map(w => simsTo(vec(w)));
    // 3CosAvg: the category's mean offset over its other pairs (never the question's own two pairs).
    const others = categories.get(q.category)!.filter((_, i) => i !== q.p && i !== q.q);
    const offset = new Float32Array(DIM);
    for (const o of others) { const [x, y] = [vec(o.x), vec(o.y)]; for (let d = 0; d < DIM; d++) offset[d] += (y[d] - x[d]) / others.length; }
    const sAvg = simsTo(normalize(Float32Array.from(vec(q.c), (v, d) => v + offset[d])));
    // Blend: half the question's own offset (b − a), half the relation's average (2026-10-18, after 3CosAvg alone
    // overrode right vector answers on the known-good set: hot : cold :: summer → spring).
    const [va, vb] = [vec(q.a), vec(q.b)];
    const sBlend = simsTo(normalize(Float32Array.from(vec(q.c), (v, d) => v + 0.5 * (vb[d] - va[d]) + 0.5 * offset[d])));
    const score: Record<Method, (r: number) => number> = {
      nearestC: r => sc[r],
      add: r => sb[r] - sa[r] + sc[r],
      mul: r => (((sb[r] + 1) / 2) * ((sc[r] + 1) / 2)) / ((sa[r] + 1) / 2 + 0.001),
      avg: r => sAvg[r],
      blend: r => sBlend[r],
    };
    if (!perCategory.has(q.category)) perCategory.set(q.category, emptyRanks());
    for (const m of methods) {
      const rank = rankOfAnswers(q, q.answers, score[m]);
      ranks[m].push(rank);
      perCategory.get(q.category)![m].push(rank);
    }
  }

  const acc = (rs: number[], k: number) => (rs.length ? rs.filter(r => r <= k).length / rs.length : NaN);
  const hard = ranks.nearestC.map((r, i) => (r > 1 ? i : -1)).filter(i => i >= 0);
  const summary = Object.fromEntries(methods.map(m => [m, {
    top1: +acc(ranks[m], 1).toFixed(3),
    top5: +acc(ranks[m], 5).toFixed(3),
    hardTop1: +acc(hard.map(i => ranks[m][i]), 1).toFixed(3),
  }]));
  const byCategory = Object.fromEntries([...perCategory].map(([c, r]) => [c, {
    questions: r.add.length,
    ...Object.fromEntries(methods.map(m => [m, +acc(r[m], 1).toFixed(2)])),
  }]));

  // --- 2. recognition: real analogies vs look-alikes ---------------------------------------------------
  const offsetCos = (a: string, b: string, c: string, d: string) => {
    const [va, vb, vc, vd] = [a, b, c, d].map(vec);
    const u = Float32Array.from(vb, (v, i) => v - va[i]);
    const w = Float32Array.from(vd, (v, i) => v - vc[i]);
    return dotv(u, w) / (Math.hypot(...u) * Math.hypot(...w) || 1);
  };
  /** 1 / rank of d under 3CosAdd for a : b :: c (how strongly the vectors themselves propose d). */
  const proposes = (a: string, b: string, c: string, d: string) => {
    const [sa, sb, sc] = [a, b, c].map(w => simsTo(vec(w)));
    return 1 / rankOfAnswers({ a, b, c }, [d], r => sb[r] - sa[r] + sc[r]);
  };
  const next = lcg(424242);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)];
  const cats = [...categories.keys()];
  type Quad = [string, string, string, string];
  const sample = (make: () => Quad) => Array.from({ length: SAMPLES }, make);
  const twoPairs = (): [Pair, Pair] => { const ps = categories.get(pick(cats))!; const p = pick(ps); let q = pick(ps); while (q === p) q = pick(ps); return [p, q]; };
  const real = sample(() => { const [p, q] = twoPairs(); return [p.x, p.y, q.x, q.y]; });
  const crossRelation = sample(() => { const c1 = pick(cats); let c2 = pick(cats); while (c2 === c1) c2 = pick(cats); const p = pick(categories.get(c1)!); const q = pick(categories.get(c2)!); return [p.x, p.y, q.x, q.y]; });
  const reversed = sample(() => { const [p, q] = twoPairs(); return [p.x, p.y, q.y, q.x]; });
  const randomWords = sample(() => [0, 1, 2, 3].map(() => words[200 + Math.floor(next() * 5000)]) as Quad);
  const auc = (pos: number[], neg: number[]) => {
    let wins = 0;
    for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
    return wins / (pos.length * neg.length);
  };
  const recognition: Record<string, Record<string, number>> = {};
  for (const [scorer, f] of Object.entries({ offsetCos, proposes })) {
    const pos = real.map(q => f(...q));
    const cross = crossRelation.map(q => f(...q));
    const threshold = [...cross].sort((x, y) => x - y)[Math.floor(cross.length * 0.95)];
    recognition[scorer] = {
      vsCrossRelation: +auc(pos, cross).toFixed(3),
      vsReversedPair: +auc(pos, reversed.map(q => f(...q))).toFixed(3),
      vsRandomWords: +auc(pos, randomWords.map(q => f(...q))).toFixed(3),
      // Share of real analogies accepted at the threshold that rejects 95% of cross-relation look-alikes.
      recallAt5pctFalse: +(pos.filter(p => p > threshold).length / pos.length).toFixed(3),
    };
  }
  return { name, categories: categories.size, pairs: [...categories.values()].reduce((s, p) => s + p.length, 0), questions: questions.length, hardQuestions: hard.length, summary, byCategory, recognition };
}

it('analogy recognition: answer accuracy per method, and how well real analogies are told apart', () => {
  // (A pilot also limited candidates to the 10,000 most frequent words: worse for every method, dropped.)
  const datasets = [runDataset('google', loadPairs('google-analogy-pairs.txt')), runDataset('lexical', loadPairs('lexical-analogy-pairs.txt'))];
  const result = { perCategory: PER_CATEGORY, samples: SAMPLES, vocabulary: N, datasets };
  const out = PER_CATEGORY >= 150 ? path.join(ROOT, 'docs/research/experiments/results/analogy-recognition.json') : path.join(os.tmpdir(), 'analogy-recognition.pilot.json');
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
}, 3_600_000);

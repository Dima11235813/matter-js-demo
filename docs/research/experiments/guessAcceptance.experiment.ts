import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decodeVocabBinary, VocabManifest } from '../../../src/embeddings/vocabAsset';
import { VectorIndex } from '../../../src/embeddings/VectorIndex';
import { dot } from '../../../src/embeddings/vectorMath';
import { analogyTarget } from '../../../src/embeddings/vectorMath';
import { dealRelationPairs, gradeGuess, parseRelationBank, RelationPair } from '../../../src/game/relationPairs';

/**
 * Guess acceptance (docs/research/analogy-recognition.md §8, Epic 2 · Task 2.17.4): should a Guess pick score when it
 * is any two bank pairs of one relation among the board's words, not only two pairs dealt together? Simulates
 * real deals (the shipped bank and dealer, 3 main + 2 other pairs) on fresh boards and on boards that also carry 8
 * Discovery words, and grades player strategies with the real grader under both rules:
 *   dealtOnly  (shipped): gradeGuess(dealt pairs)
 *   boardBank  (proposed): gradeGuess(every bank pair whose two words are on the board)
 * Strategies: skilled (a real dealt analogy), bankExpert (any bank analogy on the board: knowledge, the gain),
 * random (four board words), mostSimilar (the two most similar disjoint word pairs), vectorPlayer (three random
 * words and the board word 3CosAdd likes best). The rule is safe when the knowledge-free strategies don't gain.
 * Deterministic; writes results/guess-acceptance.json.
 */
const ROOT = process.cwd();
const VOCAB = path.join(ROOT, 'public/vocab');
const manifest = JSON.parse(fs.readFileSync(path.join(VOCAB, 'vocab.json'), 'utf8')) as VocabManifest;
const bin = fs.readFileSync(path.join(VOCAB, 'vocab.bin'));
const index = VectorIndex.fromAsset(decodeVocabBinary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));
const bank = parseRelationBank(fs.readFileSync(path.join(ROOT, 'data/vocab/relation-pairs.txt'), 'utf8'));
const allPairs = [...bank.values()].flat();
const BOARDS = Number(process.env.GUESS_BOARDS ?? 400);
const GUESSES = 20; // per strategy per board

function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const vec = (w: string) => index.getVector(w)!;
const sim = (x: string, y: string) => dot(vec(x), vec(y));

/** Every bank pair whose two words are on the board (the proposed rule's accepted pairs). */
const boardPairs = (words: readonly string[]): RelationPair[] => {
  const on = new Set(words);
  return allPairs.filter(p => on.has(p.x) && on.has(p.y));
};
/** Every accepted quad for a set of pairs (two different pairs of one category, same direction, both forms). */
function quads(pairs: readonly RelationPair[]): [string, string, string, string][] {
  const out: [string, string, string, string][] = [];
  for (const p of pairs) for (const q of pairs) {
    if (p === q || p.category !== q.category) continue;
    out.push([p.x, p.y, q.x, q.y], [p.y, p.x, q.y, q.x]);
  }
  return out;
}

it('Guess acceptance: dealt pairs only vs any bank pair on the board', () => {
  const random = mulberry32(20261018);
  const carriedPool: string[] = [];
  for (let r = 300; r < 6000; r++) { const w = index.baseWordAt(r); if (/^[a-z]{3,}$/.test(w)) carriedPool.push(w); }
  const strategies = ['skilled', 'bankExpert', 'random', 'mostSimilar', 'vectorPlayer'] as const;
  type Strategy = typeof strategies[number];
  const rules = ['dealtOnly', 'boardBank'] as const;
  type Rule = typeof rules[number];
  const results: Record<string, unknown> = {};

  for (const carried of [0, 8]) {
    const points: Record<Rule, Record<Strategy, number[]>> = { dealtOnly: Object.fromEntries(strategies.map(s => [s, []])) as unknown as Record<Strategy, number[]>, boardBank: Object.fromEntries(strategies.map(s => [s, []])) as unknown as Record<Strategy, number[]> };
    const extraQuads: number[] = [];
    for (let n = 0; n < BOARDS; n++) {
      // Carried Discovery words first (the dealer keeps dealt words clear of words in play), then the deal.
      const carriedWords: string[] = [];
      while (carriedWords.length < carried) { const w = carriedPool[Math.floor(random() * carriedPool.length)]; if (!carriedWords.includes(w)) carriedWords.push(w); }
      const deal = dealRelationPairs(bank, { mainPairs: 3, otherPairs: 2, inPlay: carriedWords, allow: w => index.has(w), random });
      if (deal.pairs.length < 4) continue;
      const words = [...carriedWords, ...deal.words];
      const accepted: Record<Rule, RelationPair[]> = { dealtOnly: deal.pairs, boardBank: boardPairs(words) };
      const dealtQuads = quads(deal.pairs);
      const bankQuads = quads(accepted.boardBank);
      extraQuads.push(bankQuads.length - dealtQuads.length);
      const pick = <T,>(xs: readonly T[]) => xs[Math.floor(random() * xs.length)];
      const four = (): [string, string, string, string] => {
        const out: string[] = [];
        while (out.length < 4) { const w = pick(words); if (!out.includes(w)) out.push(w); }
        return out as [string, string, string, string];
      };
      // The two most similar disjoint word pairs on the board.
      const byPairSim: [string, string, number][] = [];
      for (const x of words) for (const y of words) if (x < y) byPairSim.push([x, y, sim(x, y)]);
      byPairSim.sort((u, v) => v[2] - u[2]);
      const [p1] = byPairSim;
      const p2 = byPairSim.find(([x, y]) => ![p1[0], p1[1]].includes(x) && ![p1[0], p1[1]].includes(y))!;
      const plays: Record<Strategy, () => [string, string, string, string] | undefined> = {
        skilled: () => (dealtQuads.length ? pick(dealtQuads) : undefined),
        bankExpert: () => (bankQuads.length ? pick(bankQuads) : undefined),
        random: four,
        mostSimilar: () => (random() < 0.5 ? [p1[0], p1[1], p2[0], p2[1]] : [p1[1], p1[0], p2[1], p2[0]]),
        vectorPlayer: () => {
          const [a, b, c] = four();
          const target = analogyTarget(vec(a), vec(b), vec(c));
          const d = words.filter(w => ![a, b, c].includes(w)).sort((u, v) => dot(vec(v), target) - dot(vec(u), target))[0];
          return [a, b, c, d];
        },
      };
      for (const strategy of strategies) for (let g = 0; g < GUESSES; g++) {
        const quad = plays[strategy]();
        if (!quad) continue;
        for (const rule of rules) points[rule][strategy].push(gradeGuess(accepted[rule], ...quad).points);
      }
    }
    const mean = (xs: number[]) => (xs.length ? +(xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1) : 0);
    const correct = (xs: number[]) => (xs.length ? +(xs.filter(x => x === 100).length / xs.length).toFixed(3) : 0);
    results[`carried${carried}`] = {
      boards: extraQuads.length,
      boardsWithExtraAnalogies: +(extraQuads.filter(x => x > 0).length / extraQuads.length).toFixed(3),
      meanExtraQuads: mean(extraQuads),
      byRule: Object.fromEntries(rules.map(rule => [rule, Object.fromEntries(strategies.map(s => [s, { meanPoints: mean(points[rule][s]), correct: correct(points[rule][s]) }]))])),
    };
  }
  fs.writeFileSync(path.join(ROOT, 'docs/research/experiments/results/guess-acceptance.json'), JSON.stringify({ boards: BOARDS, guessesPerStrategy: GUESSES, bankPairs: allPairs.length, results }, null, 2) + '\n');
}, 3_600_000);

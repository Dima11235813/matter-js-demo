import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decodeVocabBinary, VocabManifest } from '../../../src/embeddings/vocabAsset';
import { VectorIndex } from '../../../src/embeddings/VectorIndex';
import { dealRelationPairs, gradeGuess, parseRelationBank } from '../../../src/game/relationPairs';
import { relationHint, RelationStats } from '../../../src/game/relationHint';
import { lcg } from '../../../src/game/connectPuzzles';

/**
 * Guess mode partial credit (docs/research/analogy-scoring.md §8). Owner play-test: husband : father ::
 * wife : mother scored 0 although the hint said the relation carried over (it was the swapped form of
 * two dealt pairs; fixed separately). Should a guess the dealt pairs don't cover still earn partial
 * points when the embedding carries the relation? Every ordered 4-pick on real Guess boards is
 * classified (designed / carried / neither) and each strategy's expected points are compared for
 * partial values 0, 10, 25, 50. Deterministic; writes results/guess-partial.json.
 */
const ROOT = process.cwd();
const VOCAB = path.join(ROOT, 'public/vocab');
const manifest = JSON.parse(fs.readFileSync(path.join(VOCAB, 'vocab.json'), 'utf8')) as VocabManifest;
const bin = fs.readFileSync(path.join(VOCAB, 'vocab.bin'));
const index = VectorIndex.fromAsset(decodeVocabBinary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));
const profane = new Set(manifest.profane.map(i => manifest.words[i]));
const bank = parseRelationBank(fs.readFileSync(path.join(ROOT, 'data/vocab/relation-pairs.txt'), 'utf8'));
const cal = manifest.calibration;
const thresholds = { related: cal.p90, near: cal.p95, link: cal.p99 };
const BOARDS = 200;
const PARTIALS = [0, 10, 25, 50];

function stats(a: Float32Array, b: Float32Array, c: Float32Array, d: Float32Array): RelationStats {
  let ab = 0, dc = 0, da = 0, db = 0, off = 0, n1 = 0, n2 = 0;
  for (let i = 0; i < a.length; i++) {
    ab += a[i] * b[i]; dc += d[i] * c[i]; da += d[i] * a[i]; db += d[i] * b[i];
    const r = b[i] - a[i], s = d[i] - c[i];
    off += r * s; n1 += r * r; n2 += s * s;
  }
  return { ab, dc, da, db, offset: n1 && n2 ? off / Math.sqrt(n1 * n2) : 0 };
}

it('Guess partial credit: designed vs carried vs random picks', () => {
  let picks = 0, designed = 0, carried = 0, carriedDesigned = 0, pairPicks = 0, pairDesigned = 0, pairCarried = 0, anchored = 0, nearMisses = 0, pairNear = 0;
  const anchoredExamples: string[] = [];
  const examples: string[] = [];
  const perBoardCarriedOnly: number[] = [];
  for (let b = 0; b < BOARDS; b++) {
    const deal = dealRelationPairs(bank, { mainPairs: 3, otherPairs: 2, allow: w => index.has(w) && !profane.has(w), random: lcg(500 + b) });
    const words = deal.words;
    const vec = words.map(w => index.getVector(w)!);
    const dealtPair = new Set(deal.pairs.flatMap(p => [`${p.x}|${p.y}`, `${p.y}|${p.x}`]));
    let carriedOnly = 0;
    for (let i = 0; i < words.length; i++) for (let j = 0; j < words.length; j++) for (let k = 0; k < words.length; k++) for (let l = 0; l < words.length; l++) {
      if (new Set([i, j, k, l]).size < 4) continue;
      picks++;
      const grade = gradeGuess(deal.pairs, words[i], words[j], words[k], words[l]);
      const isDesigned = grade.correct;
      if (grade.nearMiss) nearMisses++;
      const isCarried = relationHint(stats(vec[i], vec[j], vec[k], vec[l]), thresholds) === 'carried';
      if (isDesigned) designed++;
      if (isCarried) carried++;
      if (isDesigned && isCarried) carriedDesigned++;
      // Anchored: carried, not designed, and one side is a real dealt pair (a-b or c-d; or a-c / b-d, the swapped form).
      const pairOf = (x: number, y: number) => dealtPair.has(`${words[x]}|${words[y]}`);
      if (isCarried && !isDesigned && (pairOf(i, j) || pairOf(k, l) || pairOf(i, k) || pairOf(j, l))) {
        anchored++;
        if (anchoredExamples.length < 40 && b % 3 === 0) anchoredExamples.push(`${words[i]} : ${words[j]} :: ${words[k]} : ${words[l]}  (${deal.category})`);
      }
      if (isCarried && !isDesigned) {
        carriedOnly++;
        if (examples.length < 40 && b % 5 === 0) examples.push(`${words[i]} : ${words[j]} :: ${words[k]} : ${words[l]}  (${deal.category})`);
      }
      // Half-informed: a dealt pair as a, b, then any c, d.
      if (dealtPair.has(`${words[i]}|${words[j]}`)) { pairPicks++; if (isDesigned) pairDesigned++; if (grade.nearMiss) pairNear++; if (isCarried && !isDesigned) pairCarried++; }
    }
    perBoardCarriedOnly.push(carriedOnly);
  }
  const share = (n: number, d: number) => +(n / d).toFixed(4);
  const designedShare = designed / picks, carriedOnlyShare = (carried - carriedDesigned) / picks;
  const table = PARTIALS.map(partial => {
    const skilled = 100;
    const random = 100 * designedShare + partial * carriedOnlyShare;
    const half = (100 * pairDesigned + partial * pairCarried) / pairPicks;
    // An exploit player who could spot every carried-but-not-designed pick and plays only those.
    const hintHunter = partial;
    return { partial, skilled, random: +random.toFixed(2), randomShareOfSkilled: +(random / skilled).toFixed(3), halfInformed: +half.toFixed(2), hintHunter };
  });
  const sorted = [...perBoardCarriedOnly].sort((a, b) => a - b);
  const result = {
    boards: BOARDS, picks,
    designedShare: share(designed, picks), carriedShare: share(carried, picks),
    carriedAmongDesigned: share(carriedDesigned, designed),
    anchoredShare: share(anchored, picks), anchoredExamples,
    nearMissShare: share(nearMisses, picks),
    // Shipped rule (2026-10-05): designed 100, near miss 25, vector hint 0.
    shipped: { random: +((100 * designed + 25 * nearMisses) / picks).toFixed(2), halfInformed: +((100 * pairDesigned + 25 * pairNear) / pairPicks).toFixed(2), skilled: 100 },
    carriedOnlyPerBoard: { median: sorted[Math.floor(sorted.length / 2)], p10: sorted[Math.floor(sorted.length * 0.1)], p90: sorted[Math.floor(sorted.length * 0.9)] },
    table, examples,
  };
  console.log(JSON.stringify({ ...result, examples: examples.slice(0, 15) }, null, 2));
  fs.writeFileSync(path.join(ROOT, 'docs/research/experiments/results/guess-partial.json'), JSON.stringify(result, null, 2));
}, 600_000);

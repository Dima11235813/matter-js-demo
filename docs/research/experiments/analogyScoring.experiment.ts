import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decodeVocabBinary, VocabManifest } from '../../../src/embeddings/vocabAsset';
import { VectorIndex } from '../../../src/embeddings/VectorIndex';
import { sharesStem, solveAnalogy } from '../../../src/embeddings/analogy';
import { dealWords } from '../../../src/game/dealer';
import { dot } from '../../../src/embeddings/vectorMath';
import { analogyPoints } from '../../../src/game/timedGame';

/**
 * Analogy scoring (docs/research/analogy-scoring.md): proposed rule "reward the answer when it
 * connects to the third word, penalize it when it connects to the first or second". Is that
 * rule fair to real analogies, and can it be gamed? Plays from four populations are scored under
 * the current rule and three candidates. Deterministic; writes results/analogy-scoring.json.
 */
const ROOT = process.cwd();
const VOCAB = path.join(ROOT, 'public/vocab');
const manifest = JSON.parse(fs.readFileSync(path.join(VOCAB, 'vocab.json'), 'utf8')) as VocabManifest;
const bin = fs.readFileSync(path.join(VOCAB, 'vocab.bin'));
const index = VectorIndex.fromAsset(decodeVocabBinary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));
const LINK = manifest.calibration.p99; // the "connection" the hint layout draws

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Known-good analogies a : b :: c : expected. */
const CANONICAL: [string, string, string, string][] = [
  ['man', 'king', 'woman', 'queen'], ['man', 'father', 'woman', 'mother'], ['boy', 'girl', 'brother', 'sister'],
  ['husband', 'wife', 'uncle', 'aunt'], ['prince', 'princess', 'actor', 'actress'], ['son', 'daughter', 'nephew', 'niece'],
  ['france', 'paris', 'japan', 'tokyo'], ['france', 'paris', 'italy', 'rome'], ['germany', 'berlin', 'spain', 'madrid'],
  ['russia', 'moscow', 'england', 'london'], ['china', 'beijing', 'egypt', 'cairo'],
  ['good', 'better', 'bad', 'worse'], ['big', 'bigger', 'small', 'smaller'], ['fast', 'faster', 'slow', 'slower'],
  ['hot', 'cold', 'summer', 'winter'], ['day', 'night', 'sun', 'moon'], ['up', 'down', 'left', 'right'],
  ['dog', 'puppy', 'cat', 'kitten'], ['cow', 'calf', 'sheep', 'lamb'], ['horse', 'foal', 'cow', 'calf'],
  ['finger', 'hand', 'toe', 'foot'], ['doctor', 'hospital', 'teacher', 'school'], ['chef', 'kitchen', 'pilot', 'cockpit'],
  ['pen', 'write', 'knife', 'cut'], ['bird', 'fly', 'fish', 'swim'], ['eye', 'see', 'ear', 'hear'],
  ['banana', 'yellow', 'apple', 'red'], ['water', 'drink', 'food', 'eat'], ['walk', 'walked', 'run', 'ran'],
  ['japan', 'japanese', 'france', 'french'], ['car', 'road', 'train', 'track'], ['winter', 'snow', 'summer', 'sun'],
];

interface Play { a: string; b: string; c: string; expected?: string; population: string; category?: string }
interface Scored extends Play {
  d: string; similarity: number; sAB: number; sDA: number; sDB: number; sDC: number;
  offsetCos: number; trivial: boolean; correct?: boolean;
  /** Position of d among c's nearest words (0 = nearest, -1 = not in the top 10). */
  rankInC: number;
  /** Reverse check: does c : d :: a lead back to b? Position of b in that answer list (-1 = not in top 6). */
  roundTrip: number;
  current: number; literal: -1 | 0 | 1; nearest: -1 | 1; transfer: -1 | 0 | 1;
}

const vec = (w: string) => index.getVector(w)!;
const sim = (x: string, y: string) => dot(vec(x), vec(y));

/** Where d sits among c's nearest words, under the solver's exclusions (-1 = beyond the top 10). */
function rankAmongNeighbours(a: string, b: string, c: string, d: string): number {
  const inputs = [a, b, c];
  const near = index.nearest(vec(c), { k: 10, exclude: new Set(inputs), allow: w => !inputs.some(i => sharesStem(w, i)) });
  return near.findIndex(n => n.word === d);
}

/** Reverse analogy c : d :: a -> ?, and where b lands in its answers (-1 = not in the top 6). */
function roundTripRank(a: string, b: string, c: string, d: string): number {
  const reverse = solveAnalogy(index, c, d, a);
  if (!reverse) return -1;
  return [reverse.answer, ...reverse.alternatives.map(n => n.word)].indexOf(b);
}

/** c's nearest word under the same exclusions the solver uses: what c alone would give. */
function nearestToC(a: string, b: string, c: string): string | undefined {
  const inputs = [a, b, c];
  const [best] = index.nearest(vec(c), { k: 1, exclude: new Set(inputs), allow: w => !inputs.some(i => sharesStem(w, i)) });
  return best?.word;
}

function offsetCosine(a: string, b: string, c: string, d: string): number {
  const [va, vb, vc, vd] = [a, b, c, d].map(vec);
  let num = 0, n1 = 0, n2 = 0;
  for (let i = 0; i < va.length; i++) {
    const r = vb[i] - va[i], s = vd[i] - vc[i];
    num += r * s; n1 += r * r; n2 += s * s;
  }
  return num / Math.sqrt(n1 * n2);
}

/**
 * Candidate "transfer" rule: the relation a -> b must move c somewhere (d is not simply c's
 * nearest word), d must sit on c's side (closer to c than to a, as b is to a), and the offsets
 * must roughly agree. Penalize only a collapse onto the question pair (d closer to a or b than to c).
 */
const OFFSET_MIN = 0.25;
function transferRule(s: Omit<Scored, 'transfer'>): -1 | 0 | 1 {
  if (s.sDA > s.sDC && s.sDB > s.sDC) return -1; // collapsed onto the question pair
  if (!s.trivial && s.sDC > s.sDA && s.offsetCos >= OFFSET_MIN) return 1;
  return 0;
}

function score(play: Play): Scored | undefined {
  const { a, b, c } = play;
  const result = solveAnalogy(index, a, b, c);
  if (!result) return undefined;
  const d = result.answer;
  const base = {
    ...play, d, similarity: result.similarity,
    sAB: sim(a, b), sDA: sim(d, a), sDB: sim(d, b), sDC: sim(d, c),
    offsetCos: offsetCosine(a, b, c, d), trivial: nearestToC(a, b, c) === d,
    rankInC: rankAmongNeighbours(a, b, c, d), roundTrip: roundTripRank(a, b, c, d),
    correct: play.expected ? d === play.expected : undefined,
    current: analogyPoints(result.similarity),
  };
  const linkA = base.sDA >= LINK, linkB = base.sDB >= LINK, linkC = base.sDC >= LINK;
  const literal: -1 | 0 | 1 = linkA || linkB ? -1 : linkC ? 1 : 0;
  const nearest: -1 | 1 = base.sDC > Math.max(base.sDA, base.sDB) ? 1 : -1;
  const partial = { ...base, literal, nearest };
  return { ...partial, transfer: transferRule(partial) };
}

function populations(): Play[] {
  const random = mulberry32(20260924);
  const plays: Play[] = [];
  const known = (...w: string[]) => w.every(x => index.has(x));

  for (const [a, b, c, expected] of CANONICAL) if (known(a, b, c, expected)) plays.push({ a, b, c, expected, population: 'canonical' });

  // Held-out validation: the Google analogy test set, vocabulary-filtered (data/google-analogies-vocab.txt).
  let category = '';
  for (const line of fs.readFileSync(path.join(ROOT, 'docs/research/experiments/data/google-analogies-vocab.txt'), 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (line.startsWith(':')) { category = line.slice(1).trim(); continue; }
    const [a, b, c, expected] = line.trim().split(/\s+/);
    plays.push({ a, b, c, expected, population: 'heldout', category });
  }

  // Timed-game plays: dealt boards (related pairs); a, b from one pair, c from another ("pair"),
  // or any three board words ("board").
  for (let board = 0; board < 20; board++) {
    const dealt = dealWords(index, { count: 10, inPlay: [], allow: () => true, partnerThreshold: LINK, random });
    const pairs: [string, string][] = [];
    for (let i = 0; i + 1 < dealt.length; i += 2) pairs.push([dealt[i], dealt[i + 1]]);
    for (let n = 0; n < 12 && pairs.length >= 2; n++) {
      const [p, q] = [Math.floor(random() * pairs.length), Math.floor(random() * pairs.length)];
      if (p === q) continue;
      const [a, b] = random() < 0.5 ? pairs[p] : [pairs[p][1], pairs[p][0]];
      plays.push({ a, b, c: pairs[q][Math.floor(random() * 2)], population: 'dealtPair' });
    }
    for (let n = 0; n < 8; n++) {
      const pick = () => dealt[Math.floor(random() * dealt.length)];
      const [a, b, c] = [pick(), pick(), pick()];
      if (new Set([a, b, c]).size === 3) plays.push({ a, b, c, population: 'dealtAny' });
    }
  }

  const common = () => index.baseWordAt(Math.floor(random() * 4000));
  for (let n = 0; n < 150; n++) {
    // Exploit 1: a and b near-synonyms, so b - a ~ 0 and the answer is just c's neighbour.
    const a = common();
    const [syn] = index.nearest(vec(a), { k: 1, exclude: new Set([a]), allow: w => !sharesStem(w, a) });
    const c = common();
    if (syn && c !== a && c !== syn.word) plays.push({ a, b: syn.word, c, population: 'exploitSynonym' });
    // Exploit 2: c is b's neighbour, so the answer lands next to the question pair.
    const x = common(), y = common();
    const [nearB] = index.nearest(vec(y), { k: 1, exclude: new Set([x, y]), allow: w => !sharesStem(w, y) && !sharesStem(w, x) });
    if (nearB && x !== y) plays.push({ a: x, b: y, c: nearB.word, population: 'exploitNearB' });
    // Nonsense: three unrelated common words.
    const [r1, r2, r3] = [common(), common(), common()];
    if (new Set([r1, r2, r3]).size === 3) plays.push({ a: r1, b: r2, c: r3, population: 'random' });
  }
  return plays;
}

function summarize(rows: Scored[]) {
  const rate = (f: (s: Scored) => boolean) => +(rows.filter(f).length / rows.length).toFixed(2);
  const mean = (f: (s: Scored) => number) => +(rows.reduce((t, s) => t + f(s), 0) / rows.length).toFixed(3);
  return {
    n: rows.length,
    correct: rows[0]?.expected !== undefined ? rate(s => !!s.correct) : undefined,
    trivial: rate(s => s.trivial),
    meanCurrentPoints: mean(s => s.current),
    literal: { reward: rate(s => s.literal === 1), penalty: rate(s => s.literal === -1), neutral: rate(s => s.literal === 0) },
    nearest: { reward: rate(s => s.nearest === 1), penalty: rate(s => s.nearest === -1) },
    transfer: { reward: rate(s => s.transfer === 1), penalty: rate(s => s.transfer === -1), neutral: rate(s => s.transfer === 0) },
    mean: { sAB: mean(s => s.sAB), sDA: mean(s => s.sDA), sDB: mean(s => s.sDB), sDC: mean(s => s.sDC), offsetCos: mean(s => s.offsetCos) },
  };
}

it('analogy scoring: current rule vs candidates', () => {
  const scored = populations().map(score).filter((s): s is Scored => !!s);
  const byPopulation: Record<string, ReturnType<typeof summarize>> = {};
  for (const population of [...new Set(scored.map(s => s.population))]) {
    byPopulation[population] = summarize(scored.filter(s => s.population === population));
  }
  const canonical = scored.filter(s => s.population === 'canonical').map(s => ({
    question: `${s.a} : ${s.b} :: ${s.c}`, expected: s.expected, answer: s.d, sim: +s.similarity.toFixed(2),
    sDA: +s.sDA.toFixed(2), sDB: +s.sDB.toFixed(2), sDC: +s.sDC.toFixed(2), offsetCos: +s.offsetCos.toFixed(2), trivial: s.trivial,
    current: s.current, literal: s.literal, nearest: s.nearest, transfer: s.transfer,
  }));
  const examples = (population: string) => scored.filter(s => s.population === population).slice(0, 6)
    .map(s => `${s.a} : ${s.b} :: ${s.c} -> ${s.d} (current ${s.current}, literal ${s.literal}, nearest ${s.nearest}, transfer ${s.transfer})`);

  // Rule family keeping the proposal's core ("the answer connects to the third word") plus guards:
  //   reward  = a-b related (sAB >= tAB) AND d connects to c (sDC >= tC) AND same relation (offsetCos >= tOff)
  //   penalty = d connects to a or b (>= link) but NOT to c: the answer collapsed onto the question pair.
  const P95 = manifest.calibration.p95;
  const grid: { rule: string; [population: string]: string | number }[] = [];
  for (const [tABName, tAB] of [['p95', P95], ['p99', LINK]] as const) {
    for (const [tCName, tC] of [['p95', P95], ['p99', LINK]] as const) {
      for (const tOff of [0.2, 0.25, 0.3, 0.35]) {
        const row: { rule: string; [population: string]: string | number } = { rule: `sAB>=${tABName} sDC>=${tCName} off>=${tOff}` };
        for (const population of Object.keys(byPopulation)) {
          const rows = scored.filter(s => s.population === population);
          const reward = rows.filter(s => s.sAB >= tAB && s.sDC >= tC && s.offsetCos >= tOff).length / rows.length;
          const penalty = rows.filter(s => s.sDC < tC && Math.max(s.sDA, s.sDB) >= LINK).length / rows.length;
          row[population] = `${Math.round(reward * 100)}/${Math.round(penalty * 100)}`;
        }
        grid.push(row);
      }
    }
  }
  // The proposed rule (analogy-scoring.md section 3.2) per held-out category.
  const proposed = (s: Scored) => s.sAB >= LINK && s.sDC >= P95 && s.offsetCos >= 0.25;
  const collapsed = (s: Scored) => s.sDC < P95 && Math.max(s.sDA, s.sDB) >= LINK;
  const heldout = scored.filter(s => s.population === 'heldout');
  const byCategory = [...new Set(heldout.map(s => s.category!))].map(category => {
    const rows = heldout.filter(s => s.category === category);
    const pct = (f: (s: Scored) => boolean) => Math.round((rows.filter(f).length / rows.length) * 100);
    return { category, n: rows.length, correct: pct(s => !!s.correct), reward: pct(proposed), penalty: pct(collapsed),
      rewardWhenCorrect: pct(s => !!s.correct && proposed(s)), penaltyWhenCorrect: pct(s => !!s.correct && collapsed(s)) };
  });
  console.table(byCategory);
  // Tiered rule: score how much insight a play took, not whether it is "true".
  //   insight = related pair, answer connects to c, the answer is NOT among c's top-k neighbours
  //             (the relation moved it), and the reverse analogy leads back to b (top-r)
  //   easy    = related pair, answer connects to c, but it is c's near neighbour (small points)
  //   penalty = answer connects to a or b but not to c
  const tiers: { rule: string; [population: string]: string | number }[] = [];
  for (const k of [1, 2, 3]) {
    for (const r of [0, 2, 5]) {
      const row: { rule: string; [population: string]: string | number } = { rule: `insight: rankInC>=${k} or none, roundTrip<=${r}` };
      for (const population of Object.keys(byPopulation)) {
        const rows = scored.filter(s => s.population === population);
        const base = (s: Scored) => s.sAB >= LINK && s.sDC >= P95;
        const insight = rows.filter(s => base(s) && (s.rankInC < 0 || s.rankInC >= k) && s.roundTrip >= 0 && s.roundTrip <= r).length / rows.length;
        const easy = rows.filter(s => base(s) && s.rankInC >= 0 && s.rankInC < k).length / rows.length;
        const penalty = rows.filter(s => s.sDC < P95 && Math.max(s.sDA, s.sDB) >= LINK).length / rows.length;
        row[population] = `${Math.round(insight * 100)}/${Math.round(easy * 100)}/${Math.round(penalty * 100)}`;
      }
      tiers.push(row);
    }
  }
  console.log('insight%/easy%/penalty% per population');
  console.table(tiers);
  console.log('reward%/penalty% per population');
  console.table(grid);
  const offsetDeciles = Object.fromEntries(Object.keys(byPopulation).map(p => {
    const values = scored.filter(s => s.population === p).map(s => s.offsetCos).sort((x, y) => x - y);
    return [p, [0.1, 0.25, 0.5, 0.75, 0.9].map(q => +values[Math.floor(q * (values.length - 1))].toFixed(2))];
  }));

  const rowsOf = (population: string) => scored.filter(s => s.population === population).map(s => ({
    category: s.category, q: `${s.a}:${s.b}::${s.c}`, d: s.d, expected: s.expected, correct: s.correct, trivial: s.trivial,
    sAB: +s.sAB.toFixed(3), sDA: +s.sDA.toFixed(3), sDB: +s.sDB.toFixed(3), sDC: +s.sDC.toFixed(3), off: +s.offsetCos.toFixed(3), sim: +s.similarity.toFixed(3),
    rankInC: s.rankInC, roundTrip: s.roundTrip,
  }));
  const rows = Object.fromEntries(Object.keys(byPopulation).map(p => [p, rowsOf(p)]));
  const out = { vocabVersion: manifest.version, linkThreshold: LINK, offsetMin: OFFSET_MIN, byPopulation, grid, tiers, offsetDeciles, byCategory, canonical, rows,
    examples: { exploitSynonym: examples('exploitSynonym'), exploitNearB: examples('exploitNearB'), dealtPair: examples('dealtPair'), random: examples('random') } };
  fs.writeFileSync(path.join(ROOT, 'docs/research/experiments/results/analogy-scoring.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(byPopulation, null, 1));
  console.table(canonical);
});

import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decodeVocabBinary, VocabManifest } from '../../../src/embeddings/vocabAsset';
import { VectorIndex } from '../../../src/embeddings/VectorIndex';
import { dot } from '../../../src/embeddings/vectorMath';
import { defaultOrbitalTuning, metricTarget, OrbitalTuning } from '../../../src/physics/orbitalForces';
import { layoutFidelity, spearman } from '../../../src/physics/layoutMetrics';
import { defaultSpaceConfig, SpaceConfig, SpaceSimulation } from '../../../src/physics/spaceSimulation';
import { classicalMds, gramCoordinates, Matrix } from './linalg';

/**
 * Embedding-shape experiments (docs/research/embedding-shape.md): why does the 3D hint view settle
 * into a sphere, and which layout model lets embedding distances decide the shape?
 * Deterministic; writes results/embedding-shape.json.
 */
const ROOT = process.cwd();
const VOCAB = path.join(ROOT, 'public/vocab');
const manifest = JSON.parse(fs.readFileSync(path.join(VOCAB, 'vocab.json'), 'utf8')) as VocabManifest;
const bin = fs.readFileSync(path.join(VOCAB, 'vocab.bin'));
const index = VectorIndex.fromAsset(decodeVocabBinary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));
const cal = manifest.calibration;
const profane = new Set(manifest.profane.map(i => manifest.words[i]));

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0xffffffff; };
}
function randomBoard(seed: number, size = 30): string[] {
  const next = lcg(seed);
  const out = new Set<string>();
  while (out.size < size) { const w = index.baseWordAt(Math.floor(next() * 3000)); if (!profane.has(w)) out.add(w); }
  return [...out];
}

const ORDINAL: Record<string, string[]> = {
  numbers: 'one two three four five six seven eight nine ten'.split(' '),
  temperature: 'freezing cold chilly cool mild warm hot boiling scorching'.split(' '),
  sizes: 'tiny small little medium large big huge giant enormous'.split(' '),
};
const CYCLIC: Record<string, string[]> = {
  months: 'january february march april june july august september october november december'.split(' '),
  days: 'monday tuesday wednesday thursday friday saturday sunday'.split(' '),
};
const BOARDS: Record<string, string[]> = {
  families15: ['dog', 'puppy', 'cat', 'kitten', 'king', 'queen', 'prince', 'ocean', 'sea', 'wave', 'doctor', 'nurse', 'hospital', 'guitar', 'piano'],
  dense24: ['dog', 'puppy', 'cat', 'kitten', 'wolf', 'fox', 'king', 'queen', 'prince', 'princess', 'castle', 'crown', 'ocean', 'sea', 'wave', 'beach', 'doctor', 'nurse', 'hospital', 'medicine', 'guitar', 'piano', 'drum', 'song'],
  random30: randomBoard(11),
  ...ORDINAL,
  ...CYCLIC,
  structureMix: [...ORDINAL.numbers, ...CYCLIC.days, ...ORDINAL.temperature],
};

interface Variant { tuning: OrbitalTuning; config: SpaceConfig }
const VARIANTS: Record<string, Variant> = {
  orbitalBounded: { tuning: defaultOrbitalTuning, config: defaultSpaceConfig },
  orbitalUnbounded: { tuning: defaultOrbitalTuning, config: { ...defaultSpaceConfig, boundsRadius: 5000 } },
  metricStill: { tuning: { ...defaultOrbitalTuning, targetModel: 'metric', metricSwirlShare: 0 }, config: { ...defaultSpaceConfig, boundsRadius: 5000 } },
  metricOrbiting: { tuning: { ...defaultOrbitalTuning, targetModel: 'metric' }, config: { ...defaultSpaceConfig, boundsRadius: 5000 } },
  adaptiveStill: { tuning: { ...defaultOrbitalTuning, targetModel: 'adaptive', metricSwirlShare: 0 }, config: { ...defaultSpaceConfig, boundsRadius: 5000 } },
  adaptiveOrbiting: { tuning: { ...defaultOrbitalTuning, targetModel: 'adaptive' }, config: { ...defaultSpaceConfig, boundsRadius: 5000 } },
  rankStill: { tuning: { ...defaultOrbitalTuning, targetModel: 'rank', metricSwirlShare: 0 }, config: { ...defaultSpaceConfig, boundsRadius: 5000 } },
  rankOrbiting: { tuning: { ...defaultOrbitalTuning, targetModel: 'rank' }, config: { ...defaultSpaceConfig, boundsRadius: 5000 } },
  groupedOrbiting: { tuning: { ...defaultOrbitalTuning, targetModel: 'grouped', shapeFar: 1100, shapeWeightPower: 0 }, config: { ...defaultSpaceConfig, boundsRadius: 5000 } },
};

const vectorsOf = (words: string[]) => words.map(w => index.getVector(w)!);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r2 = (x: number) => Math.round(x * 100) / 100;

function centred(points: number[][]): number[][] {
  const m = [0, 1, 2].map(k => mean(points.map(p => p[k] ?? 0)));
  return points.map(p => [0, 1, 2].map(k => (p[k] ?? 0) - m[k]));
}
/** Principal axes of a point cloud: variance ratios and coordinates along the top-2 axes. */
function layoutPca(points: number[][]): { ratios: number[]; coords: Matrix } {
  const c = centred(points);
  const gram = c.map(a => c.map(b => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const { coords, explained } = gramCoordinates(gram, 3);
  return { ratios: explained.map(e => e / explained[0]), coords };
}
/** Spread of distances from the centroid; ~0 means every word sits on one shell. */
function radialCv(points: number[][]): number {
  const r = centred(points).map(p => Math.hypot(p[0], p[1], p[2]));
  const m = mean(r);
  return Math.sqrt(mean(r.map(x => (x - m) ** 2))) / m;
}
/** Share of each word's k nearest embedding neighbours that are also its k nearest layout neighbours. */
function knnRecall(points: number[][], vecs: Float32Array[], k = 3): number {
  const n = points.length;
  const recall = points.map((p, i) => {
    const byEmbedding = [...Array(n).keys()].filter(j => j !== i).sort((a, b) => dot(vecs[i], vecs[b]) - dot(vecs[i], vecs[a])).slice(0, k);
    const byLayout = new Set([...Array(n).keys()].filter(j => j !== i).sort((a, b) => dist(p, points[a]) - dist(p, points[b])).slice(0, k));
    return byEmbedding.filter(j => byLayout.has(j)).length / k;
  });
  return mean(recall);
}
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], (a[2] ?? 0) - (b[2] ?? 0));
/** Ordered boards: how well the main axis of the layout recovers the order (|Spearman|, 1 = a line in order). */
const ordinalScore = (points: number[][]) => Math.abs(spearman([...points.keys()], layoutPca(points).coords.map(c => c[0])));
/** Cyclic boards: share of consecutive items (wrapping) that are neighbours in angular order around the best-fit plane. */
function cyclicScore(points: number[][]): number {
  const coords = layoutPca(points).coords;
  const order = coords.map((c, i) => ({ i, angle: Math.atan2(c[1], c[0]) })).sort((a, b) => a.angle - b.angle).map(o => o.i);
  const n = order.length;
  const position = new Map(order.map((item, k) => [item, k]));
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const gap = Math.abs(position.get(i)! - position.get((i + 1) % n)!);
    if (gap === 1 || gap === n - 1) hits++;
  }
  return hits / n;
}

function scatter3d(count: number, seed: number): number[][] {
  const next = lcg(seed);
  return Array.from({ length: count }, () => [(next() - 0.5) * 900, (next() - 0.5) * 600, (next() - 0.5) * 600]);
}

function measure(points: number[][], vecs: Float32Array[], board: string) {
  const ratios = layoutPca(points).ratios;
  return {
    fidelity: layoutFidelity(points, vecs).spearman,
    knn3: knnRecall(points, vecs),
    radialCv: radialCv(points),
    anisotropy: ratios[2],
    ...(board in ORDINAL ? { structure: ordinalScore(points) } : board in CYCLIC ? { structure: cyclicScore(points) } : {}),
  };
}

it('embedding shape experiments', () => {
  const results: Record<string, Record<string, Record<string, number>>> = {};
  for (const [board, words] of Object.entries(BOARDS)) {
    const vecs = vectorsOf(words);
    results[board] = {};
    // Linear reference: classical MDS on the metric targets (what a still, perfect projection achieves).
    const targets = vecs.map(a => vecs.map(b => (a === b ? 0 : metricTarget(dot(a, b), defaultOrbitalTuning))));
    const reference = classicalMds(targets, 3);
    results[board].mdsReference = Object.fromEntries(Object.entries(measure(reference, vecs, board)).map(([k, v]) => [k, r2(v)]));
    for (const [variant, { tuning, config }] of Object.entries(VARIANTS)) {
      const runs = [1, 2, 3].map(seed => {
        const sim = new SpaceSimulation(cal, { ...config, tuning });
        const start = scatter3d(words.length, seed * 97);
        words.forEach((w, i) => sim.add(w, vecs[i], index.rankOf(w)!, start[i] as [number, number, number]));
        sim.step(1500);
        return measure(sim.bodies.map(b => [...b.position]), vecs, board);
      });
      results[board][variant] = Object.fromEntries(Object.keys(runs[0]).map(k => [k, r2(mean(runs.map(r => (r as Record<string, number>)[k])))]));
    }
  }
  fs.mkdirSync(path.join(ROOT, 'docs/research/experiments/results'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs/research/experiments/results/embedding-shape.json'), JSON.stringify({ vocabVersion: manifest.version, boards: BOARDS, results }, null, 2));
});

/** Pearson correlation of two equal-length arrays. */
function pearson(a: number[], b: number[]): number {
  const [ma, mb] = [mean(a), mean(b)];
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db);
}
const pairDistances = (points: number[][]) => points.flatMap((p, i) => points.slice(i + 1).map(q => dist(p, q)));

it('stability when a word joins, and the rank model in 2D', () => {
  const additions: Record<string, string> = { families15: 'lion', dense24: 'harp', random30: randomBoard(99, 31).find(w => !BOARDS.random30.includes(w))!, numbers: 'hundred', days: 'weekend' };
  const models: Record<string, OrbitalTuning> = {
    calibrated: defaultOrbitalTuning,
    rank: { ...defaultOrbitalTuning, targetModel: 'rank' },
  };
  const stability: Record<string, Record<string, number>> = {};
  for (const [board, extra] of Object.entries(additions)) {
    stability[board] = {};
    for (const [name, tuning] of Object.entries(models)) {
      const sim = new SpaceSimulation(cal, { ...defaultSpaceConfig, boundsRadius: name === 'rank' ? 5000 : defaultSpaceConfig.boundsRadius, tuning });
      const words = BOARDS[board];
      const start = scatter3d(words.length, 97);
      words.forEach((w, i) => sim.add(w, index.getVector(w)!, index.rankOf(w)!, start[i] as [number, number, number]));
      sim.step(1500);
      const before = pairDistances(sim.bodies.map(b => [...b.position]));
      sim.add(extra, index.getVector(extra)!, index.rankOf(extra) ?? 20000);
      sim.step(600);
      const after = pairDistances(sim.bodies.slice(0, words.length).map(b => [...b.position]));
      stability[board][name] = r2(pearson(before, after));
    }
  }
  const twoD: Record<string, Record<string, number>> = {};
  for (const board of ['families15', 'dense24', 'random30', 'numbers', 'days']) {
    const words = BOARDS[board];
    const vecs = vectorsOf(words);
    twoD[board] = {};
    for (const [name, tuning] of Object.entries(models)) {
      const sim = new SpaceSimulation(cal, { ...defaultSpaceConfig, boundsRadius: 5000, tuning });
      const start = scatter3d(words.length, 97).map(p => [p[0], p[1], 0]);
      words.forEach((w, i) => sim.add(w, vecs[i], index.rankOf(w)!, start[i] as [number, number, number]));
      for (let s = 0; s < 1500; s++) { sim.step(); sim.bodies.forEach(b => { b.position[2] = 0; b.velocity[2] = 0; }); }
      twoD[board][name] = r2(layoutFidelity(sim.bodies.map(b => [b.position[0], b.position[1]]), vecs).spearman);
    }
  }
  const file = path.join(ROOT, 'docs/research/experiments/results/embedding-shape.json');
  const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...existing, additions, stabilityAfterAddingAWord: stability, fidelity2dPinned: twoD }, null, 2));
});

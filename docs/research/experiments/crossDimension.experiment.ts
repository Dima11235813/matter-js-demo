import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decodeVocabBinary, VocabManifest } from '../../../src/embeddings/vocabAsset';
import { VectorIndex } from '../../../src/embeddings/VectorIndex';
import { dot } from '../../../src/embeddings/vectorMath';
import { defaultOrbitalTuning, restLength, unlinkedTarget } from '../../../src/physics/orbitalForces';
import { layoutFidelity } from '../../../src/physics/layoutMetrics';
import { SpaceSimulation } from '../../../src/physics/spaceSimulation';
import { applyMatrix, classicalMds, gramCoordinates, Matrix, orbitRotation, pcaScores, procrustes2d } from './linalg';

/**
 * Cross-dimension continuity experiments (docs/research/cross-dimension-continuity.md).
 * E1 static projections, E2 3D seeding, E3 2D -> 3D lift, E4 3D -> 2D flatten.
 * Deterministic; writes results/cross-dimension.json and prints markdown tables.
 */
const ROOT = process.cwd();
const VOCAB = path.join(ROOT, 'public/vocab');
const manifest = JSON.parse(fs.readFileSync(path.join(VOCAB, 'vocab.json'), 'utf8')) as VocabManifest;
const bin = fs.readFileSync(path.join(VOCAB, 'vocab.bin'));
const index = VectorIndex.fromAsset(decodeVocabBinary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));
const cal = manifest.calibration;
const tuning = defaultOrbitalTuning;
const profane = new Set(manifest.profane.map(i => manifest.words[i]));

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0xffffffff; };
}

const FAMILIES = ['dog', 'puppy', 'cat', 'kitten', 'king', 'queen', 'prince', 'ocean', 'sea', 'wave', 'doctor', 'nurse', 'hospital', 'guitar', 'piano'];
const DENSE = ['dog', 'puppy', 'cat', 'kitten', 'wolf', 'fox', 'king', 'queen', 'prince', 'princess', 'castle', 'crown', 'ocean', 'sea', 'wave', 'beach', 'doctor', 'nurse', 'hospital', 'medicine', 'guitar', 'piano', 'drum', 'song'];
function randomBoard(seed: number, size = 30): string[] {
  const next = lcg(seed);
  const out = new Set<string>();
  while (out.size < size) {
    const w = index.baseWordAt(Math.floor(next() * 3000));
    if (!profane.has(w)) out.add(w);
  }
  return [...out];
}
const BOARDS: Record<string, string[]> = {
  families15: FAMILIES, dense24: DENSE, random30a: randomBoard(11), random30b: randomBoard(22), random30c: randomBoard(33),
};

const vectorsOf = (words: string[]) => words.map(w => index.getVector(w)!);

/** The game's own distance model: link rest lengths above p99, similarity-based targets below. */
function targetDistances(vectors: Float32Array[]): Matrix {
  const span = tuning.fullStrengthSimilarity - cal.p99;
  return vectors.map((a, i) => vectors.map((b, j) => {
    if (i === j) return 0;
    const s = dot(a, b);
    return s > cal.p99 ? restLength(Math.min(1, (s - cal.p99) / span), tuning) : unlinkedTarget(s, cal, tuning);
  }));
}

function rmsPairDistance(points: number[][]): number {
  let sum = 0, count = 0;
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    sum += points[i].reduce((s, v, k) => s + (v - points[j][k]) ** 2, 0); count++;
  }
  return Math.sqrt(sum / count);
}
function rmsTarget(t: Matrix): number {
  let sum = 0, count = 0;
  for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) { sum += t[i][j] ** 2; count++; }
  return Math.sqrt(sum / count);
}
/** Scales coordinates so their RMS pair distance matches the layout's RMS target distance. */
const toLayoutScale = (coords: Matrix, t: Matrix) => { const s = rmsTarget(t) / rmsPairDistance(coords); return coords.map(p => p.map(v => v * s)); };
const fid = (points: number[][], vectors: Float32Array[]) => layoutFidelity(points, vectors).spearman;

function newSim(words: string[], positions: number[][]): SpaceSimulation {
  const sim = new SpaceSimulation(cal);
  words.forEach((w, i) => sim.add(w, index.getVector(w)!, index.rankOf(w)!, positions[i] as [number, number, number]));
  return sim;
}
/** The 2D view approximated with the same forces: z and z-velocity pinned to 0 every step. */
function step(sim: SpaceSimulation, steps: number, opts: { pin2d?: boolean; anchor?: { xy: number[][]; k0: number; decaySteps: number }; startStep?: number } = {}) {
  for (let s = 0; s < steps; s++) {
    sim.step();
    const t = (opts.startStep ?? 0) + s;
    sim.bodies.forEach((b, i) => {
      if (opts.pin2d) { b.position[2] = 0; b.velocity[2] = 0; }
      if (opts.anchor && t < opts.anchor.decaySteps) {
        const k = opts.anchor.k0 * (1 - t / opts.anchor.decaySteps);
        b.velocity[0] += k * (opts.anchor.xy[i][0] - b.position[0]);
        b.velocity[1] += k * (opts.anchor.xy[i][1] - b.position[1]);
      }
    });
  }
}
const positionsOf = (sim: SpaceSimulation) => sim.bodies.map(b => [...b.position]);
const xyOf = (points: number[][]) => points.map(p => [p[0], p[1]]);
const preservation = (points: number[][], reference: number[][]) => 1 - procrustes2d(xyOf(points), reference).disparity;

/** z for fixed xy that best matches the target distances (gradient descent on stress, z only). */
function stressLift(xy: number[][], t: Matrix, z0: number[], iterations = 400): number[] {
  const z = z0.slice();
  const n = z.length;
  const lr = (0.5 * rmsTarget(t) ** 2) / n;
  for (let it = 0; it < iterations; it++) {
    const grad = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dz = z[i] - z[j];
      const d = Math.sqrt((xy[i][0] - xy[j][0]) ** 2 + (xy[i][1] - xy[j][1]) ** 2 + dz * dz) || 1e-6;
      const g = (2 * (d - t[i][j]) * dz) / (d * t[i][j] ** 2);
      grad[i] += g; grad[j] -= g;
    }
    for (let i = 0; i < n; i++) z[i] -= Math.max(-25, Math.min(25, lr * grad[i]));
  }
  return z;
}

function flatScatter(count: number, seed: number): number[][] {
  const next = lcg(seed);
  return Array.from({ length: count }, () => [(next() - 0.5) * 1100, (next() - 0.5) * 560, 0]);
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r2 = (x: number) => Math.round(x * 100) / 100;

it('cross-dimension continuity experiments', () => {
  const results: Record<string, unknown> = { vocabVersion: manifest.version, boards: Object.fromEntries(Object.entries(BOARDS).map(([k, v]) => [k, v.length])) };

  // E1: static projections (no physics)
  const e1: Record<string, Record<string, number>> = {};
  for (const [name, words] of Object.entries(BOARDS)) {
    const vecs = vectorsOf(words);
    const t = targetDistances(vecs);
    const pca = pcaScores(vecs, 3);
    const tm3 = classicalMds(t, 3);
    e1[name] = {
      explainedPC1to2: r2(pca.explained[0] + pca.explained[1]), explainedPC1to3: r2(pca.explained.reduce((a, b) => a + b, 0)),
      pca2: r2(fid(xyOf(pca.coords), vecs)), pca3: r2(fid(pca.coords, vecs)),
      targetMds2: r2(fid(xyOf(tm3), vecs)), targetMds3: r2(fid(tm3, vecs)),
    };
  }
  results.E1_staticProjections = e1;

  // E2: seeding the 3D simulation
  const checkpoints = [30, 120, 600, 1500];
  const e2: Record<string, number[]> = { random: [], pca3: [], targetMds3: [] };
  const e2Raw: Record<string, Record<string, number[]>> = {};
  for (const [name, words] of Object.entries(BOARDS)) {
    const vecs = vectorsOf(words);
    const t = targetDistances(vecs);
    const seeds: Record<string, number[][]> = {
      random: flatScatter(words.length, 7).map((p, i) => [p[0], p[1], ((i * 37) % 41) - 20]),
      pca3: toLayoutScale(pcaScores(vecs, 3).coords, t),
      targetMds3: classicalMds(t, 3),
    };
    e2Raw[name] = {};
    for (const [strategy, seed] of Object.entries(seeds)) {
      const sim = newSim(words, seed);
      const series = [r2(fid(positionsOf(sim), vecs))];
      let done = 0;
      for (const c of checkpoints) { step(sim, c - done); done = c; series.push(r2(fid(positionsOf(sim), vecs))); }
      e2Raw[name][strategy] = series;
    }
  }
  for (const strategy of Object.keys(e2)) e2[strategy] = [0, ...checkpoints].map((_, k) => r2(mean(Object.values(e2Raw).map(b => b[strategy][k]))));
  results.E2_seeding3d = { checkpointsSteps: [0, ...checkpoints], meanFidelity: e2, perBoard: e2Raw };

  // E3: 2D -> 3D lift of a manipulated 2D arrangement
  const liftCheckpoints = [30, 120, 600];
  const e3Raw: Record<string, Record<string, { fid3d: number[]; preserved: number[] }>> = {};
  for (const [name, words] of Object.entries(BOARDS)) {
    const vecs = vectorsOf(words);
    const t = targetDistances(vecs);
    const sim2d = newSim(words, flatScatter(words.length, 5));
    step(sim2d, 1500, { pin2d: true });
    // The player drags one cluster somewhere the forces did not put it.
    const dragged = new Set(name === 'families15' || name === 'dense24' ? ['ocean', 'sea', 'wave'] : words.slice(0, 3));
    const manipulated = positionsOf(sim2d).map((p, i) => (dragged.has(words[i]) ? [p[0] + 260, p[1] + 180] : [p[0], p[1]]));
    const pc3 = toLayoutScale(pcaScores(vecs, 3).coords, t).map(p => p[2]);
    const lifted = stressLift(manipulated, t, pc3);
    const jitter = words.map((w, i) => ((i * 37) % 41) - 20);
    const strategies: Record<string, { z: number[]; anchor: boolean }> = {
      jitter: { z: jitter, anchor: false }, pc3Depth: { z: pc3, anchor: false },
      stressLift: { z: lifted, anchor: false }, stressLiftAnchored: { z: lifted, anchor: true },
    };
    e3Raw[name] = {};
    for (const [strategy, { z, anchor }] of Object.entries(strategies)) {
      const sim = newSim(words, manipulated.map((p, i) => [p[0], p[1], z[i]]));
      const fid3d = [r2(fid(positionsOf(sim), vecs))];
      const preserved = [r2(preservation(positionsOf(sim), manipulated))];
      let done = 0;
      for (const c of liftCheckpoints) {
        step(sim, c - done, { anchor: anchor ? { xy: manipulated, k0: 0.02, decaySteps: 180 } : undefined, startStep: done });
        done = c;
        fid3d.push(r2(fid(positionsOf(sim), vecs)));
        preserved.push(r2(preservation(positionsOf(sim), manipulated)));
      }
      e3Raw[name][strategy] = { fid3d, preserved };
    }
  }
  const e3Mean = Object.fromEntries(Object.keys(e3Raw.families15).map(s => [s, {
    fid3d: [0, ...liftCheckpoints].map((_, k) => r2(mean(Object.values(e3Raw).map(b => b[s].fid3d[k])))),
    preserved: [0, ...liftCheckpoints].map((_, k) => r2(mean(Object.values(e3Raw).map(b => b[s].preserved[k])))),
  }]));
  results.E3_lift2dTo3d = { checkpointsSteps: [0, ...liftCheckpoints], mean: e3Mean, perBoard: e3Raw };

  // E4: 3D -> 2D flatten from a camera view
  const cameras: Record<string, Matrix> = { orbit35x20: orbitRotation(35, 20), edgeOn90: orbitRotation(90, 0) };
  const e4Raw: Record<string, Record<string, { fidAtHandoff: number; resemblanceAtHandoff: number; fidAfter10s: number; resemblanceAfter10s: number }>> = {};
  for (const [name, words] of Object.entries(BOARDS)) {
    const vecs = vectorsOf(words);
    const t = targetDistances(vecs);
    const sim3d = newSim(words, classicalMds(t, 3));
    step(sim3d, 1500);
    const layout3d = positionsOf(sim3d);
    const centred = (() => { const m = [0, 1, 2].map(k => mean(layout3d.map(p => p[k]))); return layout3d.map(p => p.map((v, k) => v - m[k])); })();
    const pcaPlane = gramCoordinates(centred.map(a => centred.map(b => a[0] * b[0] + a[1] * b[1] + a[2] * b[2])), 2).coords;
    const tm2 = classicalMds(t, 2);
    for (const [camera, rotation] of Object.entries(cameras)) {
      const view = layout3d.map(p => applyMatrix(rotation, p).slice(0, 2));
      const strategies: Record<string, number[][]> = {
        cameraProjection: view,
        pcaPlaneAligned: procrustes2d(pcaPlane, view).aligned,
        targetMds2Aligned: procrustes2d(tm2, view).aligned,
      };
      for (const [strategy, start] of Object.entries(strategies)) {
        const key = `${camera}/${strategy}`;
        const sim = newSim(words, start.map(p => [p[0], p[1], 0]));
        const entry = { fidAtHandoff: r2(fid(start, vecs)), resemblanceAtHandoff: r2(1 - procrustes2d(start, view).disparity), fidAfter10s: 0, resemblanceAfter10s: 0 };
        step(sim, 600, { pin2d: true });
        const after = xyOf(positionsOf(sim));
        entry.fidAfter10s = r2(fid(after, vecs));
        entry.resemblanceAfter10s = r2(1 - procrustes2d(after, view).disparity);
        (e4Raw[name] ??= {})[key] = entry;
      }
    }
  }
  const e4Keys = Object.keys(e4Raw.families15);
  results.E4_flatten3dTo2d = {
    mean: Object.fromEntries(e4Keys.map(k => [k, Object.fromEntries((['fidAtHandoff', 'resemblanceAtHandoff', 'fidAfter10s', 'resemblanceAfter10s'] as const).map(m => [m, r2(mean(Object.values(e4Raw).map(b => b[k][m])))]))])),
    perBoard: e4Raw,
  };

  fs.mkdirSync(path.join(ROOT, 'docs/research/experiments/results'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs/research/experiments/results/cross-dimension.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ E1: results.E1_staticProjections, E2: (results.E2_seeding3d as { meanFidelity: unknown }).meanFidelity, E3: e3Mean, E4: (results.E4_flatten3dTo2d as { mean: unknown }).mean }, null, 1));
});

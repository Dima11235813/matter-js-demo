import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decodeVocabBinary, VocabManifest } from '../../../src/embeddings/vocabAsset';
import { VectorIndex } from '../../../src/embeddings/VectorIndex';
import { defaultOrbitalTuning, OrbitalTuning } from '../../../src/physics/orbitalForces';
import { layoutFidelity } from '../../../src/physics/layoutMetrics';
import { principalAxes } from '../../../src/physics/principalAxes';
import { defaultSpaceConfig, SpaceSimulation } from '../../../src/physics/spaceSimulation';

/**
 * Cluster separation (docs/research/embedding-shape.md, section 5): player feedback was that the
 * 3D Shape view is "still a ball of stuff". Which targets separate known groups without losing
 * the map of meaning? Deterministic; writes results/cluster-separation.json.
 */
const ROOT = process.cwd();
const VOCAB = path.join(ROOT, 'public/vocab');
const manifest = JSON.parse(fs.readFileSync(path.join(VOCAB, 'vocab.json'), 'utf8')) as VocabManifest;
const bin = fs.readFileSync(path.join(VOCAB, 'vocab.bin'));
const index = VectorIndex.fromAsset(decodeVocabBinary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));

/** Boards as named groups: the groups are the ground truth for separation. */
const BOARDS: Record<string, Record<string, string[]>> = {
  families15: { pets: ['dog', 'puppy', 'cat', 'kitten'], royalty: ['king', 'queen', 'prince'], sea: ['ocean', 'sea', 'wave'], medical: ['doctor', 'nurse', 'hospital'], music: ['guitar', 'piano'] },
  dense24: { pets: ['dog', 'puppy', 'cat', 'kitten', 'wolf', 'fox'], royalty: ['king', 'queen', 'prince', 'princess', 'castle', 'crown'], sea: ['ocean', 'sea', 'wave', 'beach'], medical: ['doctor', 'nurse', 'hospital', 'medicine'], music: ['guitar', 'piano', 'drum', 'song'] },
  mixed24: { numbers: ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'], days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'], pets: ['dog', 'puppy', 'cat', 'kitten'], royalty: ['king', 'queen', 'prince'] },
  sixGroups24: { colors: ['red', 'blue', 'green', 'yellow'], fruits: ['apple', 'banana', 'grape', 'cherry'], vehicles: ['car', 'truck', 'bus', 'train'], emotions: ['happy', 'sad', 'angry', 'lonely'], body: ['hand', 'foot', 'head', 'knee'], weather: ['rain', 'snow', 'storm', 'wind'] },
};

interface Variant { tuning: OrbitalTuning; bounds: number }
const shape = (overrides: Partial<OrbitalTuning>, bounds = 1400): Variant => ({ tuning: { ...defaultOrbitalTuning, ...overrides }, bounds });
const VARIANTS: Record<string, Variant> = {
  orbits: { tuning: defaultOrbitalTuning, bounds: defaultSpaceConfig.boundsRadius },
  rankW1: shape({ targetModel: 'rank', shapeWeightPower: 1 }),
  rankW0: shape({ targetModel: 'rank', shapeWeightPower: 0 }),
  rankSep: shape({ targetModel: 'rank', shapeSeparation: 380 }),
  rankW1Sep: shape({ targetModel: 'rank', shapeWeightPower: 1, shapeSeparation: 380 }),
  rankW1SepFar: shape({ targetModel: 'rank', shapeWeightPower: 1, shapeSeparation: 480, shapeFar: 1100 }, 2000),
  rankW0SepFar: shape({ targetModel: 'rank', shapeWeightPower: 0, shapeSeparation: 480, shapeFar: 1100 }, 2000),
  grouped: shape({ targetModel: 'grouped', shapeFar: 1100 }, 2000),
  groupedW1: shape({ targetModel: 'grouped', shapeFar: 1100, shapeWeightPower: 1 }, 2000),
  groupedW0: shape({ targetModel: 'grouped', shapeFar: 1100, shapeWeightPower: 0 }, 2000),
  // groupThreshold 0.23 = calibrated p99 (the first grouped version); the shipped default is ~p97 (0.18).
  groupedW0Roomy: shape({ targetModel: 'grouped', shapeWeightPower: 0, shapeNear: 170, groupWithinFar: 480, groupBetweenNear: 780, shapeFar: 1300, groupThreshold: 0.23 }, 2400),
  groupedRoomyP97: shape({ targetModel: 'grouped', shapeWeightPower: 0, shapeNear: 170, groupWithinFar: 480, groupBetweenNear: 780, shapeFar: 1300, groupThreshold: 0.18 }, 2400),
  groupedRoomyP95: shape({ targetModel: 'grouped', shapeWeightPower: 0, shapeNear: 170, groupWithinFar: 480, groupBetweenNear: 780, shapeFar: 1300, groupThreshold: 0.137 }, 2400),
  rank: shape({ targetModel: 'rank' }),
  rankFar: shape({ targetModel: 'rank', shapeFar: 1100 }, 2000),
  rankCurved: shape({ targetModel: 'rank', shapeExponent: 0.5 }),
  rankCurvedFar: shape({ targetModel: 'rank', shapeExponent: 0.5, shapeFar: 1100 }, 2000),
  localRank: shape({ targetModel: 'localRank' }),
  localRankFar: shape({ targetModel: 'localRank', shapeFar: 1100 }, 2000),
  localRankCurvedFar: shape({ targetModel: 'localRank', shapeExponent: 0.5, shapeFar: 1100 }, 2000),
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r2 = (x: number) => Math.round(x * 100) / 100;
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0xffffffff; };
}

/** Mean silhouette of the known groups in 3D (1 = tight, well-separated groups; 0 = overlapping). */
function silhouette(points: number[][], labels: number[]): number {
  return mean(points.map((p, i) => {
    const byGroup = new Map<number, number[]>();
    points.forEach((q, j) => { if (j !== i) (byGroup.get(labels[j]) ?? byGroup.set(labels[j], []).get(labels[j])!).push(dist(p, q)); });
    const own = byGroup.get(labels[i]);
    if (!own || own.length === 0) return 0;
    const a = mean(own);
    const b = Math.min(...[...byGroup.entries()].filter(([g]) => g !== labels[i]).map(([, ds]) => mean(ds)));
    return (b - a) / Math.max(a, b);
  }));
}

/**
 * Visual clutter from the best view: project onto the two largest principal axes (what the camera
 * shows), and count word pairs whose label boxes overlap, relative to the layout's size (the camera
 * zooms to fit, so only relative size matters).
 */
function labelOverlap(points: number[][], words: string[]): number {
  const { axes, centroid } = principalAxes(points);
  const flat = points.map(p => [0, 1].map(k => (p[0] - centroid[0]) * axes[k][0] + (p[1] - centroid[1]) * axes[k][1] + (p[2] - centroid[2]) * axes[k][2]));
  let overlaps = 0, pairs = 0;
  for (let i = 0; i < flat.length; i++) for (let j = i + 1; j < flat.length; j++) {
    pairs++;
    const w = ((words[i].length * 20 + 20) + (words[j].length * 20 + 20)) / 2;
    if (Math.abs(flat[i][0] - flat[j][0]) < w && Math.abs(flat[i][1] - flat[j][1]) < 44) overlaps++;
  }
  return overlaps / pairs;
}

it('cluster separation', () => {
  const results: Record<string, Record<string, Record<string, number>>> = {};
  for (const [board, groups] of Object.entries(BOARDS)) {
    const words = Object.values(groups).flat();
    const labels = Object.values(groups).flatMap((g, k) => g.map(() => k));
    const vecs = words.map(w => index.getVector(w)!);
    results[board] = {};
    for (const [name, { tuning, bounds }] of Object.entries(VARIANTS)) {
      const runs = [1, 2, 3].map(seed => {
        const next = lcg(seed * 131);
        const sim = new SpaceSimulation(manifest.calibration, { ...defaultSpaceConfig, boundsRadius: bounds, tuning });
        words.forEach((w, i) => sim.add(w, vecs[i], index.rankOf(w)!, [(next() - 0.5) * 900, (next() - 0.5) * 600, (next() - 0.5) * 600]));
        sim.step(1500);
        const pos = sim.bodies.map(b => [...b.position]);
        return { silhouette: silhouette(pos, labels), labelOverlap: labelOverlap(pos, words), fidelity: layoutFidelity(pos, vecs).spearman };
      });
      results[board][name] = { silhouette: r2(mean(runs.map(r => r.silhouette))), labelOverlap: r2(mean(runs.map(r => r.labelOverlap))), fidelity: r2(mean(runs.map(r => r.fidelity))) };
    }
  }
  fs.mkdirSync(path.join(ROOT, 'docs/research/experiments/results'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs/research/experiments/results/cluster-separation.json'), JSON.stringify({ vocabVersion: manifest.version, boards: BOARDS, results }, null, 2));
});

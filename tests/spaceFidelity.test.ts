import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decodeVocabBinary, VocabManifest } from '../src/embeddings/vocabAsset';
import { VectorIndex } from '../src/embeddings/VectorIndex';
import { SpaceConfig, SpaceSimulation } from '../src/physics/spaceSimulation';
import { layout3dConfig } from '../src/physics/layoutPresets';

/**
 * Epic 5 Phase 2 exit criteria, measured headless on the real vocabulary. Each run starts flat
 * (a 2D scatter, as the 2D -> 3D toggle will) and must spread into depth and map meaning to
 * distance. Skipped when public/vocab has not been built.
 */
const dir = path.resolve(__dirname, '../public/vocab');
const present = fs.existsSync(path.join(dir, 'vocab.json')) && fs.existsSync(path.join(dir, 'vocab.bin'));

const FAMILIES = ['dog', 'puppy', 'cat', 'kitten', 'king', 'queen', 'prince', 'ocean', 'sea', 'wave', 'doctor', 'nurse', 'hospital', 'guitar', 'piano'];
const DENSE = [...FAMILIES.slice(0, 4), 'wolf', 'fox', ...FAMILIES.slice(4, 7), 'princess', 'castle', 'crown', ...FAMILIES.slice(7, 10), 'beach', ...FAMILIES.slice(10, 13), 'medicine', 'guitar', 'piano', 'drum', 'song'];

/** Deterministic 2D scatter over a 1100 x 560 canvas, centred on the origin. */
function flatScatter(count: number, seed: number): Array<[number, number]> {
  let s = seed;
  const next = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0xffffffff; };
  return Array.from({ length: count }, () => [(next() - 0.5) * 1100, (next() - 0.5) * 560]);
}

describe.skipIf(!present && !process.env.REQUIRE_VOCAB)('3D space simulation on the real vocabulary (Phase 2 exit criteria)', () => {
  const manifest = present ? (JSON.parse(fs.readFileSync(path.join(dir, 'vocab.json'), 'utf8')) as VocabManifest) : undefined;
  const index = present ? (() => {
    const bin = fs.readFileSync(path.join(dir, 'vocab.bin'));
    return VectorIndex.fromAsset(decodeVocabBinary(manifest!, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));
  })() : undefined;

  const run = (words: string[], seed: number, config?: SpaceConfig) => {
    const sim = new SpaceSimulation(manifest!.calibration, config);
    const starts = flatScatter(words.length, seed);
    words.forEach((w, i) => sim.add(w, index!.getVector(w)!, index!.rankOf(w)!, starts[i]));
    sim.step(1500);
    const z = sim.bodies.map(b => b.position[2]);
    const meanZ = z.reduce((a, b) => a + b, 0) / z.length;
    return { fidelity: sim.fidelity().spearman, depthSpread: Math.sqrt(z.reduce((a, v) => a + (v - meanZ) ** 2, 0) / z.length) };
  };
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  it.each([
    ['families (15 words)', FAMILIES, -0.7],
    ['dense (24 words)', DENSE, -0.65],
  ])('%s maps meaning to 3D distance (mean of 3 flat starts)', (_name, words, target) => {
    const runs = [1, 2, 3].map(seed => run(words as string[], seed));
    const fidelity = mean(runs.map(r => r.fidelity));
    console.log(`${_name}: fidelity ${fidelity.toFixed(2)} [${runs.map(r => r.fidelity.toFixed(2)).join(', ')}], depth spread ${runs.map(r => r.depthSpread.toFixed(0)).join(', ')}`);
    expect(fidelity).toBeLessThanOrEqual(target as number);
  });

  // Embedding-shape MVP (docs/research/embedding-shape.md): the default 3D preset.
  it.each([
    ['families (15 words)', FAMILIES, -0.85],
    ['dense (24 words)', DENSE, -0.8],
    ['days of the week', ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'], -0.9],
    ['numbers one to ten', ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'], -0.95],
  ])('shape preset: %s (mean of 3 flat starts)', (_name, words, target) => {
    const runs = [1, 2, 3].map(seed => run(words as string[], seed, layout3dConfig('shape')));
    const fidelity = mean(runs.map(r => r.fidelity));
    console.log(`shape ${_name}: fidelity ${fidelity.toFixed(2)}`);
    expect(fidelity).toBeLessThanOrEqual(target as number);
  });

  it('inflates a flat start into real depth', () => {
    const { depthSpread } = run(DENSE, 7);
    expect(depthSpread).toBeGreaterThan(80); // started within +/-20 of z = 0
  });
});

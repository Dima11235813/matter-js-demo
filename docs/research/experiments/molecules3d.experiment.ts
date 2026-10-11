import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decodeVocabBinary, VocabManifest } from '../../../src/embeddings/vocabAsset';
import { VectorIndex } from '../../../src/embeddings/VectorIndex';
import { SpaceConfig, SpaceSimulation } from '../../../src/physics/spaceSimulation';
import { layout3dConfig } from '../../../src/physics/layoutPresets';

/**
 * Molecules in 3D (Epic 5 · Task 5.15.1, docs/research/molecules-3d.md): 3D bodies are soft spheres that
 * overlap a little all the time, unlike 2D's rigid boxes. How close must two linked words come before
 * they bond, so molecules form about as often as in 2D, stay pure (one meaning group), and don't cost
 * layout fidelity? Deterministic; writes results/molecules-3d.json.
 */
const ROOT = process.cwd();
const VOCAB = path.join(ROOT, 'public/vocab');
const manifest = JSON.parse(fs.readFileSync(path.join(VOCAB, 'vocab.json'), 'utf8')) as VocabManifest;
const bin = fs.readFileSync(path.join(VOCAB, 'vocab.bin'));
const index = VectorIndex.fromAsset(decodeVocabBinary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));

/** Named groups are the ground truth for molecule purity. */
const BOARDS: Record<string, Record<string, string[]>> = {
  families15: { pets: ['dog', 'puppy', 'cat', 'kitten'], royalty: ['king', 'queen', 'prince'], sea: ['ocean', 'sea', 'wave'], medical: ['doctor', 'nurse', 'hospital'], music: ['guitar', 'piano'] },
  dense24: { pets: ['dog', 'puppy', 'cat', 'kitten', 'wolf', 'fox'], royalty: ['king', 'queen', 'prince', 'princess', 'castle', 'crown'], sea: ['ocean', 'sea', 'wave', 'beach'], medical: ['doctor', 'nurse', 'hospital', 'medicine'], music: ['guitar', 'piano', 'drum', 'song'] },
  // Tight sets: every pair is linked, and the shape preset lays them out as a line or ring.
  days7: { days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] },
  numbers10: { numbers: ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'] },
  sixGroups24: { colors: ['red', 'blue', 'green', 'yellow'], fruits: ['apple', 'banana', 'grape', 'cherry'], vehicles: ['car', 'truck', 'bus', 'train'], emotions: ['happy', 'sad', 'angry', 'lonely'], body: ['hand', 'foot', 'head', 'knee'], weather: ['rain', 'snow', 'storm', 'wind'] },
};

/** Random boards like Discovery's: words from the 4000 most frequent, seeded. */
function randomBoard(count: number, seed: number): string[] {
  let s = seed;
  const next = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0xffffffff; };
  const words = new Set<string>();
  while (words.size < count) {
    const word = index.baseWordAt(Math.floor(next() * Math.min(4000, index.baseSize)));
    if (/^[a-z]{2,}$/.test(word)) words.add(word);
  }
  return [...words];
}

function flatScatter(count: number, seed: number): Array<[number, number]> {
  let s = seed;
  const next = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0xffffffff; };
  return Array.from({ length: count }, () => [(next() - 0.5) * 1100, (next() - 0.5) * 560]);
}

const LAYOUTS: Record<string, SpaceConfig> = {
  shapeDesktop: layout3dConfig('shape'),
  shapePhone: layout3dConfig('shape', 0.7, 2.1),
  orbitsDesktop: layout3dConfig('orbits'),
};
const CONTACTS = [0, 1, 0.9, 0.8, 0.7];
const STEPS = 1500;

/**
 * `carried`: molecules built in 2D arrive with the board (the shipped behaviour: no new 3D bonds). Each
 * group's first two words are bonded at the start, as a player who joined a pair in 2D would have.
 */
function run(words: string[], config: SpaceConfig, bondContact: number, seed: number, groupOf?: Map<string, string>, carried?: string[][]) {
  const sim = new SpaceSimulation(manifest.calibration, { ...config, bondContact });
  const starts = flatScatter(words.length, seed);
  words.forEach((w, i) => sim.add(w, index.getVector(w)!, index.rankOf(w)!, starts[i]));
  const idOf = new Map(sim.bodies.map(b => [b.word, b.id]));
  // A 2D molecule arrives with its members touching (bonded on contact): place the pair side by side first.
  const byId = new Map(sim.bodies.map(b => [b.id, b]));
  carried?.forEach(([a, b]) => {
    const [first, second] = [byId.get(idOf.get(a)!)!, byId.get(idOf.get(b)!)!];
    second.position = [first.position[0] + first.radius + second.radius, first.position[1], first.position[2]];
    sim.bond(first.id, second.id);
  });
  sim.step(STEPS);
  const molecules = sim.moleculeWords();
  const bonded = molecules.reduce((sum, m) => sum + m.length, 0);
  const pure = groupOf ? molecules.filter(m => new Set(m.map(w => groupOf.get(w))).size === 1).length : undefined;
  // Rigid: every member sits at its frozen offset (the snap) and members never overlap each other.
  const byWord = new Map(sim.bodies.map(b => [b.word, b]));
  let memberOverlap = 0;
  for (const m of molecules) for (let a = 0; a < m.length; a++) for (let b = a + 1; b < m.length; b++) {
    const [p, q] = [byWord.get(m[a])!, byWord.get(m[b])!];
    const dist = Math.hypot(...p.position.map((v, k) => v - q.position[k]));
    memberOverlap = Math.max(memberOverlap, (p.radius + q.radius - dist) / (p.radius + q.radius));
  }
  return { molecules: molecules.length, bondedShare: bonded / words.length, pure, fidelity: sim.fidelity().spearman, memberOverlap, sizes: molecules.map(m => m.length) };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

it('molecules in 3D: bond distance vs molecule count, purity, and fidelity', () => {
  const boards: Array<{ name: string; words: string[]; groupOf?: Map<string, string> }> = [
    ...Object.entries(BOARDS).map(([name, groups]) => ({
      name,
      words: Object.values(groups).flat(),
      groupOf: new Map(Object.entries(groups).flatMap(([g, ws]) => ws.map(w => [w, g] as [string, string]))),
    })),
    ...[1, 2, 3].map(seed => ({ name: `random40#${seed}`, words: randomBoard(40, seed) })),
  ];
  const rows: Record<string, unknown>[] = [];
  const pairsOf = (name: string) => Object.values(BOARDS[name] ?? {}).map(group => group.slice(0, 2));
  for (const [layout, config] of Object.entries(LAYOUTS)) {
    for (const contact of [...CONTACTS, 'carried' as const]) {
      for (const board of boards) {
        if (contact === 'carried' && !board.groupOf) continue;
        const runs = [1, 2, 3].map(seed => contact === 'carried'
          ? run(board.words, config, 0, seed, board.groupOf, pairsOf(board.name))
          : run(board.words, config, contact, seed, board.groupOf));
        const row = {
          layout, contact, board: board.name, words: board.words.length,
          molecules: mean(runs.map(r => r.molecules)),
          bondedShare: mean(runs.map(r => r.bondedShare)),
          purity: board.groupOf ? mean(runs.map(r => (r.molecules === 0 ? 1 : r.pure! / r.molecules))) : null,
          fidelity: mean(runs.map(r => r.fidelity)),
          memberOverlap: Math.max(...runs.map(r => r.memberOverlap)),
          maxSize: Math.max(0, ...runs.flatMap(r => r.sizes)),
        };
        rows.push(row);
        console.log(`${layout.padEnd(14)} contact ${String(contact).padEnd(4)} ${board.name.padEnd(12)} molecules ${row.molecules.toFixed(1).padStart(4)} bonded ${(row.bondedShare * 100).toFixed(0).padStart(3)}% purity ${row.purity === null ? '  - ' : (row.purity * 100).toFixed(0).padStart(3) + '%'} fidelity ${row.fidelity.toFixed(2)} memberOverlap ${row.memberOverlap.toFixed(2)} maxSize ${row.maxSize}`);
      }
    }
  }
  fs.writeFileSync(path.join(ROOT, 'docs/research/experiments/results/molecules-3d.json'), JSON.stringify({ steps: STEPS, seeds: 3, rows }, null, 2) + '\n');
});

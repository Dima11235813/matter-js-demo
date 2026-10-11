import { describe, it, expect } from 'vitest';
import { Calibration } from '../src/embeddings/calibration';
import { normalizeInPlace } from '../src/embeddings/vectorMath';
import { relaxSphereOffsets } from '../src/physics/molecules';
import { defaultSpaceConfig, SpaceSimulation } from '../src/physics/spaceSimulation';
import { boardTransfer, moleculesToRestore } from '../src/space/handoff';

/** Molecules in 3D (Epic 5 · Task 5.15.1, docs/research/molecules-3d.md). */
const cal: Calibration = { p1: -0.15, p5: -0.11, p10: -0.09, p25: -0.05, p50: -0.01, p75: 0.04, p90: 0.1, p95: 0.14, p99: 0.23 };
const unit = (v: number[]) => normalizeInPlace(Float32Array.from(v));
const distance = (a: number[], b: number[]) => Math.hypot(...a.map((v, k) => v - b[k]));

/** Contact bonding on (the research setting; the app's default forms no new bonds in 3D). */
const bonding = { ...defaultSpaceConfig, bondContact: 0.8 };

/** Two related words (similarity ~0.99), `gap` apart along x. */
function pair(gap: number, config = bonding) {
  const sim = new SpaceSimulation(cal, config);
  const dog = sim.add('dog', unit([1, 0.1, 0, 0]), 10, [0, 0, 0]);
  const puppy = sim.add('puppy', unit([1, 0, 0.1, 0]), 900, [gap, 0, 0]);
  return { sim, dog, puppy };
}

describe('relaxSphereOffsets', () => {
  it('pushes overlapping members apart until they just touch; the anchor stays put', () => {
    const offsets = new Map([[1, [0, 0, 0]], [2, [10, 0, 0]]]);
    relaxSphereOffsets(offsets, 1, () => 30);
    expect(offsets.get(1)).toEqual([0, 0, 0]);
    expect(distance(offsets.get(1)!, offsets.get(2)!)).toBeCloseTo(60);
  });

  it('separates coincident members instead of dividing by zero', () => {
    const offsets = new Map([[1, [0, 0, 0]], [2, [0, 0, 0]], [3, [0, 0, 0]]]);
    relaxSphereOffsets(offsets, 1, () => 10, 20);
    for (const [a, b] of [[1, 2], [1, 3], [2, 3]]) expect(distance(offsets.get(a)!, offsets.get(b)!)).toBeGreaterThan(19);
    expect([...offsets.values()].flat().every(Number.isFinite)).toBe(true);
  });
});

describe('3D molecules', () => {
  it('bonds two related words that touch closely, and they stay apart by their radii', () => {
    const { sim, dog, puppy } = pair(20);
    sim.step(1);
    expect(sim.moleculeWords()).toEqual([['dog', 'puppy']]);
    expect(distance(dog.position, puppy.position)).toBeGreaterThanOrEqual(dog.radius + puppy.radius - 1e-6);
  });

  it('forms no new molecules with the default config (3D bonds would only be layout accidents)', () => {
    const { sim } = pair(20, defaultSpaceConfig);
    sim.step(5);
    expect(sim.molecules.count).toBe(0);
  });

  it('does not bond unrelated words, nor related words that only graze', () => {
    const unrelated = new SpaceSimulation(cal, bonding);
    unrelated.add('dog', unit([1, 0, 0, 0]), 10, [0, 0, 0]);
    unrelated.add('tax', unit([0, 1, 0, 0]), 900, [20, 0, 0]);
    unrelated.step(5);
    expect(unrelated.molecules.count).toBe(0);

    const { sim, dog, puppy } = pair(0);
    // Overlapping, but closer than 0.8 of the summed radii is the bond distance: place them at 0.9.
    puppy.position = [(dog.radius + puppy.radius) * 0.9, 0, 0];
    sim.step(1);
    expect(sim.molecules.count).toBe(0);
  });

  it('moves a molecule as one rigid body', () => {
    const { sim, dog, puppy } = pair(20);
    sim.step(1);
    const offset = puppy.position.map((v, k) => v - dog.position[k]);
    sim.add('tax', unit([0, 0, 0, 1]), 500, [300, 200, 50]);
    sim.step(300);
    const after = puppy.position.map((v, k) => v - dog.position[k]);
    after.forEach((v, k) => expect(v).toBeCloseTo(offset[k], 6));
    expect(sim.bodies.every(b => [...b.position, ...b.velocity].every(Number.isFinite))).toBe(true);
  });

  it('turns molecule offsets with the layout, so the camera turn is not undone', () => {
    const { sim, dog, puppy } = pair(20);
    sim.step(1);
    const before = puppy.position.map((v, k) => v - dog.position[k]);
    sim.rotate([0, 0, 0], [0, 0, 1], Math.PI / 2);
    sim.step(1);
    const after = puppy.position.map((v, k) => v - dog.position[k]);
    // A quarter turn about z: (x, y) -> (-y, x).
    expect(after[0]).toBeCloseTo(-before[1], 3);
    expect(after[1]).toBeCloseTo(before[0], 3);
  });

  it('dissolves when a member leaves, and bonds nothing with bondContact 0', () => {
    const { sim, puppy } = pair(20);
    sim.step(1);
    sim.remove(puppy.id);
    expect(sim.molecules.count).toBe(0);

    const off = pair(20, { ...defaultSpaceConfig, bondContact: 0 });
    off.sim.step(5);
    expect(off.sim.molecules.count).toBe(0);
  });

  it('restores a handed-over molecule by bonding its words where they stand', () => {
    const sim = new SpaceSimulation(cal, { ...defaultSpaceConfig, bondContact: 0 });
    const a = sim.add('king', unit([1, 0, 0, 0]), 10, [0, 0, 0]);
    const b = sim.add('queen', unit([0.9, 0.4, 0, 0]), 20, [200, 0, 0]);
    expect(sim.bond(a.id, b.id)).toBe(true);
    expect(sim.moleculeWords()).toEqual([['king', 'queen']]);
    expect(sim.bond(a.id, 999)).toBe(false);
  });
});

describe('molecules across a 2D <-> 3D switch', () => {
  const handoff = {
    view: 'fountain',
    words: [{ word: 'dog', x: 1, y: 2 }, { word: 'puppy', x: 3, y: 4 }, { word: 'cat', x: 5, y: 6 }],
    pending: [],
    molecules: [['dog', 'puppy'], ['lonely']],
  };

  it('continues the molecules on the same view and drops them when another view carries the words', () => {
    expect(boardTransfer(handoff, 'fountain', true)).toMatchObject({ kind: 'continue', molecules: [['dog', 'puppy']] });
    expect(boardTransfer(handoff, 'game', true)).not.toHaveProperty('molecules');
  });

  it('bonds a molecule once all its words arrived; when the queue is empty, what arrived', () => {
    expect(moleculesToRestore([['dog', 'puppy', 'wolf']], new Set(['dog', 'puppy']), false)).toEqual({ now: [], later: [['dog', 'puppy', 'wolf']] });
    expect(moleculesToRestore([['dog', 'puppy', 'wolf']], new Set(['dog', 'puppy', 'wolf']), false)).toEqual({ now: [['dog', 'puppy', 'wolf']], later: [] });
    expect(moleculesToRestore([['dog', 'puppy', 'wolf']], new Set(['dog', 'puppy']), true)).toEqual({ now: [['dog', 'puppy']], later: [] });
    expect(moleculesToRestore([['dog', 'wolf']], new Set(['dog']), true)).toEqual({ now: [], later: [] });
  });
});

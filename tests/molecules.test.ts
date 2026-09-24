import { describe, it, expect } from 'vitest';
import { MoleculeGraph, relaxOffsets } from '../src/physics/molecules';
import { Calibration } from '../src/embeddings/calibration';
import { normalizeInPlace } from '../src/embeddings/vectorMath';
import { defaultOrbitalTuning, findLinks, orbitalAccelerations, OrbitalBody } from '../src/physics/orbitalForces';

// id -> position and frequency rank (lower = more common = anchor)
const positions: Record<number, number[]> = { 1: [0, 0], 2: [100, 0], 3: [100, 50], 4: [300, 300], 5: [0, 90], 6: [50, 90] };
const ranks: Record<number, number> = { 1: 10, 2: 500, 3: 900, 4: 5, 5: 40, 6: 70 };
const pos = (id: number) => positions[id];
const rank = (id: number) => ranks[id];

describe('MoleculeGraph', () => {
  it('bonds two words into a molecule anchored on the more common one', () => {
    const g = new MoleculeGraph();
    expect(g.bond(2, 1, pos, rank)).toBe(true);
    const m = g.moleculeOf(1)!;
    expect(m.anchor).toBe(1);
    expect(m.offsets.get(2)).toEqual([100, 0]);
    expect(g.sameMolecule(1, 2)).toBe(true);
  });

  it('merges molecules when members of each bond, re-anchoring on the most common word', () => {
    const g = new MoleculeGraph();
    g.bond(1, 2, pos, rank);
    g.bond(3, 4, pos, rank);
    expect(g.count).toBe(2);
    expect(g.bond(2, 3, pos, rank)).toBe(true);
    expect(g.count).toBe(1);
    const m = g.moleculeOf(3)!;
    expect(m.anchor).toBe(4);
    expect(m.offsets.size).toBe(4);
    expect(m.bonds).toHaveLength(3);
  });

  it('refuses duplicate bonds and molecules beyond the size cap', () => {
    const g = new MoleculeGraph(3);
    g.bond(1, 2, pos, rank);
    expect(g.bond(2, 1, pos, rank)).toBe(false);
    g.bond(2, 3, pos, rank);
    expect(g.bond(3, 4, pos, rank)).toBe(false);
    expect(g.moleculeOf(4)).toBeUndefined();
  });

  it('keeps members rigid relative to the anchor, or to a dragged member', () => {
    const g = new MoleculeGraph();
    g.bond(1, 2, pos, rank);
    g.bond(2, 3, pos, rank);
    const moved = (id: number) => (id === 1 ? [10, 20] : pos(id));
    const targets = g.rigidTargets(moved);
    expect(targets.get(2)).toEqual([110, 20]);
    expect(targets.get(3)).toEqual([110, 70]);
    expect(targets.has(1)).toBe(false);

    const dragged = (id: number) => (id === 3 ? [200, 200] : pos(id));
    const pinned = g.rigidTargets(dragged, 3);
    expect(pinned.get(1)).toEqual([100, 150]);
    expect(pinned.has(3)).toBe(false);
  });

  it('gives every member the molecule\'s mass-weighted mean acceleration', () => {
    const g = new MoleculeGraph();
    g.bond(1, 2, pos, rank);
    const shared = g.shareAccelerations([1, 2, 5], [[1, 0], [0, 3], [9, 9]], [1, 2, 1]);
    expect(shared[0]).toEqual([1 / 3, 2]);
    expect(shared[1]).toEqual([1 / 3, 2]);
    expect(shared[2]).toEqual([9, 9]);
  });

  it('dissolves a molecule that drops below two members, and re-anchors when the anchor leaves', () => {
    const g = new MoleculeGraph();
    g.bond(1, 2, pos, rank);
    g.remove(2);
    expect(g.count).toBe(0);

    g.bond(1, 2, pos, rank);
    g.bond(2, 3, pos, rank);
    g.remove(1);
    const m = g.moleculeOf(2)!;
    expect(m.anchor).toBe(2);
    expect(m.offsets.get(2)).toEqual([0, 0]);
    expect(m.offsets.get(3)).toEqual([0, 50]);
    expect(m.bonds).toEqual([[2, 3]]);
  });

  it('prunes members that left the world', () => {
    const g = new MoleculeGraph();
    g.bond(1, 2, pos, rank);
    g.bond(5, 6, pos, rank);
    g.prune(new Set([1, 2]));
    expect(g.count).toBe(1);
    expect(g.moleculeOf(5)).toBeUndefined();
  });

  it('shifts a molecule back inside the world instead of pushing members through a wall', () => {
    const shift = MoleculeGraph.containmentShift([
      { position: [100, 10], halfSize: [40, 20] },  // top edge at -10: 10px above the ceiling
      { position: [180, 40], halfSize: [40, 20] },
    ], [1200, 800]);
    expect(shift).toEqual([0, 10]);
    expect(MoleculeGraph.containmentShift([{ position: [1190, 400], halfSize: [30, 20] }], [1200, 800])).toEqual([-20, 0]);
    expect(MoleculeGraph.containmentShift([{ position: [600, 400], halfSize: [30, 20] }], [1200, 800])).toEqual([0, 0]);
  });

  it('relaxes overlapping members apart at bond time, keeping the anchor fixed', () => {
    const g = new MoleculeGraph();
    const overlapping: Record<number, number[]> = { 1: [0, 0], 2: [20, 0] }; // boxes 100x40 overlap heavily
    g.bond(1, 2, id => overlapping[id], rank, () => [50, 20]);
    const m = g.moleculeOf(1)!;
    expect(m.offsets.get(1)).toEqual([0, 0]);
    const [dx, dy] = m.offsets.get(2)!;
    expect(Math.abs(dx) >= 104 || Math.abs(dy) >= 44).toBe(true);
  });

  it('resolves chains of overlaps', () => {
    const offsets = new Map<number, number[]>([[1, [0, 0]], [2, [10, 0]], [3, [20, 5]]]);
    relaxOffsets(offsets, 1, () => [30, 15]);
    const ids = [1, 2, 3];
    for (const a of ids) for (const b of ids) {
      if (a >= b) continue;
      const [pa, pb] = [offsets.get(a)!, offsets.get(b)!];
      const separated = Math.abs(pa[0] - pb[0]) >= 60 || Math.abs(pa[1] - pb[1]) >= 30;
      expect(separated).toBe(true);
    }
  });

  it('reports group ids for the force model', () => {
    const g = new MoleculeGraph();
    g.bond(1, 2, pos, rank);
    const [a, b, c] = g.groups([1, 2, 5]);
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
    expect(c).toBe(-1);
  });
});

describe('orbital forces with molecules', () => {
  const cal: Calibration = { p1: -0.15, p5: -0.11, p10: -0.09, p25: -0.05, p50: -0.01, p75: 0.04, p90: 0.1, p95: 0.14, p99: 0.23 };
  const unit = (v: number[]) => normalizeInPlace(Float32Array.from(v));
  const free = { ...defaultOrbitalTuning, centerPull: 0 };

  it('applies no forces between members of the same molecule', () => {
    const bodies: OrbitalBody[] = [
      { position: [0, 0], vector: unit([1, 0.2]), rank: 1 },
      { position: [400, 0], vector: unit([1, 0.25]), rank: 2 },
    ];
    const links = findLinks(bodies, cal, free);
    const loose = orbitalAccelerations(bodies, links, [0, 0], cal, free);
    const bonded = orbitalAccelerations(bodies, links, [0, 0], cal, free, undefined, [7, 7]);
    expect(Math.hypot(...loose[1])).toBeGreaterThan(0);
    expect(Math.hypot(...bonded[0])).toBe(0);
    expect(Math.hypot(...bonded[1])).toBe(0);
  });
});

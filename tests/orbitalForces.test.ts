import { describe, it, expect } from 'vitest';
import { Calibration } from '../src/embeddings/calibration';
import { normalizeInPlace } from '../src/embeddings/vectorMath';
import {
  defaultOrbitalTuning, findLinks, orbitalAccelerations, orbitTangent, OrbitalBody, restLength,
  scaleTuning, similarityMatrix, unlinkedTarget, insideKeepOut, keepOutAcceleration,
} from '../src/physics/orbitalForces';

const cal: Calibration = { p1: -0.15, p5: -0.11, p10: -0.09, p25: -0.05, p50: -0.01, p75: 0.04, p90: 0.1, p95: 0.14, p99: 0.23 };
const unit = (v: number[]) => normalizeInPlace(Float32Array.from(v));
const body = (position: number[], v: number[], rank: number, orbitAxis?: number[]): OrbitalBody => ({ position, vector: unit(v), rank, orbitAxis });
const origin2 = [0, 0];
const free = { ...defaultOrbitalTuning, centerPull: 0 };
const accel = (bodies: OrbitalBody[], tuning = free, center = origin2) =>
  orbitalAccelerations(bodies, findLinks(bodies, cal, tuning), center, cal, tuning);

describe('findLinks', () => {
  it('links only pairs above the 99th percentile and marks the common word as core', () => {
    const bodies = [body([0, 0], [1, 0.2, 0], 50), body([300, 0], [1, 0.3, 0], 900), body([0, 300], [0, 0, 1], 10)];
    const links = findLinks(bodies, cal);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ i: 0, j: 1, core: 0 });
    expect(links[0].strength).toBe(1);
  });

  it('ignores incidental similarity between the 95th and 99th percentile', () => {
    // cosine ~0.19: above p95 (0.14) but below p99 (0.23), like queen~nurse
    expect(findLinks([body([0, 0], [1, 0, 0], 1), body([10, 0], [0.19, 0.98, 0], 2)], cal)).toHaveLength(0);
  });

  it('player words (rank Infinity) orbit base words', () => {
    const [link] = findLinks([body([0, 0], [1, 0.1], Infinity), body([10, 0], [1, 0.2], 5000)], cal);
    expect(link.core).toBe(1);
  });

  it('accepts a precomputed similarity matrix', () => {
    const bodies = [body([0, 0], [1, 0], 1), body([10, 0], [0, 1], 2)];
    const forced = Float32Array.from([1, 0.9, 0.9, 1]);
    expect(findLinks(bodies, cal, defaultOrbitalTuning, forced)).toHaveLength(1);
  });
});

describe('similarityMatrix', () => {
  it('is symmetric with a unit diagonal', () => {
    const m = similarityMatrix([unit([1, 0]), unit([1, 1]), unit([0, 1])]);
    expect(m[0]).toBe(1);
    expect(m[1]).toBeCloseTo(m[3]);
    expect(m[2]).toBeCloseTo(0);
  });
});

describe('target distances', () => {
  it('puts close synonyms nearer than loose associations', () => {
    expect(restLength(1)).toBe(defaultOrbitalTuning.restNear);
    expect(restLength(0)).toBe(defaultOrbitalTuning.restFar);
  });

  it('places unlinked pairs further apart the less related they are', () => {
    expect(unlinkedTarget(-0.3, cal)).toBe(defaultOrbitalTuning.farTarget);
    expect(unlinkedTarget(cal.p99, cal)).toBe(defaultOrbitalTuning.separation);
    expect(unlinkedTarget(0.05, cal)).toBeGreaterThan(unlinkedTarget(0.15, cal));
  });

  it('scales lengths but not stiffness', () => {
    const small = scaleTuning(defaultOrbitalTuning, 0.5);
    expect(small.separation).toBe(defaultOrbitalTuning.separation / 2);
    expect(small.farTarget).toBe(defaultOrbitalTuning.farTarget / 2);
    expect(small.spring).toBe(defaultOrbitalTuning.spring);
  });
});

describe('orbitalAccelerations', () => {
  const pair = (distance: number) => [body([0, 0], [1, 0.2], 10), body([distance, 0], [1, 0.25], 800)];

  it('pulls a stretched satellite toward its core, which barely moves', () => {
    const [core, satellite] = accel(pair(400));
    expect(satellite[0]).toBeLessThan(0);
    expect(core[0]).toBeGreaterThan(0);
    expect(Math.abs(core[0])).toBeLessThan(Math.abs(satellite[0]));
  });

  it('pushes a satellite out when it sits inside its rest length', () => {
    expect(accel(pair(40))[1][0]).toBeGreaterThan(0);
  });

  it('adds a tangential push so satellites orbit rather than settle', () => {
    const [, satellite] = accel(pair(defaultOrbitalTuning.restNear));
    expect(Math.abs(satellite[1])).toBeGreaterThan(0);
    expect(Math.abs(satellite[0])).toBeLessThan(1e-9);
  });

  it('pushes unrelated words apart when they crowd each other', () => {
    const [a, b] = accel([body([0, 0], [1, 0], 1), body([50, 0], [0, 1], 2)]);
    expect(a[0]).toBeLessThan(0);
    expect(b[0]).toBeGreaterThan(0);
  });

  it('pulls unrelated words back in when they drift beyond their target', () => {
    const far = defaultOrbitalTuning.farTarget + 400;
    const [a, b] = accel([body([0, 0], [1, 0], 1), body([far, 0], [-1, 0.1], 2)]);
    expect(a[0]).toBeGreaterThan(0);
    expect(b[0]).toBeLessThan(0);
  });

  it('clamps every acceleration to maxAccel', () => {
    accel(pair(5000)).forEach(a => expect(Math.hypot(...a)).toBeLessThanOrEqual(defaultOrbitalTuning.maxAccel + 1e-9));
  });

  it('pushes words out of the keep-out rectangle through the nearest edge', () => {
    const rect = { left: 100, top: 0, right: 700, bottom: 200 };
    const run = (p: number[]) => orbitalAccelerations([body(p, [1, 0], 1)], [], origin2, cal, free, undefined, undefined, rect)[0];
    expect(run([400, 180])[1]).toBeGreaterThan(0); // near the bottom edge: pushed down
    expect(run([120, 100])[0]).toBeLessThan(0);    // near the left edge: pushed left
    expect(Math.hypot(...run([400, 400]))).toBe(0); // outside: untouched
    expect(insideKeepOut([400, 180], rect)).toBe(true);
    expect(insideKeepOut([400, 260], rect)).toBe(false);
  });

  it('skips exits that would trap a word against a wall', () => {
    // Dashboard dragged to the bottom-right: the strip below it is too thin to hold a word.
    const rect = { left: 600, top: 520, right: 1220, bottom: 720 };
    const nearBottom = [900, 700];
    expect(keepOutAcceleration(nearBottom, rect)[1]).toBeGreaterThan(0);                // no bounds: nearest edge (down)
    const bounded = keepOutAcceleration(nearBottom, rect, defaultOrbitalTuning, [1220, 800]);
    expect(bounded[1]).toBeLessThan(0);                                                 // with bounds: up into open space
  });

  it('drifts lone words toward the centre', () => {
    const [a] = accel([body([500, 300], [1, 0], 1)], defaultOrbitalTuning, [100, 100]);
    expect(a[0]).toBeLessThan(0);
    expect(a[1]).toBeLessThan(0);
  });

  it('works unchanged with 3D positions', () => {
    const bodies = [body([0, 0, 0], [1, 0.2], 10), body([0, 0, 400], [1, 0.25], 800, [1, 0, 0])];
    const [core, satellite] = accel(bodies, free, [0, 0, 0]);
    expect(core).toHaveLength(3);
    expect(satellite[2]).toBeLessThan(0); // pulled back along z toward the core
  });
});

describe('orbitTangent', () => {
  it('is the perpendicular in 2D', () => {
    const [x, y] = orbitTangent([1, 0]);
    expect(x).toBeCloseTo(0);
    expect(y).toBe(1);
  });

  it('is orthogonal to both the radial and the orbit axis in 3D', () => {
    const t = orbitTangent([0, 1, 0], [1, 0, 0]);
    expect(Math.hypot(...t)).toBeCloseTo(1);
    expect(t[1]).toBeCloseTo(0);
    expect(t[0]).toBeCloseTo(0);
  });

  it('falls back to another axis when the orbit axis is parallel to the radial', () => {
    const t = orbitTangent([0, 0, 1], [0, 0, 1]);
    expect(Math.hypot(...t)).toBeCloseTo(1);
    expect(t[2]).toBeCloseTo(0);
  });
});

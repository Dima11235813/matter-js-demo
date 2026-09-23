import { describe, it, expect } from 'vitest';
import { Calibration } from '../src/embeddings/calibration';
import { normalizeInPlace } from '../src/embeddings/vectorMath';
import { defaultOrbitalTuning, findLinks, orbitalAccelerations, OrbitalBody, restLength } from '../src/physics/orbitalForces';

const cal: Calibration = { p1: -0.15, p5: -0.11, p10: -0.09, p25: -0.05, p50: -0.01, p75: 0.04, p90: 0.1, p95: 0.14, p99: 0.23 };
const unit = (v: number[]) => normalizeInPlace(Float32Array.from(v));
const body = (x: number, y: number, v: number[], rank: number): OrbitalBody => ({ x, y, vector: unit(v), rank });
const center = { x: 0, y: 0 };
const noCenter = { ...defaultOrbitalTuning, centerPull: 0 };

describe('findLinks', () => {
  it('links only pairs above the 99th percentile and marks the common word as core', () => {
    const bodies = [body(0, 0, [1, 0.2, 0], 50), body(300, 0, [1, 0.3, 0], 900), body(0, 300, [0, 0, 1], 10)];
    const links = findLinks(bodies, cal);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ i: 0, j: 1, core: 0 });
    expect(links[0].strength).toBe(1);
  });

  it('player words (rank Infinity) orbit base words', () => {
    const [link] = findLinks([body(0, 0, [1, 0.1], Infinity), body(10, 0, [1, 0.2], 5000)], cal);
    expect(link.core).toBe(1);
  });
});

describe('restLength', () => {
  it('puts close synonyms nearer than loose associations', () => {
    expect(restLength(1)).toBe(defaultOrbitalTuning.restNear);
    expect(restLength(0)).toBe(defaultOrbitalTuning.restFar);
    expect(restLength(0.5)).toBeGreaterThan(restLength(1));
  });
});

describe('orbitalAccelerations', () => {
  const pair = (distance: number) => [body(0, 0, [1, 0.2], 10), body(distance, 0, [1, 0.25], 800)];

  it('ignores incidental similarity between the 95th and 99th percentile', () => {
    // cosine ~0.19: above p95 (0.14) but below p99 (0.23), like queen~nurse
    const links = findLinks([body(0, 0, [1, 0, 0], 1), body(10, 0, [0.19, 0.98, 0], 2)], cal);
    expect(links).toHaveLength(0);
  });

  it('pulls a stretched satellite toward its core, which barely moves', () => {
    const bodies = pair(400);
    const [core, satellite] = orbitalAccelerations(bodies, findLinks(bodies, cal), center, noCenter);
    expect(satellite.ax).toBeLessThan(0);
    expect(core.ax).toBeGreaterThan(0);
    expect(Math.abs(core.ax)).toBeLessThan(Math.abs(satellite.ax));
  });

  it('pushes a satellite out when it sits inside its rest length', () => {
    const bodies = pair(40);
    const [, satellite] = orbitalAccelerations(bodies, findLinks(bodies, cal), center, noCenter);
    expect(satellite.ax).toBeGreaterThan(0);
  });

  it('adds a tangential push so satellites orbit rather than settle', () => {
    const bodies = pair(defaultOrbitalTuning.restNear);
    const [, satellite] = orbitalAccelerations(bodies, findLinks(bodies, cal), center, noCenter);
    expect(Math.abs(satellite.ay)).toBeGreaterThan(0);
    expect(Math.abs(satellite.ax)).toBeLessThan(1e-9);
  });

  it('repels unrelated words that crowd each other', () => {
    const bodies = [body(0, 0, [1, 0], 1), body(50, 0, [0, 1], 2)];
    const [a, b] = orbitalAccelerations(bodies, findLinks(bodies, cal), center, noCenter);
    expect(a.ax).toBeLessThan(0);
    expect(b.ax).toBeGreaterThan(0);
  });

  it('clamps every acceleration to maxAccel', () => {
    const bodies = pair(5000);
    const acc = orbitalAccelerations(bodies, findLinks(bodies, cal), center, noCenter);
    acc.forEach(a => expect(Math.hypot(a.ax, a.ay)).toBeLessThanOrEqual(defaultOrbitalTuning.maxAccel + 1e-9));
  });

  it('pushes words down out of the top keep-out band', () => {
    const tuning = { ...noCenter, topMargin: 200 };
    const [high] = orbitalAccelerations([body(100, 50, [1, 0], 1)], [], center, tuning);
    const [low] = orbitalAccelerations([body(100, 400, [1, 0], 1)], [], center, tuning);
    expect(high.ay).toBeGreaterThan(0);
    expect(low.ay).toBe(0);
  });

  it('drifts lone words toward the centre', () => {
    const [a] = orbitalAccelerations([body(500, 300, [1, 0], 1)], [], { x: 100, y: 100 });
    expect(a.ax).toBeLessThan(0);
    expect(a.ay).toBeLessThan(0);
  });
});

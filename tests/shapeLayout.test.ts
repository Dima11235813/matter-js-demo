import { describe, it, expect } from 'vitest';
import { Calibration } from '../src/embeddings/calibration';
import { normalizeInPlace } from '../src/embeddings/vectorMath';
import { defaultOrbitalTuning, findLinks, metricTarget, neighborSkeleton, orbitalAccelerations, OrbitalBody, shapeTargets, similarityGroups, similarityMatrix } from '../src/physics/orbitalForces';
import { layout3dConfig } from '../src/physics/layoutPresets';
import { SpaceSimulation } from '../src/physics/spaceSimulation';

const cal: Calibration = { p1: -0.15, p5: -0.11, p10: -0.09, p25: -0.05, p50: -0.01, p75: 0.04, p90: 0.1, p95: 0.14, p99: 0.23 };
const unit = (v: number[]) => normalizeInPlace(Float32Array.from(v));
// Similarities: a~b high, a~c medium, b~c low.
const vecs = [unit([1, 0.1, 0]), unit([1, 0.3, 0.1]), unit([0.3, 1, 0.2])];
const sims = similarityMatrix(vecs);
const n = vecs.length;
const at = (t: Float32Array, i: number, j: number) => t[i * n + j];

describe('shape target models', () => {
  it('metric: real chord distance, larger for less similar pairs', () => {
    expect(metricTarget(1)).toBe(0);
    expect(metricTarget(0)).toBeCloseTo(defaultOrbitalTuning.metricScale * Math.SQRT2);
    const t = shapeTargets(sims, n, { ...defaultOrbitalTuning, targetModel: 'metric' });
    expect(at(t, 0, 1)).toBeLessThan(at(t, 0, 2));
  });

  it('adaptive: stretches the board onto [near, far]', () => {
    const tuning = { ...defaultOrbitalTuning, targetModel: 'adaptive' as const };
    const t = shapeTargets(sims, n, tuning);
    const values = [at(t, 0, 1), at(t, 0, 2), at(t, 1, 2)];
    expect(Math.min(...values)).toBeCloseTo(tuning.shapeNear);
    expect(Math.max(...values)).toBeCloseTo(tuning.shapeFar);
    expect(at(t, 0, 1)).toBe(at(t, 1, 0));
  });

  it('rank: spaces pairs evenly by dissimilarity rank', () => {
    const tuning = { ...defaultOrbitalTuning, targetModel: 'rank' as const };
    const t = shapeTargets(sims, n, tuning);
    const sorted = [at(t, 0, 1), at(t, 0, 2), at(t, 1, 2)].sort((a, b) => a - b);
    expect(sorted).toEqual([tuning.shapeNear, (tuning.shapeNear + tuning.shapeFar) / 2, tuning.shapeFar]);
    expect(at(t, 0, 1)).toBe(tuning.shapeNear); // the most similar pair is nearest
  });

  it('caches per similarity matrix and model', () => {
    const tuning = { ...defaultOrbitalTuning, targetModel: 'rank' as const };
    expect(shapeTargets(sims, n, tuning)).toBe(shapeTargets(sims, n, tuning));
    expect(shapeTargets(sims, n, { ...tuning, targetModel: 'adaptive' })).not.toBe(shapeTargets(sims, n, tuning));
  });

  it('pulls a too-far pair together and pushes a too-close pair apart', () => {
    const tuning = { ...defaultOrbitalTuning, targetModel: 'rank' as const, centerPull: 0, metricSwirlShare: 0 };
    const pairVecs = [unit([1, 0.1]), unit([1, 0.3])];
    const run = (distance: number) => {
      const bodies: OrbitalBody[] = pairVecs.map((vector, i) => ({ position: [i * distance, 0, 0], vector, rank: i }));
      return orbitalAccelerations(bodies, findLinks(bodies, cal, tuning), [0, 0, 0], cal, tuning);
    };
    expect(run(2000)[0][0]).toBeGreaterThan(0);
    expect(run(20)[0][0]).toBeLessThan(0);
  });
});

describe('3D layout presets', () => {
  it('shape uses grouped targets and a roomier container; orbits keeps Phase 2', () => {
    expect(layout3dConfig('shape').tuning.targetModel).toBe('grouped');
    expect(layout3dConfig('shape').boundsRadius).toBeGreaterThan(layout3dConfig('orbits').boundsRadius);
    expect(layout3dConfig('orbits').tuning.targetModel).toBe('calibrated');
  });

  it('switches model in place without moving bodies', () => {
    const sim = new SpaceSimulation(cal, layout3dConfig('orbits'));
    const body = sim.add('a', vecs[0], 1, [10, 20, 30]);
    sim.setConfig(layout3dConfig('shape'));
    expect(sim.config.tuning.targetModel).toBe('grouped');
    expect(body.position).toEqual([10, 20, 30]);
  });
});

describe('neighbour skeleton', () => {
  it('turns an ordered sequence into a chain', () => {
    // Points along an arc: each is most similar to its immediate neighbours.
    const seq = [0, 1, 2, 3, 4].map(k => unit([Math.cos(k * 0.3), Math.sin(k * 0.3)]));
    const edges = neighborSkeleton(similarityMatrix(seq), 5, 1).map(e => `${e.i}-${e.j}`).sort();
    expect(edges).toEqual(['0-1', '1-2', '2-3', '3-4']);
  });

  it('deduplicates mutual neighbours and scales strength to the edges shown', () => {
    const edges = neighborSkeleton(sims, n, 2);
    expect(new Set(edges.map(e => `${e.i}-${e.j}`)).size).toBe(edges.length);
    expect(Math.max(...edges.map(e => e.strength))).toBe(1);
    expect(Math.min(...edges.map(e => e.strength))).toBe(0);
  });
});

describe('grouped model', () => {
  // Two tight groups: {0,1,2} around x, {3,4} around y.
  const groupVecs = [unit([1, 0.05, 0]), unit([1, 0.1, 0.05]), unit([1, 0, 0.1]), unit([0, 1, 0.05]), unit([0.05, 1, 0])];
  const groupSims = similarityMatrix(groupVecs);

  it('clusters words by average-linkage similarity', () => {
    const label = similarityGroups(groupSims, 5, 0.5);
    expect(label[0]).toBe(label[1]);
    expect(label[1]).toBe(label[2]);
    expect(label[3]).toBe(label[4]);
    expect(label[0]).not.toBe(label[3]);
  });

  it('keeps every word apart when nothing clears the threshold', () => {
    expect(new Set(similarityGroups(groupSims, 5, 0.9999)).size).toBe(5);
  });

  it('puts every between-group target beyond every within-group target', () => {
    const tuning = { ...defaultOrbitalTuning, targetModel: 'grouped' as const, shapeFar: 1100, groupThreshold: 0.5 };
    const t = shapeTargets(groupSims, 5, tuning);
    const within = [t[0 * 5 + 1], t[0 * 5 + 2], t[1 * 5 + 2], t[3 * 5 + 4]];
    const between = [0, 1, 2].flatMap(i => [3, 4].map(j => t[i * 5 + j]));
    expect(Math.max(...within)).toBeLessThanOrEqual(tuning.groupWithinFar);
    expect(Math.min(...between)).toBeGreaterThanOrEqual(tuning.groupBetweenNear);
  });
});

describe('grouped skeleton', () => {
  it('draws threads only inside groups', () => {
    const vecsTwoGroups = [unit([1, 0.05, 0]), unit([1, 0.1, 0.05]), unit([1, 0, 0.1]), unit([0, 1, 0.05]), unit([0.05, 1, 0])];
    const sim = new SpaceSimulation(cal, { ...layout3dConfig('shape'), tuning: { ...layout3dConfig('shape').tuning, groupThreshold: 0.5 } });
    vecsTwoGroups.forEach((v, i) => sim.add(`w${i}`, v, i, [i * 50, 0, 0]));
    const edges = sim.skeleton(3);
    expect(edges.length).toBeGreaterThan(0);
    const inFirst = (i: number) => i < 3;
    edges.forEach(e => expect(inFirst(e.i)).toBe(inFirst(e.j)));
    const orbits = new SpaceSimulation(cal, layout3dConfig('orbits'));
    vecsTwoGroups.forEach((v, i) => orbits.add(`w${i}`, v, i, [i * 50, 0, 0]));
    expect(orbits.skeleton(3).some(e => inFirst(e.i) !== inFirst(e.j))).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { Calibration } from '../src/embeddings/calibration';
import { normalizeInPlace } from '../src/embeddings/vectorMath';
import { defaultSpaceConfig, hashWord, labelRadius, orbitAxisFor, SpaceSimulation } from '../src/physics/spaceSimulation';

const cal: Calibration = { p1: -0.15, p5: -0.11, p10: -0.09, p25: -0.05, p50: -0.01, p75: 0.04, p90: 0.1, p95: 0.14, p99: 0.23 };
const unit = (v: number[]) => normalizeInPlace(Float32Array.from(v));
const finite = (sim: SpaceSimulation) => sim.bodies.every(b => [...b.position, ...b.velocity].every(Number.isFinite));

describe('per-word geometry', () => {
  it('hashes deterministically and differently per word', () => {
    expect(hashWord('king')).toBe(hashWord('king'));
    expect(hashWord('king')).not.toBe(hashWord('queen'));
  });

  it('gives every word a stable unit orbit axis', () => {
    const a = orbitAxisFor('puppy');
    expect(Math.hypot(...a)).toBeCloseTo(1);
    expect(orbitAxisFor('puppy')).toEqual(a);
    expect(orbitAxisFor('kitten')).not.toEqual(a);
  });

  it('sizes collision radius by label length', () => {
    expect(labelRadius(8)).toBeGreaterThan(labelRadius(3));
  });
});

describe('SpaceSimulation', () => {
  it('starts 2D-seeded bodies flat with a small deterministic depth jitter', () => {
    const sim = new SpaceSimulation(cal);
    const body = sim.add('ocean', unit([1, 0]), 10, [120, -40]);
    expect(body.position.slice(0, 2)).toEqual([120, -40]);
    expect(Math.abs(body.position[2])).toBeLessThanOrEqual(20);
    expect(new SpaceSimulation(cal).add('ocean', unit([1, 0]), 10, [120, -40]).position).toEqual(body.position);
  });

  it('lets kinetic energy decay to rest when nothing orbits', () => {
    const sim = new SpaceSimulation(cal);
    sim.add('alpha', unit([1, 0, 0]), 1, [0, 0, 0]);
    sim.add('beta', unit([0, 1, 0]), 2, [100, 0, 0]);
    sim.add('gamma', unit([0, 0, 1]), 3, [0, 120, 30]);
    sim.step(60);
    const early = sim.kineticEnergy();
    sim.step(2000);
    expect(sim.kineticEnergy()).toBeLessThan(early);
    expect(sim.kineticEnergy()).toBeLessThan(1e-3);
    expect(finite(sim)).toBe(true);
  });

  it('keeps orbiting systems bounded and finite', () => {
    const sim = new SpaceSimulation(cal);
    sim.add('core', unit([1, 0.1, 0]), 1, [0, 0, 0]);
    sim.add('satellite', unit([1, 0.2, 0.05]), 900, [300, 0, 0]);
    sim.add('moon', unit([1, 0.15, 0.1]), 950, [-250, 80, 0]);
    let peak = 0;
    for (let i = 0; i < 40; i++) {
      sim.step(100);
      peak = Math.max(peak, sim.kineticEnergy());
    }
    expect(finite(sim)).toBe(true);
    expect(peak).toBeLessThan(3 * defaultSpaceConfig.maxSpeed ** 2);
    sim.bodies.forEach(b => expect(Math.hypot(...b.position)).toBeLessThan(defaultSpaceConfig.boundsRadius + 60));
    // Satellites still move: the swirl keeps them orbiting rather than settling.
    expect(Math.hypot(...sim.bodies[1].velocity)).toBeGreaterThan(0.01);
  });

  it('pushes overlapping bodies apart, even when they start at the same point', () => {
    const sim = new SpaceSimulation(cal);
    const a = sim.add('same', unit([1, 0]), 1, [0, 0, 0]);
    const b = sim.add('spot', unit([0, 1]), 2, [0, 0, 0]);
    sim.step(300);
    const gap = Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1], a.position[2] - b.position[2]);
    expect(gap).toBeGreaterThan((a.radius + b.radius) * 0.9);
  });

  it('pulls strays back inside the spherical bounds', () => {
    const sim = new SpaceSimulation(cal);
    const stray = sim.add('stray', unit([1, 0]), 1, [2000, 0, 0]);
    sim.step(1500);
    expect(Math.hypot(...stray.position)).toBeLessThan(defaultSpaceConfig.boundsRadius);
  });

  it('is deterministic', () => {
    const build = () => {
      const sim = new SpaceSimulation(cal);
      ['a', 'b', 'c', 'd'].forEach((w, i) => sim.add(w, unit([1, i * 0.3, i % 2]), i));
      sim.step(500);
      return sim.bodies.map(b => b.position);
    };
    expect(build()).toEqual(build());
  });

  it('supports removing and clearing bodies', () => {
    const sim = new SpaceSimulation(cal);
    const a = sim.add('a', unit([1, 0]), 1);
    sim.add('b', unit([0, 1]), 2);
    sim.remove(a.id);
    expect(sim.bodies.map(b => b.word)).toEqual(['b']);
    sim.step(10);
    sim.clear();
    expect(sim.bodies).toHaveLength(0);
    expect(() => sim.step(5)).not.toThrow();
  });

  it('steps 40 words in under a millisecond', () => {
    const sim = new SpaceSimulation(cal);
    for (let i = 0; i < 40; i++) sim.add(`w${i}`, unit(Array.from({ length: 384 }, (_, k) => Math.sin(i * 7 + k))), i);
    sim.step(20); // warm up JIT and the similarity cache
    const t = performance.now();
    sim.step(200);
    expect((performance.now() - t) / 200).toBeLessThan(1);
  });
});

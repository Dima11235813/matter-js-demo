import { describe, it, expect } from 'vitest';
import { bestViewDirection, principalAxes } from '../src/physics/principalAxes';

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('principalAxes', () => {
  it('finds the long axis of a line of points', () => {
    const line = [0, 1, 2, 3, 4].map(t => [t * 100 + 5, t * 100, 7]);
    const { axes, variances, centroid } = principalAxes(line);
    expect(Math.abs(dot(axes[0], [Math.SQRT1_2, Math.SQRT1_2, 0]))).toBeCloseTo(1, 5);
    expect(variances[1]).toBeCloseTo(0, 5);
    expect(centroid).toEqual([205, 200, 7]);
  });

  it('returns orthonormal axes in descending variance', () => {
    const cloud = [[300, 0, 0], [-300, 0, 0], [0, 100, 0], [0, -100, 0], [0, 0, 20], [0, 0, -20]];
    const { axes, variances } = principalAxes(cloud);
    expect(variances[0]).toBeGreaterThan(variances[1]);
    expect(variances[1]).toBeGreaterThan(variances[2]);
    axes.forEach(a => expect(Math.hypot(...a)).toBeCloseTo(1));
    expect(dot(axes[0], axes[1])).toBeCloseTo(0);
    expect(Math.abs(axes[2][2])).toBeCloseTo(1); // least variance along z
  });
});

describe('bestViewDirection', () => {
  const ring = [0, 1, 2, 3, 4, 5, 6].map(k => [Math.cos(k) * 300, 0, Math.sin(k) * 300]); // a ring lying flat (normal = y)

  it('looks along the least-variance axis, from the side the viewer is on', () => {
    const d = bestViewDirection(principalAxes([[0, 0, 0], [400, 0, 0], [0, 300, 0], [400, 300, 5]]), [0, 0, 1]);
    expect(d[2]).toBeGreaterThan(0.99);
    const flipped = bestViewDirection(principalAxes([[0, 0, 0], [400, 0, 0], [0, 300, 0], [400, 300, 5]]), [0, 0, -1]);
    expect(flipped[2]).toBeLessThan(-0.99);
  });

  it('never looks straight down (the orbit camera keeps +y up)', () => {
    const d = bestViewDirection(principalAxes(ring), [0, 1, 0]);
    expect(Math.abs(d[1])).toBeLessThanOrEqual(0.8 + 1e-9);
    expect(Math.hypot(...d)).toBeCloseTo(1);
  });
});

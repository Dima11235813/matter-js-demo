import { describe, it, expect } from 'vitest';
import { classicalMds, pcaScores, procrustes2d, symmetricEigen, orbitRotation, applyMatrix } from './linalg';

// Sanity checks for the research helpers (run with the experiments, not the unit suite).
describe('research linalg', () => {
  it('diagonalizes a symmetric matrix', () => {
    const { values, vectors } = symmetricEigen([[2, 1], [1, 2]]);
    expect(values[0]).toBeCloseTo(3);
    expect(values[1]).toBeCloseTo(1);
    expect(Math.abs(vectors[0][0])).toBeCloseTo(Math.SQRT1_2);
  });

  it('recovers a planar configuration with classical MDS (up to rotation)', () => {
    const pts = [[0, 0], [3, 0], [0, 4], [3, 4], [1, 2]];
    const d = pts.map(a => pts.map(b => Math.hypot(a[0] - b[0], a[1] - b[1])));
    const mds = classicalMds(d, 2);
    expect(procrustes2d(mds, pts).disparity).toBeLessThan(1e-9);
  });

  it('explains all variance of rank-2 data in two components', () => {
    const vecs = [[1, 0, 0], [0, 1, 0], [1, 1, 0], [2, 1, 0]].map(v => Float32Array.from(v));
    const { explained } = pcaScores(vecs, 2);
    expect(explained[0] + explained[1]).toBeCloseTo(1, 5);
  });

  it('aligns rotated + scaled copies perfectly and never mirrors', () => {
    const a = [[0, 0], [1, 0], [0, 2], [3, 1]];
    const rot = a.map(([x, y]) => [2 * (x * Math.cos(1) - y * Math.sin(1)) + 5, 2 * (x * Math.sin(1) + y * Math.cos(1)) - 3]);
    expect(procrustes2d(a, rot).disparity).toBeLessThan(1e-12);
    const mirrored = a.map(([x, y]) => [-x, y]);
    expect(procrustes2d(a, mirrored).disparity).toBeGreaterThan(0.1);
  });

  it('builds proper rotations', () => {
    const r = orbitRotation(90, 0);
    const p = applyMatrix(r, [1, 0, 0]);
    expect(p[0]).toBeCloseTo(0);
    expect(Math.abs(p[2])).toBeCloseTo(1);
  });
});

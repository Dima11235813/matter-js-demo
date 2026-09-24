import { describe, it, expect } from 'vitest';
import { normalizeInPlace } from '../src/embeddings/vectorMath';
import { layoutFidelity, spearman } from '../src/physics/layoutMetrics';

const unit = (v: number[]) => normalizeInPlace(Float32Array.from(v));
// Strict similarity order: A~B (0.91) > B~C (0.11) > A~C (0), so a perfect map exists.
const vectors = [unit([1, 0, 0]), unit([0.9, 0.4, 0]), unit([0, 0.3, 1])];

describe('spearman', () => {
  it('is 1 for identical orderings and -1 for reversed', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1);
  });

  it('handles ties with average ranks', () => {
    expect(spearman([1, 1, 2], [1, 1, 2])).toBeCloseTo(1);
  });

  it('is 0 when one side is constant', () => {
    expect(spearman([1, 2, 3], [5, 5, 5])).toBe(0);
  });
});

describe('layoutFidelity', () => {
  it('is -1 when similar words sit closest (2D)', () => {
    const { spearman: s, pairs } = layoutFidelity([[0, 0], [50, 0], [500, 0]], vectors);
    expect(pairs).toBe(3);
    expect(s).toBeCloseTo(-1);
  });

  it('is positive when the layout contradicts meaning', () => {
    expect(layoutFidelity([[0, 0], [500, 0], [50, 0]], vectors).spearman).toBeGreaterThan(0);
  });

  it('works the same for 3D positions', () => {
    expect(layoutFidelity([[0, 0, 0], [0, 0, 50], [0, 480, 40]], vectors).spearman).toBeCloseTo(-1);
  });

  it('returns 0 for fewer than three words', () => {
    expect(layoutFidelity([[0, 0], [1, 1]], vectors.slice(0, 2)).spearman).toBe(0);
  });
});

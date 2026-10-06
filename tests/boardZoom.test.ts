import { describe, it, expect } from 'vitest';
import { boardZoom, WORD_SIZES, ZOOM } from '../src/physics/boardZoom';

const wordArea = (len: number) => (len * 20 + 20) * 44; // full-size 2D word box

describe('board zoom (Task 5.7.0)', () => {
  it('keeps desktop words full size on a roomy board, at every word size', () => {
    for (const size of ['small', 'medium', 'large'] as const) expect(boardZoom(1220, 800, Array(20).fill(wordArea(7)), size)).toBe(1);
  });

  it('zooms a phone board to the word size floor: small 0.5, medium 0.7 (default), large 0.9', () => {
    const areas = Array(10).fill(wordArea(7));
    expect(boardZoom(352, 839, areas, 'small')).toBeCloseTo(0.5, 9);
    expect(boardZoom(352, 839, areas)).toBeCloseTo(0.7, 9);
    expect(boardZoom(352, 839, areas, 'large')).toBeCloseTo(0.9, 9);
  });

  it('shrinks crowded boards, but never below the size minimum (piled words stay tappable)', () => {
    for (const size of ['small', 'medium', 'large'] as const) {
      const roomy = boardZoom(352, 839, Array(6).fill(wordArea(7)), size);
      const crowded = boardZoom(352, 839, Array(80).fill(wordArea(7)), size);
      expect(crowded).toBeLessThan(roomy);
      expect(crowded).toBeGreaterThanOrEqual(WORD_SIZES[size].min - 1e-9);
    }
  });

  it('covers at most the fill target unless the minimum zoom is reached', () => {
    const areas = Array(25).fill(wordArea(8));
    const zoom = boardZoom(1220, 800, areas);
    const covered = areas.reduce((s, a) => s + a * zoom * zoom, 0) / (1220 * 800);
    expect(covered).toBeLessThanOrEqual(WORD_SIZES.medium.maxFill + 1e-9);
  });

  it('steps in 0.05s so small changes do not jitter', () => {
    const zoom = boardZoom(700, 800, Array(12).fill(wordArea(6)));
    expect(Math.round(zoom / ZOOM.step) * ZOOM.step).toBeCloseTo(zoom, 9);
  });
});

import { describe, it, expect } from 'vitest';
import { boardZoom, ZOOM } from '../src/physics/boardZoom';

const wordArea = (len: number) => (len * 20 + 20) * 44; // full-size 2D word box

describe('board zoom (Task 5.7.0)', () => {
  it('keeps desktop words full size on a roomy board', () => {
    expect(boardZoom(1220, 800, Array(20).fill(wordArea(7)))).toBe(1);
  });

  it('zooms out on a phone, and further when the board is crowded', () => {
    const phone = boardZoom(352, 839, Array(10).fill(wordArea(7)));
    const crowded = boardZoom(352, 839, Array(60).fill(wordArea(7)));
    expect(phone).toBeLessThanOrEqual(0.5);
    expect(crowded).toBeLessThan(phone);
    expect(crowded).toBeGreaterThanOrEqual(ZOOM.min);
  });

  it('covers at most the fill target unless the minimum zoom is reached', () => {
    const areas = Array(25).fill(wordArea(8));
    const zoom = boardZoom(1220, 800, areas);
    const covered = areas.reduce((s, a) => s + a * zoom * zoom, 0) / (1220 * 800);
    expect(covered).toBeLessThanOrEqual(ZOOM.maxFill + 1e-9);
  });

  it('steps in 0.05s so small changes do not jitter', () => {
    const zoom = boardZoom(700, 800, Array(12).fill(wordArea(6)));
    expect(Math.round(zoom / ZOOM.step) * ZOOM.step).toBeCloseTo(zoom, 9);
  });
});

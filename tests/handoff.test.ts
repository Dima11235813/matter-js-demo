import { describe, it, expect } from 'vitest';
import { boundingSphere, canvasToSpace, fitDistance, ndcToCanvas, pixelMatchedDistance, spaceToCanvas } from '../src/space/handoff';

const size: [number, number] = [1200, 800];

describe('2D <-> 3D hand-off', () => {
  it('maps the canvas centre to the world origin with y flipped', () => {
    expect(canvasToSpace([600, 400], size)).toEqual([0, 0]);
    expect(canvasToSpace([700, 300], size)).toEqual([100, 100]);
  });

  it('round-trips canvas -> space -> canvas', () => {
    const p: [number, number] = [123, 456];
    expect(spaceToCanvas(canvasToSpace(p, size), size)).toEqual(p);
  });

  it('converts NDC to canvas pixels and clamps words into view', () => {
    expect(ndcToCanvas([0, 0], size)).toEqual([600, 400]);
    expect(ndcToCanvas([1, 1], size, 0)).toEqual([1200, 0]);
    expect(ndcToCanvas([3, -3], size, 40)).toEqual([1160, 760]); // off-screen words land on the edge
  });

  it('places the camera so the z = 0 plane is pixel-matched', () => {
    // At 90 degrees vertical FOV the half-height equals the distance.
    expect(pixelMatchedDistance(800, 90)).toBeCloseTo(400);
    expect(pixelMatchedDistance(800, 50)).toBeGreaterThan(800);
  });
});

describe('camera framing', () => {
  it('fits a sphere by the narrower field of view', () => {
    const wide = fitDistance(100, 90, 2);  // landscape: vertical FOV is the limit
    expect(wide).toBeCloseTo(100 / Math.sin(Math.PI / 4));
    expect(fitDistance(100, 90, 0.5)).toBeGreaterThan(wide); // portrait: horizontal is narrower
  });

  it('computes centroid and radius including word sizes', () => {
    const { center, radius } = boundingSphere([
      { position: [0, 0, 0], radius: 10 },
      { position: [100, 0, 0], radius: 20 },
    ]);
    expect(center).toEqual([50, 0, 0]);
    expect(radius).toBe(70);
    expect(boundingSphere([]).radius).toBe(0);
  });
});

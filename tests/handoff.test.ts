import { describe, it, expect } from 'vitest';
import { boardTransfer, boundingSphere, canvasToSpace, fitDistance, handoffQueue, ndcToCanvas, pixelMatchedDistance, spaceToCanvas } from '../src/space/handoff';

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

describe('handoffQueue', () => {
  const words = [{ word: 'king', x: 10, y: 20, color: '#fff' }, { word: 'man', x: 30, y: 40 }];

  it('adopts the board, then the spawns that were still queued', () => {
    const queue = handoffQueue({ view: 'fountain', words, pending: [{ word: 'queen', focusGroup: ['king', 'man', 'queen'] }, { word: 'dog' }] }, 'fountain');
    expect(queue!.map(r => r.word)).toEqual(['king', 'man', 'queen', 'dog']);
    expect(queue![0]).toEqual({ word: 'king', x: 10, y: 20, color: '#fff' });
    expect(queue![2].focusGroup).toEqual(['king', 'man', 'queen']);
  });

  it('keeps a queued fresh board even when nothing had spawned yet', () => {
    expect(handoffQueue({ view: 'fountain', words: [], pending: [{ word: 'dog' }, { word: 'cat' }] }, 'fountain')!.map(r => r.word)).toEqual(['dog', 'cat']);
  });

  it('drops plain duplicates of words already handed over, but keeps focus requests', () => {
    const queue = handoffQueue({ view: 'fountain', words, pending: [{ word: 'king' }, { word: 'man', focus: true }] }, 'fountain');
    expect(queue!.map(r => r.word)).toEqual(['king', 'man', 'man']);
  });

  it('adopts nothing across views or from an empty board', () => {
    expect(handoffQueue({ view: 'game', words, pending: [] }, 'fountain')).toBeUndefined();
    expect(handoffQueue({ view: 'fountain', words: [], pending: [] }, 'fountain')).toBeUndefined();
    expect(handoffQueue(undefined, 'fountain')).toBeUndefined();
  });
});

describe('boardTransfer (one board across modes, Feature 2.14)', () => {
  const words = [{ word: 'eat', x: 10, y: 20, color: '#fff' }, { word: 'tea', x: 30, y: 40 }, { word: 'eat', x: 50, y: 60 }];

  it('continues the whole board, queue included, after a 2D <-> 3D switch of the same view', () => {
    const transfer = boardTransfer({ view: 'game', words, pending: [{ word: 'paris' }] }, 'game', true);
    expect(transfer).toEqual({ kind: 'continue', queue: handoffQueue({ view: 'game', words, pending: [{ word: 'paris' }] }, 'game') });
  });

  it('carries only the words, once each, at their positions when the view changes', () => {
    const transfer = boardTransfer({ view: 'sandbox', words, pending: [{ word: 'dog' }] }, 'fountain', true);
    expect(transfer).toEqual({ kind: 'carry', words: [{ word: 'eat', x: 10, y: 20, color: '#fff' }, { word: 'tea', x: 30, y: 40, color: undefined }] });
  });

  it('carries nothing into a view without words, from an empty board, or without a handoff', () => {
    expect(boardTransfer({ view: 'fountain', words, pending: [] }, 'sandbox', false)).toBeUndefined();
    expect(boardTransfer({ view: 'sandbox', words: [], pending: [{ word: 'dog' }] }, 'fountain', true)).toBeUndefined();
    expect(boardTransfer(undefined, 'fountain', true)).toBeUndefined();
  });
});

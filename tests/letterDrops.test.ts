import { describe, it, expect } from 'vitest';
import { canDrop, LETTER_DROPS, letterTileColor } from '../src/game/letterDrops';

describe('letter drops (owner, 2026-10-06)', () => {
  const last = { lastAt: 1000, lastX: 100, lastY: 100 };

  it('allows the first drop, then at most one per interval', () => {
    expect(canDrop(undefined, 0, 0, 0, 0, false)).toEqual({ ok: true });
    expect(canDrop(last, 1000 + LETTER_DROPS.minIntervalMs - 1, 300, 300, 5, false)).toEqual({ ok: false, reason: 'tooFast' });
    expect(canDrop(last, 1000 + LETTER_DROPS.minIntervalMs, 300, 300, 5, false)).toEqual({ ok: true });
  });

  it('makes a drag move a tile away before the next drop (no stacks on one spot); taps may repeat in place', () => {
    const later = 1000 + LETTER_DROPS.minIntervalMs + 10;
    expect(canDrop(last, later, 110, 105, 5, true)).toEqual({ ok: false, reason: 'tooClose' });
    expect(canDrop(last, later, 100 + LETTER_DROPS.minDragDistance, 100, 5, true)).toEqual({ ok: true });
    expect(canDrop(last, later, 110, 105, 5, false)).toEqual({ ok: true });
  });

  it('stops at a full board', () => {
    expect(canDrop(undefined, 0, 0, 0, LETTER_DROPS.maxOnBoard, false)).toEqual({ ok: false, reason: 'full' });
  });

  it('colors vowels warm and consonants cool, the same way every time', () => {
    const warm = (hex: string) => parseInt(hex.slice(1, 3), 16) > parseInt(hex.slice(5, 7), 16);
    for (const v of 'aeiou') expect(warm(letterTileColor(v)), v).toBe(true);
    for (const c of 'bcdfgklmnprst') expect(warm(letterTileColor(c)), c).toBe(false);
    expect(letterTileColor('T')).toBe(letterTileColor('t'));
  });
});

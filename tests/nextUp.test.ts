import { describe, it, expect } from 'vitest';
import { NextUpQueue } from '../src/game/nextUp';

/** A draw that returns the given items in order, then undefined. */
const sequence = (...items: string[]) => {
  let i = 0;
  return () => items[i++];
};

describe('next-up queue (Feature 2.16)', () => {
  it('takes exactly the item the preview showed, then reserves the next one', () => {
    const queue = new NextUpQueue(sequence('king', 'queen', 'apple'));
    expect(queue.peek()).toBe('king');
    expect(queue.peek()).toBe('king'); // peeking does not consume
    expect(queue.take()).toBe('king');
    expect(queue.peek()).toBe('queen');
    expect(queue.take()).toBe('queen');
    expect(queue.take()).toBe('apple');
  });

  it('skips items that are not usable (already on the board)', () => {
    const onBoard = new Set(['king']);
    const queue = new NextUpQueue(sequence('king', 'queen'));
    expect(queue.take(word => !onBoard.has(word))).toBe('queen');
  });

  it('redraws a reserved item that became unusable since it was shown', () => {
    const onBoard = new Set<string>();
    const queue = new NextUpQueue(sequence('king', 'queen'));
    expect(queue.peek(word => !onBoard.has(word))).toBe('king');
    onBoard.add('king'); // e.g. it arrived with a carried board
    expect(queue.peek(word => !onBoard.has(word))).toBe('queen');
  });

  it('never reserves the item it just handed out, even before it lands on the board', () => {
    const queue = new NextUpQueue(sequence('king', 'king', 'queen'));
    expect(queue.take()).toBe('king');
    expect(queue.peek()).toBe('queen');
  });

  it('returns undefined while the source has nothing (vocabulary loading), and recovers later', () => {
    let ready = false;
    const queue = new NextUpQueue(() => (ready ? 'king' : undefined));
    expect(queue.peek()).toBeUndefined();
    expect(queue.take()).toBeUndefined();
    ready = true;
    expect(queue.take()).toBe('king');
  });

  it('gives up after a bounded number of draws instead of looping forever', () => {
    let draws = 0;
    const queue = new NextUpQueue(() => { draws++; return 'king'; }, 10);
    expect(queue.peek(() => false)).toBeUndefined();
    expect(draws).toBe(10);
  });
});

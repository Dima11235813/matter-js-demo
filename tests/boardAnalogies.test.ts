import { describe, it, expect } from 'vitest';
import { analogyWords, MAX_BOARD_ANALOGIES, prependBoardAnalogy } from '../src/game/boardAnalogies';

describe('board analogies', () => {
  it('keeps the newest analogy first', () => {
    const list = prependBoardAnalogy(prependBoardAnalogy([], 'first'), 'second');
    expect(list).toEqual(['second', 'first']);
  });

  it('caps the list, dropping the oldest', () => {
    let list: number[] = [];
    for (let i = 0; i < MAX_BOARD_ANALOGIES + 5; i++) list = prependBoardAnalogy(list, i);
    expect(list).toHaveLength(MAX_BOARD_ANALOGIES);
    expect(list[0]).toBe(MAX_BOARD_ANALOGIES + 4);
    expect(list).not.toContain(0);
  });

  it('does not mutate the previous list (MobX observable.ref replaces it)', () => {
    const before = ['a'];
    prependBoardAnalogy(before, 'b');
    expect(before).toEqual(['a']);
  });

  it('focuses the question and the answer, without duplicates', () => {
    expect(analogyWords({ a: 'man', b: 'king', c: 'woman', answer: 'queen' })).toEqual(['man', 'king', 'woman', 'queen']);
    expect(analogyWords({ a: 'big', b: 'bigger', c: 'big', answer: 'biggest' })).toEqual(['big', 'bigger', 'biggest']);
  });
});

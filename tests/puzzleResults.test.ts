import { describe, it, expect } from 'vitest';
import { bestPuzzleResult, puzzleKey, puzzleMoveCount } from '../src/game/puzzleResults';

const event = (payload: Record<string, unknown>, type = 'puzzle') => ({ type, payload });

describe('Connect-All results (Task 2.10.5)', () => {
  it('counts every added word, plus each removal, as a move', () => {
    expect(puzzleMoveCount({ moves: ['bridge', 'span'] })).toBe(2);
    // Added "arch", removed it (2 moves), then added "bridge" and "span".
    expect(puzzleMoveCount({ moves: ['bridge', 'span'], removed: ['arch'] })).toBe(4);
    // Removed and added back: add, remove, add.
    expect(puzzleMoveCount({ moves: ['arch'], removed: ['arch'] })).toBe(3);
  });

  it('identifies a puzzle by its words, in any order', () => {
    expect(puzzleKey(['sea', 'dog', 'king'])).toBe(puzzleKey(['king', 'sea', 'dog']));
  });

  it('keeps the fewest moves on the same board, ignoring other boards and other events', () => {
    const words = ['dog', 'king', 'sea'];
    const events = [
      event({ seed: 3, par: 4, words: ['king', 'dog', 'sea'], moves: ['a', 'b', 'c', 'd', 'e'], moveCount: 5 }),
      event({ seed: 3, par: 4, words, moves: ['a', 'b', 'c', 'd'], moveCount: 4 }),
      event({ seed: 3, par: 4, words: ['other', 'board', 'same', 'seed'], moveCount: 2 }), // a different board for #3
      event({ seed: 3, par: 4, moves: ['a'] }), // before words were recorded: can't tell the board
      event({ a: 'x' }, 'analogy'),
    ];
    expect(bestPuzzleResult(events, words)).toEqual({ moves: 4, par: 4 });
    expect(bestPuzzleResult(events, ['never', 'played'])).toBeUndefined();
  });

  it('falls back to the moves list when the move count is missing', () => {
    expect(bestPuzzleResult([event({ par: 3, words: ['a', 'b'], moves: ['x', 'y', 'z'] })], ['a', 'b'])).toEqual({ moves: 3, par: 3 });
  });
});

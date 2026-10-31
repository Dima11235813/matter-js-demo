import { describe, it, expect } from 'vitest';
import { beatsBest, bestPuzzleResult, bestSolvesByBoard, puzzleKey, puzzleMoveCount } from '../src/game/puzzleResults';

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

describe('Connect-All bests per board (Task 2.10.7)', () => {
  it('normalizes the board key, as the shared contract does', () => {
    expect(puzzleKey([' Sea', 'DOG', 'king'])).toBe('dog king sea');
  });

  it('collects the best solve per board from play events, with its time and number', () => {
    const at = (payload: Record<string, unknown>, when: number) => ({ type: 'puzzle', at: when, payload });
    const bests = bestSolvesByBoard([
      at({ seed: 3, par: 4, words: ['sea', 'dog'], moveCount: 6 }, 100),
      at({ seed: 3, par: 4, words: ['dog', 'sea'], moveCount: 4 }, 200),
      at({ seed: 3, par: 4, words: ['dog', 'sea'], moveCount: 4 }, 300), // a tie keeps the first
      at({ seed: 9, par: 2, words: ['owl', 'cat'], moveCount: 2 }, 400),
      at({ par: 2, words: [1, 2], moveCount: 2 }, 500), // malformed: skipped
      { type: 'analogy', at: 600, payload: { a: 'x' } },
    ]);
    expect([...bests.keys()].sort()).toEqual(['cat owl', 'dog sea']);
    expect(bests.get('dog sea')).toEqual({ words: ['dog', 'sea'], moves: 4, par: 4, seed: 3, solvedAt: 200 });
  });

  it('counts only strictly fewer moves as a new best', () => {
    expect(beatsBest({ moves: 4, par: 3 }, undefined)).toBe(true);
    expect(beatsBest({ moves: 4, par: 3 }, { moves: 5, par: 3 })).toBe(true);
    expect(beatsBest({ moves: 4, par: 3 }, { moves: 4, par: 3 })).toBe(false);
  });
});

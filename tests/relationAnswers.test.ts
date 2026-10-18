import { describe, it, expect } from 'vitest';
import { buildIndex } from './helpers/indexFixtures';
import { bankAnswer, findRelation, solveWithBank } from '../src/game/relationAnswers';
import { parseRelationBank } from '../src/game/relationPairs';
import { solveAnalogy } from '../src/embeddings/analogy';

// Axes: dog, cat, cow, horse, "young", noise. Each young animal is its parent plus the young axis.
const index = buildIndex({
  dog: [1, 0, 0, 0, 0, 0.1], puppy: [1, 0, 0, 0, 1, 0],
  cat: [0, 1, 0, 0, 0, 0.1], kitten: [0, 1, 0, 0, 1, 0],
  cow: [0, 0, 1, 0, 0, 0.1], calf: [0, 0, 1, 0, 1, 0],
  horse: [0, 0, 0, 1, 0, 0.1], foal: [0, 0, 0, 1, 1, 0],
  stable: [0, 0, 0, 1, 0, 1], table: [0, 0, 0, 0, 0, 1], hot: [0.3, 0.3, 0, 0, 0, 0.8], cold: [0.3, 0.3, 0, 0, 0, -0.8],
});
// horse → foal is deliberately missing from the bank.
const bank = parseRelationBank(': animal-young\ndog puppy\ncat kitten\ncow calf\n');

describe('relation bank answers (Feature 2.17)', () => {
  it('finds the relation of a pair, in either direction', () => {
    expect(findRelation(bank, 'dog', 'puppy')).toEqual({ category: 'animal-young', reversed: false });
    expect(findRelation(bank, 'kitten', 'cat')).toEqual({ category: 'animal-young', reversed: true });
    expect(findRelation(bank, 'dog', 'cat')).toBeUndefined();
    expect(bankAnswer(bank.get('animal-young')!, false, 'cow', [])).toBe('calf');
    expect(bankAnswer(bank.get('animal-young')!, true, 'calf', [])).toBe('cow');
  });

  it('answers from the bank when it knows both the relation and c', () => {
    expect(solveWithBank(index, bank, 'dog', 'puppy', 'cat')).toMatchObject({ answer: 'kitten', source: 'bank', category: 'animal-young' });
    expect(solveWithBank(index, bank, 'puppy', 'dog', 'kitten')).toMatchObject({ answer: 'cat', source: 'bank' });
  });

  it('answers the swapped form from the bank (a : b :: c : d holds when a : c :: b : d)', () => {
    // dog : cat :: puppy is not a bank pair as asked, but dog → puppy is, applied to cat.
    expect(solveWithBank(index, bank, 'dog', 'cat', 'puppy')).toMatchObject({ answer: 'kitten', source: 'bank', category: 'animal-young' });
  });

  it('uses the relation average offset when c is not in the bank', () => {
    const result = solveWithBank(index, bank, 'dog', 'puppy', 'horse');
    expect(result).toMatchObject({ answer: 'foal', source: 'relation', category: 'animal-young' });
    expect(result!.alternatives.map(n => n.word)).not.toContain('foal');
  });

  it('falls back to the vectors, labelled as the model, when the relation is unknown', () => {
    const result = solveWithBank(index, bank, 'hot', 'cold', 'dog');
    expect(result?.source).toBe('model');
    expect(result?.answer).toBe(solveAnalogy(index, 'hot', 'cold', 'dog')?.answer);
  });

  it('never answers a word the policy blocks, even from the bank', () => {
    const result = solveWithBank(index, bank, 'dog', 'puppy', 'cat', w => w !== 'kitten');
    expect(result?.answer).not.toBe('kitten');
    expect(result?.source).toBe('relation');
  });

  it('returns undefined when a word has no vector', () => {
    expect(solveWithBank(index, bank, 'dog', 'puppy', 'unicorn')).toBeUndefined();
  });
});

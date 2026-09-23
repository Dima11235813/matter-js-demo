import { describe, it, expect } from 'vitest';
import { cosineSimilarity, centerAndNormalize, analogyTarget, dot } from '../src/embeddings/vectorMath';
import { solveAnalogy, isInflectionOf, sharesStem, isMorphologicalQuestion } from '../src/embeddings/analogy';
import { buildIndex } from './helpers/indexFixtures';

describe('Embedding Service Cosine Similarity tests', () => {

  it('should return 1.0 for identical vectors', () => {
    const vec = [1, 2, 3, 4];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 5);
  });

  it('should return -1.0 for completely opposite vectors', () => {
    const vecA = [1, 0, -1];
    const vecB = [-1, 0, 1];
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(-1.0, 5);
  });

  it('should return 0.0 for orthogonal vectors', () => {
    const vecA = [1, 0];
    const vecB = [0, 1];
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(0.0, 5);
  });

  it('should return 0 for vectors of different lengths', () => {
    const vecA = [1, 2];
    const vecB = [1, 2, 3];
    expect(cosineSimilarity(vecA, vecB)).toBe(0);
  });

  it('should return 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('should calculate correct similarity values', () => {
    const vecA = [3, 4, 0];
    const vecB = [4, 3, 0];
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(0.96, 5);
  });

  it('centers against the mean and renormalizes', () => {
    const centered = centerAndNormalize([2, 1, 1], [1, 1, 1]);
    expect(Array.from(centered)).toEqual([1, 0, 0]);
    expect(dot(centered, centered)).toBeCloseTo(1, 6);
  });

  it('builds a unit-length analogy target b - a + c', () => {
    const target = analogyTarget([1, 0, 0], [1, 0, 1], [0, 1, 0]);
    expect(Array.from(target).map(v => Number(v.toFixed(4)))).toEqual([0, 0.7071, 0.7071]);
  });
});

describe('Analogy Solver Logic tests', () => {
  const index = buildIndex({
    king: [1.0, 0.0, 1.0],
    man: [1.0, 0.0, 0.0],
    woman: [0.0, 1.0, 0.0],
    queen: [0.0, 1.0, 1.0], // king - man + woman = [0,1,1] = queen
    water: [0.0, 0.0, -1.0],
  });

  it('should resolve closest analogy correctly over the vector index', () => {
    const result = solveAnalogy(index, 'man', 'king', 'woman');
    expect(result?.answer).toBe('queen');
    expect(result?.similarity).toBeGreaterThan(0.95);
  });

  it('never answers with one of the question words', () => {
    const result = solveAnalogy(index, 'man', 'king', 'woman', undefined, 10);
    const words = [result!.answer, ...result!.alternatives.map(n => n.word)];
    expect(words).not.toContain('man');
    expect(words).not.toContain('king');
    expect(words).not.toContain('woman');
  });

  it('respects the allow predicate (profanity policy hook)', () => {
    const result = solveAnalogy(index, 'man', 'king', 'woman', w => w !== 'queen');
    expect(result?.answer).not.toBe('queen');
  });

  it('returns undefined when a word has no vector', () => {
    expect(solveAnalogy(index, 'man', 'king', 'unicorn')).toBeUndefined();
  });

  it('detects shared stems and morphological questions', () => {
    expect(sharesStem('summertime', 'summer')).toBe(true);
    expect(sharesStem('winter', 'summer')).toBe(false);
    expect(sharesStem('at', 'atom')).toBe(false); // too short to count as a stem
    expect(sharesStem('arriving', 'arrive')).toBe(true); // dropped e
    expect(sharesStem('creation', 'create')).toBe(true);
    expect(sharesStem('police', 'polite')).toBe(false); // short shared prefix
    expect(sharesStem('change', 'channel')).toBe(false);
    expect(isMorphologicalQuestion('big', 'bigger')).toBe(true);
    expect(isMorphologicalQuestion('hot', 'cold')).toBe(false);
  });

  it('treats simple plurals as inflections of the input', () => {
    expect(isInflectionOf('kings', 'king')).toBe(true);
    expect(isInflectionOf('boxes', 'box')).toBe(true);
    expect(isInflectionOf('kingdom', 'king')).toBe(false);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { cosineSimilarity, findClosestAnalogy } from '../src/utils/embeddingService';
import * as embService from '../src/utils/embeddingService';

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
});

describe('Analogy Solver Logic tests', () => {
  it('should resolve closest analogy correctly using mock embeddings', async () => {
    const mockEmbeddings: Record<string, number[]> = {
      "king": [1.0, 0.0, 1.0],
      "man": [1.0, 0.0, 0.0],
      "woman": [0.0, 1.0, 0.0],
      "queen": [0.0, 1.0, 1.0], // king - man + woman = [1,0,1] - [1,0,0] + [0,1,0] = [0,1,1] = queen!
      "water": [0.0, 0.0, -1.0]
    };

    // Spy on getEmbedding and return mock vectors
    const getEmbeddingSpy = vi.spyOn(embService, 'getEmbedding').mockImplementation(async (word) => {
      return mockEmbeddings[word.toLowerCase().trim()] || [0, 0, 0];
    });

    const result = await findClosestAnalogy("man", "king", "woman");
    expect(result.word).toBe("queen");
    
    getEmbeddingSpy.mockRestore();
  });
});

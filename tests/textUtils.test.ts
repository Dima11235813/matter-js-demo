import { describe, it, expect } from 'vitest';
import { determineMergeText, alphabet, sizeOfLargestWord } from '../src/utils/textUtils';

describe('Lexical Fountain Domain Unit Tests', () => {

  describe('determineMergeText pure function', () => {

    // Mock lookups for character pair frequencies
    const mockLetterCombos: Record<string, number>[] = [];
    mockLetterCombos[2] = {
      'ab': 100,
      'ba': 50,
      'co': 300,
      'oc': 0
    };
    mockLetterCombos[3] = {
      'cat': 500,
      'tac': 10,
      'dog': 400,
      'god': 400
    };
    mockLetterCombos[4] = {
      'tree': 200,
      'eert': 0
    };

    it('should return shouldMerge = false if any input string is empty', () => {
      const res1 = determineMergeText('', 'b', mockLetterCombos);
      expect(res1.shouldMerge).toBe(false);
      
      const res2 = determineMergeText('a', '', mockLetterCombos);
      expect(res2.shouldMerge).toBe(false);
    });

    it('should return shouldMerge = false if combined length exceeds limit', () => {
      const longTextA = 'abcdef';
      const longTextB = 'ghijk';
      // Total length = 11, limit = 10
      const res = determineMergeText(longTextA, longTextB, mockLetterCombos);
      expect(res.shouldMerge).toBe(false);
    });

    it('should choose the highest frequency combo if both versions exist', () => {
      // 'ab' (freq 100) vs 'ba' (freq 50) -> choose 'ab'
      const res1 = determineMergeText('a', 'b', mockLetterCombos);
      expect(res1.shouldMerge).toBe(true);
      expect(res1.textToUse).toBe('ab');

      // 'cat' (freq 500) vs 'tac' (freq 10) -> choose 'cat'
      const res2 = determineMergeText('ca', 't', mockLetterCombos);
      expect(res2.shouldMerge).toBe(true);
      expect(res2.textToUse).toBe('cat');
    });

    it('should return the only valid combo if only one has freq > 0', () => {
      // 'tree' (freq 200) vs 'eert' (freq 0) -> choose 'tree'
      const res = determineMergeText('tr', 'ee', mockLetterCombos);
      expect(res.shouldMerge).toBe(true);
      expect(res.textToUse).toBe('tree');
    });

    it('should return shouldMerge = false if neither combo exists in lookup', () => {
      // 'xz' (freq 0) vs 'zx' (freq 0)
      const res = determineMergeText('x', 'z', mockLetterCombos);
      expect(res.shouldMerge).toBe(false);
    });
  });

  describe('Alphabet check', () => {
    it('should contain all 26 letters', () => {
      expect(alphabet).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
      expect(alphabet.length).toBe(26);
    });
  });
});

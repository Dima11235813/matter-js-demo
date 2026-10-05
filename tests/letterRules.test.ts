import { describe, it, expect } from 'vitest';
import { prefixLetterRules } from '../src/game/letterRules';
import { determineMergeText, sizeOfLargestWord } from '../src/utils/textUtils';

describe('letters mode: prefix merge rules from the vocabulary', () => {
  const rules = prefixLetterRules(['the', 'then', 'eat', 'tea', 'cat', 'Dog', "don't", 'a', 'extraordinarily'], sizeOfLargestWord);

  it('keeps whole words of 2..maxLength plain letters, lowercased', () => {
    expect([...rules.wordLookup.keys()].sort()).toEqual(['cat', 'dog', 'eat', 'tea', 'the', 'then']);
    expect(rules.source).toBe('vocabulary');
  });

  it('merges pieces that start a word, in either order, and nothing else', () => {
    expect(determineMergeText('t', 'h', rules.letterCombos)).toEqual({ shouldMerge: true, textToUse: 'th' });
    expect(determineMergeText('e', 'th', rules.letterCombos)).toEqual({ shouldMerge: true, textToUse: 'the' });
    expect(determineMergeText('at', 'c', rules.letterCombos)).toEqual({ shouldMerge: true, textToUse: 'cat' });
    // "he" and "at" occur inside words but start none: no merge (the old any-substring rule merged them).
    expect(determineMergeText('h', 'e', rules.letterCombos).shouldMerge).toBe(false);
    expect(determineMergeText('a', 't', rules.letterCombos).shouldMerge).toBe(false);
  });

  it('prefers the order that starts more words', () => {
    // "th" starts the, then; "ht" starts nothing.
    expect(determineMergeText('h', 't', rules.letterCombos).textToUse).toBe('th');
  });
});

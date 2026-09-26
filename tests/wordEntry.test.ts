import { describe, it, expect } from 'vitest';
import { expressionAsAnalogy, formatExpression, parseEntry } from '../src/game/wordEntry';

describe('parseEntry', () => {
  it('reads a single word', () => {
    expect(parseEntry('  Ocean ')).toEqual({ kind: 'word', word: 'ocean' });
    expect(parseEntry('   ')).toEqual({ kind: 'empty' });
  });

  it('reads + and − expressions', () => {
    expect(parseEntry('king - man + woman')).toEqual({
      kind: 'expression',
      terms: [{ word: 'king', sign: 1 }, { word: 'man', sign: -1 }, { word: 'woman', sign: 1 }],
    });
    expect(parseEntry('ocean+desert')).toEqual({ kind: 'expression', terms: [{ word: 'ocean', sign: 1 }, { word: 'desert', sign: 1 }] });
  });

  it('treats unicode minus and dashes as operators, even without spaces', () => {
    const expected = { kind: 'expression', terms: [{ word: 'king', sign: 1 }, { word: 'man', sign: -1 }, { word: 'woman', sign: 1 }] };
    expect(parseEntry('king−man+woman')).toEqual(expected);
    expect(parseEntry('king – man + woman')).toEqual(expected);
  });

  it('never splits hyphenated words', () => {
    expect(parseEntry('well-known')).toEqual({ kind: 'word', word: 'well-known' });
    expect(parseEntry('well-known + fact')).toEqual({ kind: 'error', message: '"well-known" is not a word (2-24 letters a-z)' });
  });

  it('accepts a leading sign', () => {
    expect(parseEntry('- man + king + woman')).toEqual({
      kind: 'expression',
      terms: [{ word: 'man', sign: -1 }, { word: 'king', sign: 1 }, { word: 'woman', sign: 1 }],
    });
  });

  it('reads analogy notation as b - a + c', () => {
    const expected = { kind: 'expression', terms: [{ word: 'king', sign: 1 }, { word: 'man', sign: -1 }, { word: 'woman', sign: 1 }] };
    expect(parseEntry('man : king :: woman')).toEqual(expected);
    expect(parseEntry('man:king::woman:?')).toEqual(expected);
    expect(parseEntry('Man is to king as woman is to')).toEqual(expected);
  });

  it('reports malformed expressions', () => {
    expect(parseEntry('king -').kind).toBe('error');
    expect(parseEntry('king + + man').kind).toBe('error');
    expect(parseEntry('king queen - man').kind).toBe('error');
    expect(parseEntry('king - king').kind).toBe('error');
    expect(parseEntry('+ king').kind).toBe('error');
  });

  it('treats several words or several lines as a text to import', () => {
    expect(parseEntry('the quick brown fox')).toEqual({ kind: 'text', text: 'the quick brown fox' });
    expect(parseEntry('photosynthesis\n')).toEqual({ kind: 'word', word: 'photosynthesis' });
    expect(parseEntry('cells\nleaves').kind).toBe('text');
  });
});

describe('expressionAsAnalogy', () => {
  it('maps b - a + c to a : b :: c, in any order', () => {
    const parse = (s: string) => (parseEntry(s) as { terms: never[] }).terms;
    expect(expressionAsAnalogy(parse('king - man + woman'))).toEqual({ a: 'man', b: 'king', c: 'woman' });
    expect(expressionAsAnalogy(parse('- man + king + woman'))).toEqual({ a: 'man', b: 'king', c: 'woman' });
    expect(expressionAsAnalogy(parse('ocean + desert'))).toBeUndefined();
    expect(expressionAsAnalogy(parse('king - man - woman'))).toBeUndefined();
  });

  it('formats for display', () => {
    const parse = (s: string) => (parseEntry(s) as { terms: never[] }).terms;
    expect(formatExpression(parse('king - man + woman'))).toBe('king − man + woman');
    expect(formatExpression(parse('- man + king'))).toBe('−man + king');
  });
});

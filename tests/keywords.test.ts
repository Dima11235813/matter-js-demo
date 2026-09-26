import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { extractKeywords, KeywordLexicon } from '../src/game/keywords';
import { parseWordList } from '../src/embeddings/profanity';
import { decodeVocabBinary, VocabManifest } from '../src/embeddings/vocabAsset';
import { VectorIndex } from '../src/embeddings/VectorIndex';

const stopwords = new Set(parseWordList(fs.readFileSync(path.resolve(__dirname, '../data/vocab/stopwords.txt'), 'utf8')));

/** Vocabulary in frequency order: index = rank. */
function lexicon(words: string[], blocked: string[] = []): KeywordLexicon {
  const rank = new Map(words.map((w, i) => [w, i]));
  return { rankOf: w => rank.get(w), has: w => rank.has(w), isAllowed: w => !blocked.includes(w), stopwords, size: words.length };
}

describe('extractKeywords', () => {
  const vocab = lexicon(['people', 'time', 'water', 'light', 'leaf', 'cell', 'berry', 'plant', 'box', 'photosynthesis', 'damn']);

  it('ranks rare words above common ones at equal counts', () => {
    const { ranked } = extractKeywords('People need light. Photosynthesis needs water.', vocab);
    expect(ranked.map(k => k.word)).toEqual(['photosynthesis', 'light', 'water', 'people']);
  });

  it('counts repeats, so a frequent common word can beat a rare one', () => {
    const { ranked } = extractKeywords('water water water water water photosynthesis', vocab);
    expect(ranked[0]).toMatchObject({ word: 'water', count: 5 });
  });

  it('drops stopwords, short tokens, and contractions; keeps possessives', () => {
    const { ranked } = extractKeywords("The plant's cells don't need it. We'll see.", vocab);
    expect(ranked.map(k => k.word).sort()).toEqual(['cell', 'plant']);
  });

  it('folds plurals onto singular vocabulary words', () => {
    const { ranked } = extractKeywords('Cells and berries in boxes', vocab);
    expect(ranked.map(k => k.word).sort()).toEqual(['berry', 'box', 'cell']);
  });

  it('folds f-plurals onto the noun, even when a verb spelling exists', () => {
    const withVerbs = lexicon(['leave', 'leaf', 'wolf', 'knife', 'give']);
    const { ranked } = extractKeywords('leaves wolves knives gives', withVerbs);
    expect(ranked.map(k => k.word).sort()).toEqual(['give', 'knife', 'leaf', 'wolf']);
  });

  it('keeps unknown words only when repeated, and marks them new', () => {
    const once = extractKeywords('chlorophyll in a leaf', vocab).ranked;
    expect(once.map(k => k.word)).toEqual(['leaf']);
    const twice = extractKeywords('chlorophyll in a leaf; chlorophyll is green', vocab).ranked;
    expect(twice[0]).toMatchObject({ word: 'chlorophyll', count: 2, isNew: true });
  });

  it('applies the profanity policy', () => {
    const filtered = lexicon(['water', 'damn'], ['damn']);
    expect(extractKeywords('damn water damn', filtered).ranked.map(k => k.word)).toEqual(['water']);
  });

  it('reports distinct words for the preview count', () => {
    expect(extractKeywords('a b a c', vocab).distinctWords).toBe(3);
  });
});

const dir = path.resolve(__dirname, '../public/vocab');
const present = fs.existsSync(path.join(dir, 'vocab.json')) && fs.existsSync(path.join(dir, 'vocab.bin'));

describe.skipIf(!present)('extractKeywords on the built vocabulary', () => {
  const load = () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'vocab.json'), 'utf8')) as VocabManifest;
    const bin = fs.readFileSync(path.join(dir, 'vocab.bin'));
    const index = VectorIndex.fromAsset(decodeVocabBinary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));
    const real: KeywordLexicon = { rankOf: w => index.rankOf(w), has: w => index.has(w), isAllowed: () => true, stopwords, size: index.baseSize };
    return real;
  };
  const real = present ? load() : ({} as KeywordLexicon);

  const texts: Record<string, { text: string; topical: string[] }> = {
    science: {
      text: `Photosynthesis is the process plants use to turn sunlight into chemical energy. Inside the leaves,
        chlorophyll absorbs light, and the cells combine carbon dioxide and water to make glucose and oxygen.
        Most plants, algae, and some bacteria rely on photosynthesis; the oxygen they release keeps the
        atmosphere breathable. Without sunlight, the leaves cannot make sugar and the plant starves.`,
      topical: ['photosynthesis', 'plant', 'sunlight', 'chlorophyll', 'leaf', 'cell', 'carbon', 'dioxide', 'glucose', 'oxygen', 'algae', 'bacteria', 'atmosphere', 'sugar', 'energy', 'chemical', 'light', 'water'],
    },
    sports: {
      text: `The striker scored twice in the second half as the team came back to win the championship final.
        The goalkeeper made three saves, the referee showed two yellow cards, and the coach praised the defense.
        Fans filled the stadium, and the captain lifted the trophy after the final whistle.`,
      topical: ['striker', 'scored', 'team', 'championship', 'final', 'goalkeeper', 'save', 'referee', 'yellow', 'card', 'coach', 'defense', 'fan', 'stadium', 'captain', 'trophy', 'whistle', 'half', 'win'],
    },
    cooking: {
      text: `Whisk the eggs with sugar until pale, then fold in the flour and melted butter. Pour the batter into
        a greased pan and bake in a hot oven for twenty minutes. Let the cake cool before adding the frosting,
        and sprinkle with cinnamon. The recipe works with brown sugar too.`,
      topical: ['whisk', 'egg', 'sugar', 'flour', 'butter', 'batter', 'pan', 'bake', 'oven', 'cake', 'frosting', 'cinnamon', 'recipe', 'melted', 'greased', 'pale', 'fold', 'brown', 'pour', 'sprinkle'],
    },
  };

  for (const [name, { text, topical }] of Object.entries(texts)) {
    it(`picks topical keywords from a ${name} text (>= 8 of 12)`, () => {
      const top = extractKeywords(text, real).ranked.slice(0, 12).map(k => k.word);
      const hits = top.filter(w => topical.includes(w));
      expect(hits.length, `top 12: ${top.join(', ')}`).toBeGreaterThanOrEqual(8);
    });
  }

  it('previews a ~500-word text quickly', () => {
    const long = Object.values(texts).map(t => t.text).join(' ').repeat(4);
    const start = performance.now();
    extractKeywords(long, real);
    expect(performance.now() - start).toBeLessThan(50);
  });
});

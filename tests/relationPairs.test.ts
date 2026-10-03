import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  categoryLabel, dealRelationPairs, designedAnswer, DESIGNED_POINTS, gradeGuess, GUESS_POINTS, parseRelationBank, RelationPair, scoreDesignedPlay,
} from '../src/game/relationPairs';
import { relationHint } from '../src/game/relationHint';
import { VocabManifest } from '../src/embeddings/vocabAsset';

const BANK_TEXT = `# comment
: capital-world
france paris
japan tokyo
italy rome
spain madrid
: family
man woman
king queen
boy girl
: gram3-comparative
big bigger
small smaller
`;
const bank = parseRelationBank(BANK_TEXT);
const seq = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]; };

describe('relation bank', () => {
  it('parses categories and pairs', () => {
    expect([...bank.keys()]).toEqual(['capital-world', 'family', 'gram3-comparative']);
    expect(bank.get('family')).toContainEqual({ x: 'king', y: 'queen', category: 'family' });
  });

  it('labels categories for the HUD', () => {
    expect(categoryLabel('capital-world')).toBe('capitals');
    expect(categoryLabel('gram3-comparative')).toBe('comparatives');
    expect(categoryLabel('something-new')).toBe('something new');
  });

  it('ships a bank whose words are all in the vocabulary', () => {
    const shipped = parseRelationBank(fs.readFileSync(path.resolve(__dirname, '../data/vocab/relation-pairs.txt'), 'utf8'));
    expect(shipped.size).toBe(10);
    const pairs = [...shipped.values()].flat();
    expect(pairs.length).toBeGreaterThan(250);
    const vocabFile = path.resolve(__dirname, '../public/vocab/vocab.json');
    if (fs.existsSync(vocabFile)) {
      const words = new Set((JSON.parse(fs.readFileSync(vocabFile, 'utf8')) as VocabManifest).words);
      expect(pairs.filter(p => !words.has(p.x) || !words.has(p.y))).toEqual([]);
    }
  });
});

describe('dealRelationPairs', () => {
  it('deals main pairs from one category and the rest from another', () => {
    const deal = dealRelationPairs(bank, { mainPairs: 3, otherPairs: 1, category: 'capital-world', random: seq(0.1, 0.5, 0.9, 0.3) });
    expect(deal.category).toBe('capital-world');
    expect(deal.pairs.filter(p => p.category === 'capital-world')).toHaveLength(3);
    expect(deal.pairs.filter(p => p.category !== 'capital-world')).toHaveLength(1);
    expect(deal.words).toHaveLength(8);
    expect(new Set(deal.words).size).toBe(8);
  });

  it('keeps words in play out, and never shares a stem across pairs', () => {
    const deal = dealRelationPairs(bank, { mainPairs: 2, otherPairs: 0, category: 'gram3-comparative', inPlay: ['big'], random: seq(0) });
    expect(deal.words).toEqual(['small', 'smaller']); // big/bigger is blocked by "big" in play
  });

  it('allows a stem inside a pair (big -> bigger)', () => {
    const deal = dealRelationPairs(bank, { mainPairs: 1, otherPairs: 0, category: 'gram3-comparative', random: seq(0) });
    expect(deal.words).toEqual(['big', 'bigger']);
  });

  it('respects the allow filter', () => {
    const deal = dealRelationPairs(bank, { mainPairs: 3, otherPairs: 0, category: 'family', allow: w => w !== 'queen', random: seq(0) });
    expect(deal.words).not.toContain('queen');
    expect(deal.pairs).toHaveLength(2);
  });
});

describe('designed plays', () => {
  const pairs: RelationPair[] = [
    { x: 'france', y: 'paris', category: 'capital-world' },
    { x: 'japan', y: 'tokyo', category: 'capital-world' },
    { x: 'man', y: 'woman', category: 'family' },
  ];

  it('finds the word that completes a dealt pair, in either direction', () => {
    expect(designedAnswer(pairs, 'france', 'paris', 'japan')).toBe('tokyo');
    expect(designedAnswer(pairs, 'paris', 'france', 'tokyo')).toBe('japan');
  });

  it('is undefined for plays across categories, mixed directions, or non-pairs', () => {
    expect(designedAnswer(pairs, 'france', 'paris', 'man')).toBeUndefined();
    expect(designedAnswer(pairs, 'france', 'paris', 'tokyo')).toBeUndefined();
    expect(designedAnswer(pairs, 'france', 'japan', 'paris')).toBeUndefined();
  });

  const thresholds = { link: 0.23, near: 0.137 };
  const plain = { dc: 0.5, da: 0.1, db: 0.2 };

  it('gives full points when the designed answer is in the top 3, and lands on it', () => {
    expect(scoreDesignedPlay(pairs, 'france', 'paris', 'japan', ['tokyo', 'osaka'], plain, thresholds))
      .toEqual({ verdict: 'full', points: DESIGNED_POINTS.full, answer: 'tokyo' });
    expect(scoreDesignedPlay(pairs, 'france', 'paris', 'japan', ['osaka', 'kyoto', 'tokyo'], plain, thresholds))
      .toEqual({ verdict: 'full', points: DESIGNED_POINTS.full, answer: 'tokyo' });
    expect(scoreDesignedPlay(pairs, 'france', 'paris', 'japan', ['osaka', 'kyoto', 'nagoya', 'tokyo'], plain, thresholds).verdict).toBe('none');
  });

  it('penalizes an answer that fell back onto the first pair', () => {
    const collapsed = { dc: 0.05, da: 0.1, db: 0.6 };
    expect(scoreDesignedPlay(pairs, 'man', 'woman', 'france', ['lady'], collapsed, thresholds))
      .toEqual({ verdict: 'penalty', points: DESIGNED_POINTS.penalty, answer: 'lady' });
  });

  it('gives nothing to other plays, including partial matches', () => {
    expect(scoreDesignedPlay(pairs, 'france', 'japan', 'man', ['woman'], plain, thresholds))
      .toEqual({ verdict: 'none', points: 0, answer: 'woman' });
  });
});

describe('relationHint', () => {
  const t = { related: 0.097, near: 0.137, link: 0.23 };
  it('says the relation carried over for a related pair, a connected answer, and aligned offsets', () => {
    expect(relationHint({ ab: 0.5, dc: 0.4, da: 0.1, db: 0.5, offset: 0.35 }, t)).toBe('carried');
    // man : king :: woman -> queen, with this model's real similarities
    expect(relationHint({ ab: 0.098, dc: 0.224, da: 0.018, db: 0.535, offset: 0.397 }, t)).toBe('carried');
  });
  it('flags an answer that fell back onto the first pair', () => {
    expect(relationHint({ ab: 0.5, dc: 0.05, da: 0.1, db: 0.6, offset: 0.4 }, t)).toBe('collapsed');
  });
  it('is unclear for unrelated pairs or weak offsets (the synonym-style play)', () => {
    expect(relationHint({ ab: 0.02, dc: 0.4, da: 0, db: 0.3, offset: 0.4 }, t)).toBe('unclear');
    expect(relationHint({ ab: 0.7, dc: 0.6, da: 0, db: 0, offset: 0.05 }, t)).toBe('unclear');
  });
});

describe('guess mode: four picks graded against the dealt pairs', () => {
  const pairs: RelationPair[] = [
    { x: 'france', y: 'paris', category: 'capital-world' },
    { x: 'japan', y: 'tokyo', category: 'capital-world' },
    { x: 'man', y: 'woman', category: 'family' },
    { x: 'king', y: 'queen', category: 'family' },
  ];

  it('is correct for two pairs of one relation in the same direction, either way round', () => {
    expect(gradeGuess(pairs, 'france', 'paris', 'japan', 'tokyo')).toEqual({ correct: true, category: 'capital-world', points: GUESS_POINTS });
    expect(gradeGuess(pairs, 'tokyo', 'japan', 'paris', 'france').correct).toBe(true);
    expect(gradeGuess(pairs, 'King', 'Queen', 'MAN', 'woman')).toMatchObject({ correct: true, category: 'family' });
  });

  it('earns nothing for mixed directions, mixed relations, the same pair twice, or words not dealt', () => {
    expect(gradeGuess(pairs, 'france', 'paris', 'tokyo', 'japan')).toEqual({ correct: false, points: 0 });
    expect(gradeGuess(pairs, 'france', 'paris', 'man', 'woman').correct).toBe(false);
    expect(gradeGuess(pairs, 'france', 'paris', 'france', 'paris').correct).toBe(false);
    expect(gradeGuess(pairs, 'france', 'paris', 'japan', 'kyoto').correct).toBe(false);
    expect(gradeGuess(pairs, 'paris', 'france', 'japan', 'tokyo').correct).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { solveAnalogy, solveExpression } from '../src/embeddings/analogy';
import { decodeVocabBinary, VocabManifest } from '../src/embeddings/vocabAsset';
import { VectorIndex } from '../src/embeddings/VectorIndex';
import { focusTargets } from '../src/matterJsComp/wordWorld';
import { buildIndex } from './helpers/indexFixtures';

describe('solveExpression', () => {
  const index = buildIndex({
    ocean: [1, 0, 0, 0],
    desert: [0, 1, 0, 0],
    beach: [0.7, 0.7, 0, 0.1],
    oceans: [0.9, 0.3, 0, 0],
    forest: [0, 0, 1, 0],
  });

  it('returns the nearest words to the signed sum, excluding inputs and their stems', () => {
    const result = solveExpression(index, [{ word: 'ocean', sign: 1 }, { word: 'desert', sign: 1 }])!;
    expect(result[0].word).toBe('beach');
    expect(result.map(n => n.word)).not.toContain('oceans');
    expect(result.map(n => n.word)).not.toContain('ocean');
  });

  it('subtracts negative terms', () => {
    const result = solveExpression(index, [{ word: 'beach', sign: 1 }, { word: 'desert', sign: -1 }])!;
    expect(result[0].word).toBe('ocean');
  });

  it('is undefined when a word is unknown', () => {
    expect(solveExpression(index, [{ word: 'ocean', sign: 1 }, { word: 'moon', sign: 1 }])).toBeUndefined();
  });
});

describe('focusTargets', () => {
  it('collects flagged words and focus groups once each', () => {
    expect(focusTargets([{ word: 'a' }, { word: 'b', focus: true }, { word: 'c', focusGroup: ['a', 'b', 'c'] }])).toEqual(['b', 'a', 'c']);
    expect(focusTargets([{ word: 'a' }])).toEqual([]);
  });
});

const dir = path.resolve(__dirname, '../public/vocab');
const present = fs.existsSync(path.join(dir, 'vocab.json')) && fs.existsSync(path.join(dir, 'vocab.bin'));

describe.skipIf(!present && !process.env.REQUIRE_VOCAB)('expressions on the built vocabulary', () => {
  const load = () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'vocab.json'), 'utf8')) as VocabManifest;
    const bin = fs.readFileSync(path.join(dir, 'vocab.bin'));
    return VectorIndex.fromAsset(decodeVocabBinary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));
  };
  const index = present ? load() : ({} as VectorIndex);

  it('a three-term sum lands where the analogy solver does', () => {
    const sum = solveExpression(index, [{ word: 'king', sign: 1 }, { word: 'man', sign: -1 }, { word: 'woman', sign: 1 }])!;
    expect(sum[0].word).toBe(solveAnalogy(index, 'man', 'king', 'woman')!.answer);
  });

  it('a two-word sum finds a word between them', () => {
    const [best] = solveExpression(index, [{ word: 'ocean', sign: 1 }, { word: 'desert', sign: 1 }])!;
    expect(['ocean', 'desert']).not.toContain(best.word);
    expect(best.similarity).toBeGreaterThan(0.3);
  });
});

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decodeVocabBinary, VocabManifest } from '../src/embeddings/vocabAsset';
import { VectorIndex } from '../src/embeddings/VectorIndex';
import { solveAnalogy } from '../src/embeddings/analogy';

/**
 * Guards the generated vocabulary (yarn vocab:build). Skipped when public/vocab is absent so a
 * fresh clone can still run unit tests before the first build.
 */
const dir = path.resolve(__dirname, '../public/vocab');
const present = fs.existsSync(path.join(dir, 'vocab.json')) && fs.existsSync(path.join(dir, 'vocab.bin'));

describe.skipIf(!present)('built vocabulary quality', () => {
  const load = () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'vocab.json'), 'utf8')) as VocabManifest;
    const bin = fs.readFileSync(path.join(dir, 'vocab.bin'));
    const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
    return { manifest, index: VectorIndex.fromAsset(decodeVocabBinary(manifest, buffer)) };
  };
  const { manifest, index } = present ? load() : ({} as ReturnType<typeof load>);

  it('has a large, clean, deduplicated word list', () => {
    expect(manifest.count).toBeGreaterThan(10000);
    expect(new Set(manifest.words).size).toBe(manifest.count);
    expect(manifest.words.every(w => /^[a-z]+$/.test(w))).toBe(true);
    expect(index.has('the')).toBe(false); // stopword
    expect(index.has('www')).toBe(false); // blocklist
    expect(index.has('latte')).toBe(true); // seed word
  });

  it('is centered: random pairs are unrelated on average', () => {
    expect(Math.abs(manifest.calibration.p50)).toBeLessThan(0.05);
    expect(manifest.calibration.p95).toBeLessThan(0.25);
  });

  it('flags profanity instead of dropping it', () => {
    const flagged = manifest.profane.map(i => manifest.words[i]);
    expect(flagged).toContain('fuck');
    expect(flagged).toContain('dick'); // from data/vocab/profanity-extra.txt
  });

  it.each([
    ['man', 'king', 'woman', 'queen'],
    ['france', 'paris', 'japan', 'tokyo'],
    ['good', 'better', 'bad', 'worse'],
    ['dog', 'puppy', 'cat', 'kitten'],
    ['hot', 'cold', 'summer', 'winter'], // stem filter: not "summertime"
    ['big', 'bigger', 'small', 'smaller'], // morphological: stem filter must stay off
    ['man', 'father', 'woman', 'mother'],
  ])('%s : %s :: %s -> %s (top 3)', (a, b, c, expected) => {
    const result = solveAnalogy(index, a, b, c, undefined, 2)!;
    expect([result.answer, ...result.alternatives.map(n => n.word)]).toContain(expected);
  });

  it('places synonyms in the nearest neighbours', () => {
    const neighbors = index.nearest(index.getVector('doctor')!, { k: 5, exclude: new Set(['doctor']) });
    expect(neighbors.map(n => n.word)).toContain('physician');
  });
});

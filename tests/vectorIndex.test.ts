import { describe, it, expect } from 'vitest';
import { normalizeInPlace } from '../src/embeddings/vectorMath';
import { decodeVocabBinary, VocabManifest } from '../src/embeddings/vocabAsset';
import { buildIndex, quantizeRows } from './helpers/indexFixtures';

const unit = (v: number[]) => normalizeInPlace(Float32Array.from(v));

describe('VectorIndex', () => {
  const index = buildIndex({
    cat: [1, 0.1, 0],
    kitten: [0.9, 0.2, 0],
    dog: [0.6, 0.8, 0],
    car: [0, 0, 1],
  });

  it('dequantizes base vectors close to the originals', () => {
    const cat = index.getVector('cat')!;
    const expected = unit([1, 0.1, 0]);
    cat.forEach((v, d) => expect(v).toBeCloseTo(expected[d], 2));
  });

  it('ranks nearest neighbours by similarity, best first', () => {
    const result = index.nearest(index.getVector('cat')!, { k: 3, exclude: new Set(['cat']) });
    expect(result.map(n => n.word)).toEqual(['kitten', 'dog', 'car']);
    expect(result[0].similarity).toBeGreaterThan(result[1].similarity);
  });

  it('searches player words alongside the base vocabulary', () => {
    index.addWord('tabby', unit([1, 0.12, 0]));
    expect(index.has('tabby')).toBe(true);
    expect(index.isBaseWord('tabby')).toBe(false);
    expect(index.extraSize).toBe(1);
    const [best] = index.nearest(index.getVector('cat')!, { k: 1, exclude: new Set(['cat']) });
    expect(best.word).toBe('tabby');
  });

  it('exposes frequency rank for base words only', () => {
    expect(index.rankOf('cat')).toBe(0);
    expect(index.rankOf('tabby')).toBeUndefined();
  });

  it('rejects vectors with the wrong dimension', () => {
    expect(() => index.addWord('bad', new Float32Array(2))).toThrow();
  });
});

describe('decodeVocabBinary', () => {
  const rows = [[1, 0], [0, 1]];
  const { quantized, scales } = quantizeRows(rows);
  const manifest = {
    dim: 2, count: 2, words: ['x', 'y'],
    layout: { scalesOffset: 0, vectorsOffset: 8 },
  } as unknown as VocabManifest;

  it('reads scales then int8 rows from one buffer', () => {
    const buffer = new ArrayBuffer(8 + 4);
    new Float32Array(buffer, 0, 2).set(scales);
    new Int8Array(buffer, 8, 4).set(quantized);
    const asset = decodeVocabBinary(manifest, buffer);
    expect(Array.from(asset.quantized)).toEqual(Array.from(quantized));
    expect(asset.scales[1]).toBeCloseTo(scales[1], 6);
  });

  it('fails loudly when the binary does not match the manifest', () => {
    expect(() => decodeVocabBinary(manifest, new ArrayBuffer(10))).toThrow(/vocab:build/);
  });
});

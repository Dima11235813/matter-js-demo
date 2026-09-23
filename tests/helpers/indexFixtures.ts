import { VectorIndex } from '../../src/embeddings/VectorIndex';
import { normalizeInPlace } from '../../src/embeddings/vectorMath';

/** Quantizes plain vectors the same way scripts/build-vocab.mjs does (normalize, int8, per-row scale). */
export function quantizeRows(rows: number[][]): { quantized: Int8Array; scales: Float32Array } {
  const dim = rows[0].length;
  const quantized = new Int8Array(rows.length * dim);
  const scales = new Float32Array(rows.length);
  rows.forEach((row, i) => {
    const unit = normalizeInPlace(Float32Array.from(row));
    const maxAbs = Math.max(...Array.from(unit, Math.abs));
    const scale = maxAbs / 127 || 1;
    scales[i] = scale;
    unit.forEach((v, d) => { quantized[i * dim + d] = Math.round(v / scale); });
  });
  return { quantized, scales };
}

export function buildIndex(vectors: Record<string, number[]>): VectorIndex {
  const words = Object.keys(vectors);
  const { quantized, scales } = quantizeRows(words.map(w => vectors[w]));
  return new VectorIndex(vectors[words[0]].length, words, quantized, scales);
}

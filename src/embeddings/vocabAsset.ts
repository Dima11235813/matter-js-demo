import { Calibration } from "./calibration";

/** Shape of public/vocab/vocab.json, written by scripts/build-vocab.mjs. */
export interface VocabManifest {
    schema: 1;
    version: string;
    model: string;
    dtype: string;
    dim: number;
    count: number;
    builtAt: string;
    layout: { scalesOffset: number; vectorsOffset: number };
    calibration: Calibration;
    mean: number[];
    /** Indices into `words` flagged by the profanity list. */
    profane: number[];
    /** Ordered by descending usage frequency; index doubles as frequency rank. */
    words: string[];
}

export interface VocabAsset {
    manifest: VocabManifest;
    /** Per-row dequantization scale: value = quantized * scale. */
    scales: Float32Array;
    /** Row-major int8 vectors, already centered and L2-normalized before quantization. */
    quantized: Int8Array;
}

export function decodeVocabBinary(manifest: VocabManifest, buffer: ArrayBuffer): VocabAsset {
    const { count, dim, layout } = manifest;
    const expected = layout.vectorsOffset + count * dim;
    if (buffer.byteLength !== expected) {
        throw new Error(`vocab.bin size ${buffer.byteLength} does not match manifest (${expected}); rebuild with yarn vocab:build`);
    }
    return {
        manifest,
        scales: new Float32Array(buffer, layout.scalesOffset, count),
        quantized: new Int8Array(buffer, layout.vectorsOffset, count * dim),
    };
}

export async function fetchVocabAsset(baseUrl: string): Promise<VocabAsset> {
    const [manifestRes, binRes] = await Promise.all([
        fetch(`${baseUrl}vocab.json`),
        fetch(`${baseUrl}vocab.bin`),
    ]);
    if (!manifestRes.ok || !binRes.ok) {
        throw new Error(`Vocabulary asset missing at ${baseUrl}; run yarn vocab:build`);
    }
    const manifest = (await manifestRes.json()) as VocabManifest;
    return decodeVocabBinary(manifest, await binRes.arrayBuffer());
}

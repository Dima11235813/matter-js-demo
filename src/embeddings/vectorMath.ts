/**
 * Pure vector helpers for the embedding space. Vectors are Float32Array so they can be stored
 * in IndexedDB via structured clone and scanned without boxing overhead.
 */
export type Vector = Float32Array;

export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
    return sum;
}

/**
 * Cosine similarity in [-1, 1]. Returns 0 for mismatched or zero-length inputs so a missing
 * embedding degrades to "unrelated" instead of throwing inside the physics loop.
 */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function normalizeInPlace(v: Vector): Vector {
    const norm = Math.sqrt(dot(v, v));
    if (norm > 0) for (let i = 0; i < v.length; i++) v[i] /= norm;
    return v;
}

/**
 * Moves a raw model vector into the game's centered space: subtract the vocabulary mean,
 * then renormalize. Must match the transform applied by scripts/build-vocab.mjs.
 */
export function centerAndNormalize(raw: ArrayLike<number>, mean: ArrayLike<number>): Vector {
    const out = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw[i] - mean[i];
    return normalizeInPlace(out);
}

/** 3CosAdd target for "a is to b as c is to ?": b - a + c, normalized. */
export function analogyTarget(a: ArrayLike<number>, b: ArrayLike<number>, c: ArrayLike<number>): Vector {
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = b[i] - a[i] + c[i];
    return normalizeInPlace(out);
}

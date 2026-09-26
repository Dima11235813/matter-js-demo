/**
 * Player-word vectors travel as base64 of little-endian float32 (1,536 bytes for 384 dimensions). The
 * vector itself is synced, rather than re-embedded on the other device, because the quantized model's
 * output depends on how it runs (CLAUDE.md: q8 activations are quantized per batch).
 */
export function encodeVector(vector: Float32Array): string {
    const bytes = new Uint8Array(vector.length * 4);
    const view = new DataView(bytes.buffer);
    vector.forEach((v, i) => view.setFloat32(i * 4, v, true));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

export function decodeVector(base64: string): Float32Array {
    const binary = atob(base64);
    const view = new DataView(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) view.setUint8(i, binary.charCodeAt(i));
    const out = new Float32Array(binary.length / 4);
    for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, true);
    return out;
}

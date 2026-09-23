import { Vector, dot } from "./vectorMath";
import { VocabAsset } from "./vocabAsset";

export interface Neighbor {
    word: string;
    similarity: number;
}

export interface SearchOptions {
    k?: number;
    exclude?: ReadonlySet<string>;
    /** Returns false to hide a word (e.g. profanity policy). */
    allow?: (word: string) => boolean;
}

/**
 * Exact nearest-neighbour index over the centered embedding space.
 *
 * Two tiers share one search: the int8-quantized base vocabulary (scored as scale * q·query,
 * so it stays ~8 MB instead of ~30 MB as float32), and a growing float32 tier of words players
 * added. A brute-force scan of 20k x 384 takes a few milliseconds, so no ANN structure is needed
 * until the corpus grows past ~100k.
 */
export class VectorIndex {
    private readonly baseLookup = new Map<string, number>();
    private readonly extraWords: string[] = [];
    private readonly extraVectors: Vector[] = [];
    private readonly extraLookup = new Map<string, number>();

    constructor(
        readonly dim: number,
        private readonly baseWords: readonly string[],
        private readonly quantized: Int8Array,
        private readonly scales: Float32Array
    ) {
        baseWords.forEach((word, i) => this.baseLookup.set(word, i));
    }

    static fromAsset(asset: VocabAsset): VectorIndex {
        const { dim, words } = asset.manifest;
        return new VectorIndex(dim, words, asset.quantized, asset.scales);
    }

    get baseSize(): number {
        return this.baseWords.length;
    }

    get extraSize(): number {
        return this.extraWords.length;
    }

    has(word: string): boolean {
        return this.baseLookup.has(word) || this.extraLookup.has(word);
    }

    isBaseWord(word: string): boolean {
        return this.baseLookup.has(word);
    }

    /** Frequency rank in the base vocabulary (0 = most common), or undefined for added words. */
    rankOf(word: string): number | undefined {
        return this.baseLookup.get(word);
    }

    baseWordAt(rank: number): string {
        return this.baseWords[rank];
    }

    getVector(word: string): Vector | undefined {
        const extra = this.extraLookup.get(word);
        if (extra !== undefined) return this.extraVectors[extra];
        const row = this.baseLookup.get(word);
        if (row === undefined) return undefined;
        const out = new Float32Array(this.dim);
        const scale = this.scales[row];
        const offset = row * this.dim;
        for (let d = 0; d < this.dim; d++) out[d] = this.quantized[offset + d] * scale;
        return out;
    }

    /** Adds or replaces a player word. `vector` must already be centered and normalized. */
    addWord(word: string, vector: Vector): void {
        if (vector.length !== this.dim) throw new Error(`Expected ${this.dim}-dim vector for "${word}"`);
        const existing = this.extraLookup.get(word);
        if (existing !== undefined) {
            this.extraVectors[existing] = vector;
            return;
        }
        this.extraLookup.set(word, this.extraWords.length);
        this.extraWords.push(word);
        this.extraVectors.push(vector);
    }

    nearest(query: Vector, options: SearchOptions = {}): Neighbor[] {
        const { k = 10, exclude, allow } = options;
        const top = new TopK(k);
        const accept = (word: string) => !exclude?.has(word) && (!allow || allow(word));

        for (let row = 0; row < this.baseWords.length; row++) {
            const score = this.scoreBaseRow(row, query);
            if (top.wouldAccept(score) && accept(this.baseWords[row])) top.push(this.baseWords[row], score);
        }
        for (let i = 0; i < this.extraWords.length; i++) {
            const score = dot(this.extraVectors[i], query);
            if (top.wouldAccept(score) && accept(this.extraWords[i])) top.push(this.extraWords[i], score);
        }
        return top.sorted();
    }

    private scoreBaseRow(row: number, query: Vector): number {
        const offset = row * this.dim;
        let sum = 0;
        for (let d = 0; d < this.dim; d++) sum += this.quantized[offset + d] * query[d];
        return sum * this.scales[row];
    }
}

/** Fixed-size min-heap-by-insertion; k is small (<= 50) so a sorted array beats a real heap. */
class TopK {
    private readonly items: Neighbor[] = [];

    constructor(private readonly k: number) {}

    wouldAccept(score: number): boolean {
        return this.items.length < this.k || score > this.items[this.items.length - 1].similarity;
    }

    push(word: string, similarity: number): void {
        let i = this.items.length;
        while (i > 0 && this.items[i - 1].similarity < similarity) i--;
        this.items.splice(i, 0, { word, similarity });
        if (this.items.length > this.k) this.items.pop();
    }

    sorted(): Neighbor[] {
        return this.items.slice();
    }
}

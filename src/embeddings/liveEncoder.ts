import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import { logger } from "../utils/logger";

type DataType = "fp32" | "fp16" | "q8" | "int8" | "uint8" | "q4" | "bnb4" | "q4f16" | "auto";

/**
 * Lazily-loaded in-browser MiniLM encoder for words outside the base vocabulary. The model and
 * dtype come from the vocab manifest so live vectors land in the same space as the base vectors.
 * transformers.js is code-split and only fetched when a player adds an unknown word; the ONNX
 * weights (~23 MB for q8) download on first use and are cached by transformers.js.
 */
export class LiveEncoder {
    private extractor: Promise<FeatureExtractionPipeline> | undefined;

    constructor(private readonly model: string, private readonly dtype: string) {}

    /** Returns the raw (uncentered) L2-normalized mean-pooled vector. */
    async encode(word: string): Promise<Float32Array> {
        const extractor = await this.load();
        const output = await extractor(word, { pooling: "mean", normalize: true });
        return new Float32Array(output.data as Float32Array);
    }

    private load(): Promise<FeatureExtractionPipeline> {
        if (!this.extractor) {
            logger.log(`Loading live encoder ${this.model} (${this.dtype})`);
            this.extractor = import("@huggingface/transformers").then(({ pipeline }) =>
                pipeline("feature-extraction", this.model, { dtype: this.dtype as DataType }) as Promise<FeatureExtractionPipeline>);
            this.extractor.catch(() => { this.extractor = undefined; });
        }
        return this.extractor;
    }
}

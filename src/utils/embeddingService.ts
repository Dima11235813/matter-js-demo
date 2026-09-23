/**
 * Compatibility facade. The embedding playground now lives in:
 *   src/embeddings/                 pure vector math, index, analogy solver, calibration, profanity policy
 *   src/persistence/                IndexedDB schema and repository (local-first, sync-ready)
 *   src/services/semanticEngine.ts  application service used by the UI and physics world
 *
 * The base vocabulary is built offline by `yarn vocab:build` into public/vocab/.
 */
export { cosineSimilarity } from "../embeddings/vectorMath";
export { semanticEngine } from "../services/semanticEngine";

# Epic 1: Semantic Word Embeddings & Advanced Collision Engine

## 📋 Overview
Transition the engine from a literal sub-string combination solver to a semantic similarity engine. When words collide in the physics world, we will evaluate their embedding similarity (via cosine distance) to trigger smart mergers, gravitational pull, or elastic bounce.

---

## 🛠️ Features, Stories & Tasks

### Feature 1.1: Word Embedding Database & Client-Side Cache
* **Description**: Integrate a word vector dataset (like GloVe 50d or 100d) into the application and provide efficient local lookups.
* **User Stories**:
  * **Story 1.1.1**: *As a developer, I want to load a lightweight pre-computed vocabulary of embedding vectors in the browser, so that common words can be checked instantly without network lag.*
    * [x] **Task 1.1.1.1**: Research/extract a subset of ~10,000 common English words from GloVe 50d and compress it into a compact binary/JSON asset. — ✅ done differently (2026-09-22): 20,001 frequency-ranked words embedded with all-MiniLM-L6-v2 (q8), mean-centred, int8-quantized (7.8 MB), percentile-calibrated; `scripts/build-vocab.mjs` → `public/vocab/`.
    * [x] **Task 1.1.1.2**: Implement an client-side resource loader that parses the vector file into a memory-mapped array or lookup map when the app starts. — ✅ `src/embeddings/vocabAsset.ts` + `VectorIndex` (int8 rows scored in place, exact search).
  * **Story 1.1.2**: *As a player, I want out-of-vocabulary words to resolve via a backend API, so that my game doesn't break if I enter/merge unusual words.*
    * [x] **Task 1.1.2.1**: Write a client utility in `src/utils/embeddingClient.ts` to fetch vectors for missing words from the backend. — ✅ superseded: out-of-vocabulary words are embedded in the browser (`src/embeddings/liveEncoder.ts`, code-split transformers.js), same space as the build (≥ 0.999 cosine).
    * [x] **Task 1.1.2.2**: Implement an LRU cache for fetched word vectors to minimize API requests. — ✅ superseded: player words persist in IndexedDB and join the in-memory index; no remote fetch to cache.

### Feature 1.2: Cosine Similarity & Weighting Math
* **Description**: Implement mathematical operations to compare vectors and scale the interactions based on frequency weights.
* **User Stories**:
  * **Story 1.2.1**: *As a developer, I want to compute the cosine similarity between two vectors using strict TypeScript functions.*
    * [x] **Task 1.2.1.1**: Implement a helper function `calculateCosineSimilarity(vecA: number[], vecB: number[]): number` in `src/utils/vectorMath.ts`. — ✅ `src/embeddings/vectorMath.ts` (`cosineSimilarity`, `dot`, `centerAndNormalize`).
    * [x] **Task 1.2.1.2**: Add test cases for vector similarity verification. — ✅ `tests/embeddingService.test.ts`, `tests/vectorIndex.test.ts`, `tests/vocabQuality.test.ts`.
  * **Story 1.2.2**: *As a designer, I want to combine word frequencies with cosine similarity, so that rare word semantic connections feel heavier and yield higher impact.*
    * [ ] **Task 1.2.2.1**: Define a mathematical weighting formula: $Weight(A, B) = CosineSim(A, B) \times (1 + \log(Freq(A) \times Freq(B)))$.
    * [ ] **Task 1.2.2.2**: Create a service to return the composite collision weight for any two words.

### Feature 1.3: Matter.js Semantic Collision Logic
* **Description**: Modify collision resolution rules in Matter.js to evaluate semantic distance instead of string concatenation.
* **User Stories**:
  * **Story 1.3.1**: *As a player, I want words that are semantically close to merge on collision, and words that are unrelated to bounce off each other.*
    * [~] **Task 1.3.1.1**: Update `CollisionHandler.ts` to fetch embedding vectors for colliding bodies. — partial: related words that touch in hint mode bond into rigid molecules (Epic 5 · Feature 5.6) instead of merging into a new word; `CollisionHandler.ts` letter merging unchanged.
    * [ ] **Task 1.3.1.2**: If similarity $> T_{merge}$ (e.g., 0.75), trigger the semantic merge flow.
    * [ ] **Task 1.3.1.3**: If similarity is intermediate ($0.4 < Sim \le 0.75$), trigger a spring force or visual link without immediate merger.
    * [ ] **Task 1.3.1.4**: If similarity $\le 0.4$, let the bodies bounce standardly using Matter.js restitution.
  * **Story 1.3.2**: *As a player, I want related words to pull each other in dynamically using gravitational forces, so they naturally head towards collisions.*
    * [x] **Task 1.3.2.1**: Write a custom attraction-force loop in `CustomWorld.ts`'s update step. — ✅ done in `src/physics/orbitalForces.ts` + `SemanticPhysics.ts` (forces on Matter's `beforeUpdate`, not the p5 loop).
    * [x] **Task 1.3.2.2**: Apply gravitational/spring force to related bodies proportional to similarity and inverse square distance. — ✅ springs toward similarity-based target distances with calibrated p99 links and orbits (not inverse square: that collapses clusters); see Epic 5 · Feature 5.1.

### Feature 1.4: Dynamic Word Merger & Visual Morphing
* **Description**: Combine colliding related words into a single new word that represents their semantic hybrid.
* **User Stories**:
  * **Story 1.4.1**: *As a player, I want to see a new word representing the concept of two merged words (e.g., "fire" + "water" = "steam"), so that I feel like I'm discovering new language paths.*
    * [ ] **Task 1.4.1.1**: Implement a similarity search lookup that returns the closest single word to the average vector of the two colliding words: $\vec{V}_{new} = \frac{\vec{V}_{A} + \vec{V}_{B}}{2}$.
    * [ ] **Task 1.4.1.2**: Ensure the merged word is not identical to either of the parent words.
  * **Story 1.4.2**: *As a player, I want a smooth visual transition (particle burst, morphing boxes) when words merge, to celebrate the consolidation.*
    * [ ] **Task 1.4.2.1**: Implement a particle generator in p5 inside `SketchHandler.ts` triggered on successful merges.
    * [ ] **Task 1.4.2.2**: Animate the scale of the merging boxes down to 0 while spawning the new consolidated box with a scale-up pop animation.

---

## 📌 Status (2026-09-23)
* The semantic engine shipped in a different shape than planned: MiniLM sentence embeddings (not GloVe), a client-side vocabulary and live encoder (no backend), an analogy solver (3CosAdd with stem filtering) as the core interaction, and hint-mode forces where screen distance mirrors meaning. Details: Epic 5 and [docs/research/](../docs/research/README.md).
* Still open: frequency-weighted collision scores (Feature 1.2.2), semantic merge into a hybrid word (Feature 1.4, partly replaced by analogies and molecules), merge animations.

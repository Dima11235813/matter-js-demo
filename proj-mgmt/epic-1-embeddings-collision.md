# Epic 1: Semantic Word Embeddings & Advanced Collision Engine

## 📋 Overview
Transition the engine from a literal sub-string combination solver to a semantic similarity engine. When words collide in the physics world, we will evaluate their embedding similarity (via cosine distance) to trigger smart mergers, gravitational pull, or elastic bounce.

---

## 🛠️ Features, Stories & Tasks

### Feature 1.1: Word Embedding Database & Client-Side Cache
* **Description**: Integrate a word vector dataset (like GloVe 50d or 100d) into the application and provide efficient local lookups.
* **User Stories**:
  * **Story 1.1.1**: *As a developer, I want to load a lightweight pre-computed vocabulary of embedding vectors in the browser, so that common words can be checked instantly without network lag.*
    * [ ] **Task 1.1.1.1**: Research/extract a subset of ~10,000 common English words from GloVe 50d and compress it into a compact binary/JSON asset.
    * [ ] **Task 1.1.1.2**: Implement an client-side resource loader that parses the vector file into a memory-mapped array or lookup map when the app starts.
  * **Story 1.1.2**: *As a player, I want out-of-vocabulary words to resolve via a backend API, so that my game doesn't break if I enter/merge unusual words.*
    * [ ] **Task 1.1.2.1**: Write a client utility in `src/utils/embeddingClient.ts` to fetch vectors for missing words from the backend.
    * [ ] **Task 1.1.2.2**: Implement an LRU cache for fetched word vectors to minimize API requests.

### Feature 1.2: Cosine Similarity & Weighting Math
* **Description**: Implement mathematical operations to compare vectors and scale the interactions based on frequency weights.
* **User Stories**:
  * **Story 1.2.1**: *As a developer, I want to compute the cosine similarity between two vectors using strict TypeScript functions.*
    * [ ] **Task 1.2.1.1**: Implement a helper function `calculateCosineSimilarity(vecA: number[], vecB: number[]): number` in `src/utils/vectorMath.ts`.
    * [ ] **Task 1.2.1.2**: Add test cases for vector similarity verification.
  * **Story 1.2.2**: *As a designer, I want to combine word frequencies with cosine similarity, so that rare word semantic connections feel heavier and yield higher impact.*
    * [ ] **Task 1.2.2.1**: Define a mathematical weighting formula: $Weight(A, B) = CosineSim(A, B) \times (1 + \log(Freq(A) \times Freq(B)))$.
    * [ ] **Task 1.2.2.2**: Create a service to return the composite collision weight for any two words.

### Feature 1.3: Matter.js Semantic Collision Logic
* **Description**: Modify collision resolution rules in Matter.js to evaluate semantic distance instead of string concatenation.
* **User Stories**:
  * **Story 1.3.1**: *As a player, I want words that are semantically close to merge on collision, and words that are unrelated to bounce off each other.*
    * [ ] **Task 1.3.1.1**: Update `CollisionHandler.ts` to fetch embedding vectors for colliding bodies.
    * [ ] **Task 1.3.1.2**: If similarity $> T_{merge}$ (e.g., 0.75), trigger the semantic merge flow.
    * [ ] **Task 1.3.1.3**: If similarity is intermediate ($0.4 < Sim \le 0.75$), trigger a spring force or visual link without immediate merger.
    * [ ] **Task 1.3.1.4**: If similarity $\le 0.4$, let the bodies bounce standardly using Matter.js restitution.
  * **Story 1.3.2**: *As a player, I want related words to pull each other in dynamically using gravitational forces, so they naturally head towards collisions.*
    * [ ] **Task 1.3.2.1**: Write a custom attraction-force loop in `CustomWorld.ts`'s update step.
    * [ ] **Task 1.3.2.2**: Apply gravitational/spring force to related bodies proportional to similarity and inverse square distance.

### Feature 1.4: Dynamic Word Merger & Visual Morphing
* **Description**: Combine colliding related words into a single new word that represents their semantic hybrid.
* **User Stories**:
  * **Story 1.4.1**: *As a player, I want to see a new word representing the concept of two merged words (e.g., "fire" + "water" = "steam"), so that I feel like I'm discovering new language paths.*
    * [ ] **Task 1.4.1.1**: Implement a similarity search lookup that returns the closest single word to the average vector of the two colliding words: $\vec{V}_{new} = \frac{\vec{V}_{A} + \vec{V}_{B}}{2}$.
    * [ ] **Task 1.4.1.2**: Ensure the merged word is not identical to either of the parent words.
  * **Story 1.4.2**: *As a player, I want a smooth visual transition (particle burst, morphing boxes) when words merge, to celebrate the consolidation.*
    * [ ] **Task 1.4.2.1**: Implement a particle generator in p5 inside `SketchHandler.ts` triggered on successful merges.
    * [ ] **Task 1.4.2.2**: Animate the scale of the merging boxes down to 0 while spawning the new consolidated box with a scale-up pop animation.

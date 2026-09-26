# Research

Source-grounded investigations that drive plans in [`proj-mgmt/`](../proj-mgmt/). Each report states its question, method, measured findings, and recommendation; experiments are reproducible and kept out of the unit test suite.

| Report | Drives | Reproduce |
|---|---|---|
| [Cross-dimension continuity](cross-dimension-continuity.md): preserving the player's board between 2D and 3D with PCA, classical MDS, stress lift, and Procrustes alignment | Epic 5 · Feature 5.10 | `yarn research:cross-dim` |
| [Embedding shape](embedding-shape.md): why 3D layouts settled into a sphere; rank-based shapes (lines, rings), then the grouped model that separates clusters after player feedback | Epic 5 · Features 5.14–5.15 (MVP shipped) | `yarn research:cross-dim` |
| [Analogy scoring](analogy-scoring.md): whether "reward answers that connect to the third word, penalize ones that connect to the first or second" is fair and hard to game; the literal rule is inverted, and a guarded rule is proposed | Epic 2 · Feature 2.11 | `npx vitest run --config docs/research/experiments/vitest.research.config.ts analogyScoring` |

# Research

Source-grounded investigations that drive plans in [`proj-mgmt/`](../proj-mgmt/). Each report states its question, method, measured findings, and recommendation; experiments are reproducible and kept out of the unit test suite.

| Report | Drives | Reproduce |
|---|---|---|
| [Cross-dimension continuity](cross-dimension-continuity.md): preserving the player's board between 2D and 3D with PCA, classical MDS, stress lift, and Procrustes alignment | Epic 5 · Feature 5.10 | `yarn research:cross-dim` |
| [Embedding shape](embedding-shape.md): why 3D layouts settled into a sphere, and the rank-based model that lets embedding distances decide the shape (lines, rings, clusters) | Epic 5 · Feature 5.14 (MVP shipped) | `yarn research:cross-dim` |

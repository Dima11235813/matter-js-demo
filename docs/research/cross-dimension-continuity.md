# Cross-Dimension Continuity: Preserving the Player's Board Between 2D and 3D

**Status**: research complete, plan in [Epic 5 · Feature 5.10](../../proj-mgmt/epic-5-3d-semantic-space.md) · **Date**: 2026-09-23 · **Reproduce**: `yarn research:cross-dim` (writes [`experiments/results/cross-dimension.json`](experiments/results/cross-dimension.json))

## 1. Question

Switching the hint view between 2D and 3D currently tears down one world and builds another. Words, colours, and on-screen positions survive the hand-off, but the switch is a re-render, not a change of perspective. Can the player's manipulation (their arrangement, camera, selections, molecules) be preserved and *translated* across dimensions, and does principal component analysis (PCA) give a principled way to do it?

## 2. What a switch loses today

| State | 2D → 3D | 3D → 2D | Notes |
|---|---|---|---|
| Word set, colours | kept | kept | `deps.worldHandoff` |
| Screen position | kept (flat start, z = hash jitter ±20) | kept (camera projection, clamped) | depth starts meaningless |
| Depth information | invented | discarded | 3D → 2D keeps only the current view |
| Velocities / orbit phase | lost | lost | both worlds start at rest |
| Molecules | dissolved | not carried (re-form by contact) | Task 5.4.1.5 |
| Selection (analogy slots) | cleared | cleared | ids are world-specific |
| Camera / zoom | 3D auto-frames from a pixel-matched start | 2D has no zoom yet | Task 5.7.1 |
| Dragged/pinned words | 2D drag only; 3D has no drag | — | see Feature 5.12 |
| Canvas & render loop | destroyed and recreated | destroyed and recreated | the visible "re-render" |

## 3. Background

* **PCA** (Pearson 1901; Hotelling 1933) finds the orthogonal directions of greatest variance. The top-k principal components give the k-dimensional linear projection that preserves the most variance, and the best-fit plane of a 3D point cloud is spanned by its first two components (the normal is the third).
* **Classical MDS** (Torgerson 1952; Gower 1966) recovers coordinates from a distance matrix by eigen-decomposing the double-centred squared distances. For Euclidean distances between centred embeddings it is *the same computation* as PCA via the Gram matrix, which is how the experiments compute both. Applied to a *different* distance matrix, here the game's own target distances (link rest lengths and calibrated similarity targets), it yields "target-MDS": the linear layout closest to what the force model is trying to achieve.
* **Stress** (Kruskal 1964) measures how well layout distances match target distances; stress-based graph layout (Kamada & Kawai 1989; Gansner, Koren & North 2004, stress majorization) is the family the hint-mode forces already belong to.
* **Orthogonal Procrustes** (Schönemann 1966; Gower 1975) finds the rotation (+ uniform scale) that best aligns one configuration to another. PCA and MDS outputs are only defined up to rotation and sign, so Procrustes is what keeps a new layout *oriented like the old one*. Reflections are disallowed here: a mirrored board breaks the player's mental map.
* **Mental map preservation** (Misue, Eades, Lai & Sugiyama 1995): when a layout changes, users rely on stable relative positions; animated, minimal changes preserve comprehension better than jumps.

## 4. Metrics

* **Fidelity**: Spearman correlation between pair similarity and pair distance (`src/physics/layoutMetrics.ts`); −1 is a perfect map of meaning.
* **Preservation / resemblance**: `1 − Procrustes disparity` between a layout and the reference the player last saw (1 = same shape up to rotation, uniform scale, and translation).
* **Time** in physics steps at 60 Hz (30 = 0.5 s, 120 = 2 s, 600 = 10 s, 1500 = 25 s).

Boards: `families15` and `dense24` (hand-picked semantic families) and three random 30-word boards from the 3,000 most frequent words. Everything is deterministic.

## 5. Findings

### E1 · Linear projections alone (no physics)

| Board | Var. PC1–2 | Var. PC1–3 | PCA 2D | PCA 3D | target-MDS 2D | target-MDS 3D |
|---|---|---|---|---|---|---|
| families15 | 0.34 | 0.47 | −0.74 | −0.74 | −0.84 | **−0.89** |
| dense24 | 0.24 | 0.35 | −0.50 | −0.55 | −0.63 | **−0.75** |
| random30 (×3, mean) | 0.14 | 0.20 | −0.42 | −0.51 | −0.44 | **−0.52** |

* Word embeddings are genuinely high-dimensional: three principal components explain only 20–47% of a board's variance, so **no linear projection is lossless**, and the less related the board, the worse it gets.
* **target-MDS beats raw PCA** everywhere: projecting the game's distance model, not the raw embeddings, is the right linear baseline.
* **3D beats 2D** as a projection target, most on dense boards (−0.63 → −0.75), which independently confirms the Phase 1–2 simulation results.

### E2 · Seeding the 3D simulation

Mean fidelity over the five boards:

| Seed | t = 0 | 0.5 s | 2 s | 10 s | 25 s |
|---|---|---|---|---|---|
| random scatter (today, for fresh boards) | +0.02 | −0.04 | −0.30 | −0.52 | −0.62 |
| PCA 3D | −0.56 | −0.63 | −0.68 | −0.68 | −0.68 |
| target-MDS 3D | −0.64 | −0.66 | −0.68 | −0.68 | −0.68 |

* A PCA/MDS seed is **meaningful from the first frame** and settles in about 2 s; a random seed needs ~25 s and ends lower (it gets stuck in local minima).
* Per board, the forces *improve* MDS seeds on loosely related boards (random30: −0.54 → −0.60) but slightly *degrade* them on tight families (families15: −0.89 → −0.82): orbits and collisions trade a little fidelity for motion. That is the price of "alive" orbits and is acceptable.

### E3 · 2D → 3D: lifting a manipulated 2D board

A settled 2D board is manipulated (one cluster dragged 260 px right, 180 px down), then lifted into 3D with four depth strategies. Means over the five boards:

| Depth strategy | Fidelity t0 → 10 s | Preservation 0.5 s / 2 s / 10 s |
|---|---|---|
| hash jitter ±20 (today) | −0.45 → −0.58 | 0.98 / 0.95 / 0.81 |
| PCA component 3 as depth | −0.46 → −0.59 | 0.98 / 0.87 / 0.75 |
| **stress lift** (z solved for the target distances, x/y fixed) | −0.49 → −0.62 | 0.99 / 0.94 / 0.81 |
| **stress lift + decaying x/y anchor (3 s)** | −0.49 → −0.62 | **1.00 / 1.00 / 0.85** |

* Naively using PC3 as depth *hurts*: it disagrees with the player's arrangement, so the forces rearrange more.
* **Solving only for depth** (stress lift) gives the best fidelity without moving anything the player placed; a short, decaying anchor keeps the arrangement exact for the first 2 s while depth inflates, and still leaves more of it intact at 10 s (dense24: 0.75 vs 0.67 with jitter).

### E4 · 3D → 2D: flattening

A settled 3D board is flattened from two camera angles, then run for 10 s in 2D. Means over the five boards:

| Camera | Strategy | Fidelity at hand-off → 10 s | Resemblance to the view at hand-off → 10 s |
|---|---|---|---|
| orbit (35°, 20°) | camera projection (today) | −0.50 → −0.56 | **1.00** → 0.88 |
| | PCA best-fit plane, Procrustes-aligned | **−0.61** → −0.60 | 0.49 → 0.47 |
| | target-MDS 2D, Procrustes-aligned | −0.56 → −0.61 | 0.62 → 0.66 |
| edge-on (90°) | camera projection (today) | −0.41 → −0.53 | **1.00** → 0.86 |
| | PCA best-fit plane, aligned | **−0.61** → −0.61 | 0.36 → 0.30 |
| | target-MDS 2D, aligned | −0.56 → −0.61 | 0.15 → 0.22 |

* There is a real **tension between familiarity and fidelity**. The camera projection is exactly what the player saw but loses meaning when the view is oblique or edge-on (−0.41). The PCA plane keeps the most meaning (−0.61) but looks like a different board, even after the best rotation.
* **Key insight**: the PCA best-fit plane *is* the camera projection along the third principal axis. So the two can be reconciled with animation instead of a static choice: rotate the 3D camera to look along PC3 (the player watches the board turn), then flatten. The player keeps their mental map through visible motion, and the flattened board has PCA-plane fidelity.

## 6. Design options

| | A · Better hand-off (two engines) | B · Canonical state, two renderers | C · One renderer, animated morph |
|---|---|---|---|
| Idea | Keep Matter/p5 2D and three.js 3D; carry more state and use E2–E4 strategies at the switch | Hint mode always runs `SpaceSimulation`; 2D = z pinned to 0; p5 or three.js draws | three.js draws hint mode in both dimensions: orthographic 2D ↔ perspective 3D, z constraint ramps in/out |
| Visible re-render | yes (shorter, smarter) | renderer swap only | **none** |
| Velocities / orbit phase | lost | kept | kept |
| Selection, molecules, pins | carried by word key | shared state | shared state |
| Cost | low | medium (2D box collisions → sim) | medium-high (2D drawing moves to three.js) |
| Risk | two physics models diverge | 2D feel changes (spheres vs boxes) | largest change; letters/gravity mode stays on Matter |

Gravity mode (hints off) and the letters sandbox stay on Matter in every option: rigid stacking under gravity is a different regime, and a re-render when *hints* toggle is acceptable.

## 7. Recommendation

Do **A's quick wins first, then move to C**, because the measurements favour animation over static mappings:

1. **Word-keyed scene state**: selection, pins, molecules, and colours keyed by word, so any world can hydrate from it (selection survives the switch).
2. **Seed with target-MDS** for fresh 3D boards and deals (E2: meaningful at frame 1, settled in 2 s instead of 25 s), Procrustes-aligned to the previous layout when one exists.
3. **2D → 3D: stress lift + 3 s decaying anchor** (E3: best fidelity, arrangement exact for 2 s).
4. **3D → 2D: rotate to the PC3 view, then flatten** (E4: PCA-plane fidelity with a visible, continuous transition).
5. **Unify hint mode on `SpaceSimulation` + three.js** (orthographic ↔ perspective morph) so the switch keeps velocities and never re-renders.

## 8. Limitations

* 2D was approximated in the experiments by `SpaceSimulation` with z pinned (soft spheres), not Matter's rigid boxes.
* The manipulation is synthetic (one dragged cluster), and five boards is a small sample.
* Resemblance uses Procrustes with rotation and uniform scale, so pure zoom and rotation differences are not penalized; a stricter "no rotation" metric would penalize E4's aligned strategies more.
* The camera is modelled orthographically; perspective adds depth-dependent scaling that the real transition will show.

## 9. References

* Pearson, K. (1901). On lines and planes of closest fit to systems of points in space. *Philosophical Magazine* 2(11).
* Hotelling, H. (1933). Analysis of a complex of statistical variables into principal components. *Journal of Educational Psychology* 24.
* Torgerson, W. S. (1952). Multidimensional scaling: I. Theory and method. *Psychometrika* 17.
* Gower, J. C. (1966). Some distance properties of latent root and vector methods used in multivariate analysis. *Biometrika* 53.
* Kruskal, J. B. (1964). Multidimensional scaling by optimizing goodness of fit to a nonmetric hypothesis. *Psychometrika* 29.
* Schönemann, P. H. (1966). A generalized solution of the orthogonal Procrustes problem. *Psychometrika* 31.
* Gower, J. C. (1975). Generalized Procrustes analysis. *Psychometrika* 40.
* Kamada, T., & Kawai, S. (1989). An algorithm for drawing general undirected graphs. *Information Processing Letters* 31.
* Misue, K., Eades, P., Lai, W., & Sugiyama, K. (1995). Layout adjustment and the mental map. *Journal of Visual Languages & Computing* 6.
* Gansner, E. R., Koren, Y., & North, S. (2004). Graph drawing by stress majorization. *Graph Drawing (GD 2004)*, LNCS 3383.

# Epic 5: 3D Semantic Space (2D ↔ 3D Hint View)

## 📋 Overview
Hint mode already lays words out so that screen distance mirrors embedding similarity, with rarer words orbiting their more common "core" word. This epic adds a 3D view of the same space: a toggle, available only while hint mode is on, that lifts the orbital layout into three dimensions (three.js) so crowded boards keep their meaning and clusters orbit like atoms.

Work ships as small, testable milestones. Each phase ends with unit tests plus a measured layout-fidelity number from the running app.

### Why 3D, and why all-pairs targets first
Offline simulation over the real vocabulary (Spearman correlation between pair similarity and on-screen distance; closer to −1 is better):

| Layout | 15 words (5 families) | 24 words (denser) |
|---|---|---|
| Links + separation only, 2D (v1 hint mode) | −0.32 | −0.38 |
| Links + separation only, 3D | −0.40 | −0.39 |
| All-pairs target distances, 2D | −0.67 | −0.51 |
| All-pairs target distances, 3D | −0.80 | −0.73 |

3D alone barely helps; giving every pair a similarity-based target distance roughly doubles fidelity, and 3D then adds the most exactly when the board gets crowded.

### Decisions
* **Renderer**: three.js (raycast picking, OrbitControls, crisp camera-facing labels), lazy-loaded on first 3D toggle.
* **Gating**: 3D is only available with hint mode on; turning hints off returns to 2D.
* **Physics**: Matter.js stays for 2D. 3D uses a small custom integrator (hint mode needs soft collisions, not rigid bodies).

---

## 🛠️ Features, Stories & Tasks

### Feature 5.1: All-Pairs Semantic Layout (Phase 1)
* **Description**: Make the orbital layout dimension-agnostic and give every word pair a target distance derived from its similarity, so the 2D hint view gets more faithful now and the 3D view can reuse it.
* **User Stories**:
  * **Story 5.1.1**: *As a player, I want unrelated words placed further apart the less related they are, so the whole board reads as a map of meaning, not just separate clusters.*
    * [x] **Task 5.1.1.1**: Generalize `src/physics/orbitalForces.ts` to 2D/3D positions (orbit tangent: perpendicular in 2D, per-satellite orbit axis in 3D).
    * [x] **Task 5.1.1.2**: Add similarity-based target distances for unlinked pairs (calibrated p5 → far, p99 → separation).
    * [x] **Task 5.1.1.3**: Cache the pair-similarity matrix per word set instead of recomputing it every physics step.
    * [x] **Task 5.1.1.4**: Scale layout lengths to the viewport so small screens are not overcrowded.
  * **Story 5.1.2**: *As a developer, I want a layout-fidelity metric, so every tuning change is measured instead of eyeballed.*
    * [x] **Task 5.1.2.1**: Add `src/physics/layoutMetrics.ts` (Spearman between similarity and distance) with tests.
    * [x] **Task 5.1.2.2**: Expose `window.__lexical.layoutFidelity()` in dev for browser measurement and e2e.
  * **Exit criteria**: families set ≤ −0.6 in the running app (mean of 3 runs); 60 fps with 40 words; all unit tests green.
  * **Result (2026-09-23)** ✅ Families set −0.35 → **−0.62** (runs −0.57/−0.70/−0.58), dense 24-word set −0.37 → −0.42, 60 fps. With molecules enabled (Feature 5.6) the families set measures −0.61/−0.61 (dashboard docked) and −0.60 mean (−0.66/−0.63/−0.52). The dense set is where 2D runs out of room; that is the 3D view's job.
  * **Measurement note**: an occluded browser window throttles `requestAnimationFrame` to ~1 fps on Windows, which silently freezes the physics. The probe brings the window to the front and rejects runs below 50 fps.

### Feature 5.2: 3D Space Simulation (Phase 2)
* **Description**: A pure, renderer-agnostic 3D integrator for word bodies.
* **User Stories**:
  * **Story 5.2.1**: *As a player, I want related words to orbit their core word in tilted planes, so clusters look and feel like atoms.*
    * [ ] **Task 5.2.1.1**: `SpaceSimulation`: damped integration, soft collisions sized by label, spherical bounds.
    * [ ] **Task 5.2.1.2**: Deterministic per-word orbit axes; tests for stability and energy decay.

### Feature 5.3: three.js Renderer (Phase 3)
* **User Stories**:
  * **Story 5.3.1**: *As a player, I want to rotate and zoom the semantic space and click words in 3D, so I can explore and still play analogies.*
    * [ ] **Task 5.3.1.1**: Lazy-loaded scene: perspective camera, OrbitControls, depth fog.
    * [ ] **Task 5.3.1.2**: Camera-facing word labels; relation threads with strength-based opacity and similarity labels.
    * [ ] **Task 5.3.1.3**: Raycast selection feeding the existing analogy flow; selection highlight.

### Feature 5.4: World Abstraction & Toggle (Phase 4)
* **User Stories**:
  * **Story 5.4.1**: *As a player, I want to switch between 2D and 3D without losing my board, so the toggle feels like changing perspective, not restarting.*
    * [ ] **Task 5.4.1.1**: Extract a `WordWorld` interface (word texts, clear, spawn, select) implemented by the 2D and 3D worlds.
    * [ ] **Task 5.4.1.2**: `dimension` flag in `GameStore`, persisted in the profile; only offered with hints on.
    * [ ] **Task 5.4.1.3**: Continuity: 2D → 3D starts flat facing the camera, then inflates into depth; 3D → 2D projects onto the view plane.
    * [ ] **Task 5.4.1.4**: Timed game works unchanged in 3D.

### Feature 5.6: Word Molecules (shipped with Phase 1)
* **Description**: In hint mode, when two related words (a p99 link) are pulled into contact, they bond into a rigid "logic molecule". The word is the unit of build-up (whatever its token count); molecules are the first step toward phrases (Epic 2, Feature 2.5 sentence mode).
* [x] **Task 5.6.1**: Pure `MoleculeGraph` (`src/physics/molecules.ts`): bond/merge, anchor on the most common word, size cap (5), removal/re-anchoring, containment inside the world, overlap relaxation at bond time.
* [x] **Task 5.6.2**: Physics adapter: members skip forces between each other, share one mass-weighted acceleration and the strongest keep-out push, never collide with each other, and are re-snapped to their offsets each step. Hint off releases all molecules.
* [x] **Task 5.6.3**: Per-molecule halo hue so neighbouring molecules stay distinguishable.
* [ ] **Task 5.6.4**: Persist molecules with saved views (Feature 5.9); show a molecule's words as a phrase in the dashboard.
* **Known limitation**: two molecules can lock together interleaved (seen: king wedged between hospital and nurse). Rigid shapes can't slide past each other; this is the motivating case for Feature 5.8.

### Feature 5.7: Zoom & Camera (roadmap)
* **Description**: There is no way to make more room on a crowded canvas. In 2D this is a zoom/pan view transform (canvas ↔ world coordinates for input, keep-out, and spawning); in 3D it is camera manipulation (dolly, orbit, focus-on-word), so it lands naturally with the three.js camera work in Phase 3.
* [ ] **Task 5.7.1**: 2D view transform (wheel/pinch zoom, drag-pan in Move mode) with correct hit-testing and dashboard keep-out in world coordinates.
* [ ] **Task 5.7.2**: 3D camera controls: dolly/zoom limits, focus-on-word, reset view.

### Feature 5.8: Spin to Detangle (roadmap)
* **Description**: A mode that rotates the world (the gravity direction sweeps around) so large tangled webs and interlocked molecules shake apart. The goal is a stable result: steady orbits or a static mesh, which the player can then capture as a saved view (Feature 5.9).
* [ ] **Task 5.8.1**: Rotating gravity vector with configurable speed and duration; temporarily loosen molecule bonds so interlocked molecules can slide apart.
* [ ] **Task 5.8.2**: Stability detector (kinetic energy and orbit-period variance below a threshold) that ends the spin and prompts "save this view?".
* [ ] **Task 5.8.3**: Fidelity before/after spin reported via `layoutFidelity()`.

### Feature 5.9: Saved Views (roadmap)
* **Description**: Save the current arrangement as a named view the player can reopen later: a screenshot plus everything needed to restore it. IndexedDB first, same sync-ready records as the rest of the app; API integration and auth later.
* [ ] **Task 5.9.1**: `views` store (IndexedDB v3 migration): `{ id, name, createdAt, updatedAt, syncState, deviceId, thumbnail (PNG blob), words, positions, molecules, hintMode, dimension, camera, vocabVersion }`.
* [ ] **Task 5.9.2**: Save dialog (name + canvas thumbnail), views gallery, restore (respawn words at saved positions, rebuild molecules).
* [ ] **Task 5.9.3**: Server sync + auth (Epic 3): push pending views, pull by account, conflict rule last-writer-wins per view id.

### Feature 5.5: Verification & Polish (Phase 5)
* [ ] **Task 5.5.1**: 3D fidelity ≤ −0.7 on the families set; 60 fps with 40 words.
* [ ] **Task 5.5.2**: Mobile: orbit-drag vs tap-select disambiguation.
* [ ] **Task 5.5.3**: e2e coverage for both dimensions via the dev handle.
* [ ] **Task 5.5.4** (stretch): Visualize an analogy as parallel arrows a→b and c→d in 3D.

---

## 🎨 Shipped alongside Phase 1 (cross-cutting UX)
* [x] **Accessible text color**: `readableTextColor(background)` picks black or white by WCAG contrast; guaranteed ≥ 4.5:1 (worst case ~4.58:1), tested over 4,096 sampled backgrounds.
* [x] **Dark / light mode**: one palette source (`src/theme/palette.ts`) drives the p5 canvas, CSS variables, and the MUI theme; every text/surface pair is tested for WCAG AA; preference stored per device.
* [x] **Menu tooltips and accessible names** for every menu item; menu icons now visible in both themes (inactive icons were white-on-white).
* [x] **Movable, collapsible dashboard**: drag by the header, double-click to reset, collapse to a compact bar (with the clock in timed rounds); remembered per device. Its rectangle feeds the physics keep-out so words never hide under it, wherever it sits.
* [x] **Hover-only similarity numbers**: threads stay visible, numbers appear for the hovered word's links (labelling every link covered words on dense boards).


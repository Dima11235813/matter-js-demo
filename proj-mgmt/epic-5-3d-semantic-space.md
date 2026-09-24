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
    * [x] **Task 5.2.1.1**: `SpaceSimulation`: damped integration, soft collisions sized by label, spherical bounds.
    * [x] **Task 5.2.1.2**: Deterministic per-word orbit axes; tests for stability and energy decay.
    * [x] **Task 5.2.1.3**: Seed from a 2D layout (flat start, deterministic depth jitter) so the Phase 4 toggle is continuous.
  * **Exit criteria** (headless, real vocabulary): families set ≤ −0.70 and dense set ≤ −0.65 layout fidelity; kinetic energy decays without links and stays bounded with orbits (no NaN); deterministic; a flat start spreads into depth; one step with 40 words < 1 ms.
  * **Result (2026-09-23)** ✅ `src/physics/spaceSimulation.ts`, measured headless in `tests/spaceFidelity.test.ts` (mean of 3 flat starts, 1,500 steps): families **−0.79** (2D: −0.62), dense **−0.72** (2D: −0.42); depth spread ~190 units from a ±20 start; energy decays without links and stays bounded with orbits; deterministic; 40-word step < 1 ms.
  * **Deferred to Phase 4**: molecules in 3D (the `MoleculeGraph` bookkeeping is dimension-agnostic, but overlap relaxation and containment are 2D box-based).

### Feature 5.3: three.js Renderer (Phase 3)
* **User Stories**:
  * **Story 5.3.1**: *As a player, I want to rotate and zoom the semantic space and click words in 3D, so I can explore and still play analogies.*
    * [x] **Task 5.3.1.1**: Lazy-loaded scene: perspective camera, OrbitControls, depth fog.
    * [x] **Task 5.3.1.2**: Camera-facing word labels; relation threads with strength-based opacity and similarity labels.
    * [x] **Task 5.3.1.3**: Raycast selection feeding the existing analogy flow; selection highlight.
  * **Result (2026-09-23)** ✅ `src/space/` (`SpaceWorld`, `SpaceScene`, `labelTexture`, `handoff`). three.js ships only in the lazy `SpaceWorld` chunk (549 KB, loaded on first 3D toggle). 40 words at 61 fps. Auto-framing keeps every word in view below the docked dashboard until the player takes the camera; double-click resets. Click-vs-drag disambiguation (6 px slop) keeps orbiting and selecting apart.

### Feature 5.4: World Abstraction & Toggle (Phase 4)
* **User Stories**:
  * **Story 5.4.1**: *As a player, I want to switch between 2D and 3D without losing my board, so the toggle feels like changing perspective, not restarting.*
    * [x] **Task 5.4.1.1**: Extract a `WordWorld` interface (word texts, clear, spawn, select) implemented by the 2D and 3D worlds.
    * [x] **Task 5.4.1.2**: `dimension` flag in `GameStore`, persisted in the profile; only offered with hints on.
    * [x] **Task 5.4.1.3**: Continuity: 2D → 3D starts flat facing the camera, then inflates into depth; 3D → 2D projects onto the view plane.
    * [x] **Task 5.4.1.4**: Timed game works unchanged in 3D.
    * [ ] **Task 5.4.1.5**: Molecules in 3D (sphere-based overlap relaxation and containment); today molecules dissolve when entering 3D and re-form in 2D.
  * **Result (2026-09-23)** ✅ Switch in ~155 ms; words, colours, and positions carry over (median on-screen drift 50 px at 0.4 s); 3D fidelity −0.73 in the app vs −0.62 for the same 2D board. Round trips keep 20/20 words even when 8 were projected off-screen. A timed round survives both switches (same round, same hand, clock running) and scores analogies played in 3D. Hints off returns to 2D and hides the 3D toggle; hints on restores 3D. Also fixed: every 2D world leaked a running Matter runner on teardown (now `Runner.run`/`Runner.stop`).

### Feature 5.6: Word Molecules (shipped with Phase 1)
* **Description**: In hint mode, when two related words (a p99 link) are pulled into contact, they bond into a rigid "logic molecule". The word is the unit of build-up (whatever its token count); molecules are the first step toward phrases (Epic 2, Feature 2.5 sentence mode).
* [x] **Task 5.6.1**: Pure `MoleculeGraph` (`src/physics/molecules.ts`): bond/merge, anchor on the most common word, size cap (5), removal/re-anchoring, containment inside the world, overlap relaxation at bond time.
* [x] **Task 5.6.2**: Physics adapter: members skip forces between each other, share one mass-weighted acceleration and the strongest keep-out push, never collide with each other, and are re-snapped to their offsets each step. Hint off releases all molecules.
* [x] **Task 5.6.3**: Per-molecule halo hue so neighbouring molecules stay distinguishable.
* [ ] **Task 5.6.4**: Persist molecules with saved views (Feature 5.9); show a molecule's words as a phrase in the dashboard.
* **Known limitation**: two molecules can lock together interleaved (seen: king wedged between hospital and nurse). Rigid shapes can't slide past each other; this is the motivating case for Feature 5.8.

### Feature 5.7: Zoom & Camera (roadmap)
* **Description**: There is no way to make more room on a crowded canvas. In 2D this is a zoom/pan view transform (canvas ↔ world coordinates for input, keep-out, and spawning); in 3D it is camera manipulation (dolly, orbit, focus-on-word), so it lands naturally with the three.js camera work in Phase 3.
* **Input (decided 2026-09-23)**: the scroll wheel zooms in both 2D and 3D, toward the pointer; pinch does the same on touch.
* [ ] **Task 5.7.1**: 2D view transform: scroll-wheel/pinch zoom toward the pointer, drag-pan in Move mode, with correct hit-testing, dashboard keep-out, and spawning in world coordinates.
* [x] **Task 5.7.2**: 3D camera controls: scroll-wheel dolly toward the pointer with zoom limits ✅, reset view (double-click) ✅, focus-on-word ✅ (Feature 5.16).

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

### Feature 5.10: Cross-Dimension Continuity (roadmap · research complete)
* **Description**: Switching 2D ↔ 3D should feel like changing perspective on the *same* board, not a re-render. Driven by [docs/research/cross-dimension-continuity.md](../docs/research/cross-dimension-continuity.md) (PCA, classical MDS, stress lift, Procrustes; reproducible with `yarn research:cross-dim`).
* **Key findings**: seeding with target-MDS is meaningful from frame 1 and settles in ~2 s instead of ~25 s (fidelity −0.68 vs −0.62); for 2D → 3D, solving only for depth (stress lift) with a 3 s decaying anchor keeps the player's arrangement exact for 2 s (preservation 1.00) with the best fidelity; for 3D → 2D, the camera projection keeps familiarity but loses meaning edge-on (−0.41), while the PCA best-fit plane keeps meaning (−0.61) but looks different, so rotate to the PC3 view *visibly*, then flatten.
* **Stage A: better hand-off (current two-engine architecture)**
  * [ ] **Task 5.10.1**: Word-keyed scene state (selection, pins, molecules, colours) that both worlds hydrate from; selection survives the switch.
  * [ ] **Task 5.10.2**: Productionize `pca`/`classicalMds`/`procrustes2d` from `docs/research/experiments/linalg.ts` into `src/physics/` with unit tests.
  * [ ] **Task 5.10.3**: Seed fresh 3D boards and dealt hands with target-MDS positions, Procrustes-aligned to the previous layout when one exists.
  * [ ] **Task 5.10.4**: 2D → 3D: stress-lift depth + 3 s decaying x/y anchor (replaces hash jitter).
  * [ ] **Task 5.10.5**: 3D → 2D: animate the camera to look along the layout's third principal axis (≤ 800 ms), then hand off the flattened view.
  * **Exit criteria (Stage A)**: in the running app, preservation ≥ 0.95 at 2 s after a switch; fidelity at 10 s ≥ today's (2D → 3D ≥ −0.62, 3D → 2D ≥ −0.60); selection and molecule membership survive 10 consecutive round trips.
* **Stage B: no re-render (one renderer, one simulation for hint mode)**
  * [ ] **Task 5.10.6**: Hint mode runs on `SpaceSimulation` in both dimensions (2D = z constraint ramped in); box-aware collisions for 2D labels.
  * [ ] **Task 5.10.7**: three.js draws the 2D hint view with an orthographic camera; the switch morphs orthographic ↔ perspective while the z constraint ramps in or out.
  * [ ] **Task 5.10.8**: Port 2D-only hint features to the unified view: molecules and halos, dashboard keep-out, hover numbers, theme.
  * **Exit criteria (Stage B)**: zero-pop transitions (max per-word screen jump between consecutive frames ≤ 2 px during a switch); velocities and orbit phase carried; 60 fps with 40 words. Gravity mode and the letters sandbox stay on Matter (re-render on *hint* toggle is acceptable).

### Feature 5.11: Selection Metadata in the HUD (roadmap)
* **Description**: Selecting a word shows what the embedding space knows about it, so every click teaches something.
* [ ] **Task 5.11.1**: Inspector panel in the dashboard for the selected word(s): frequency rank, base vocabulary vs player-added (and when), nearest neighbours with similarity bars, molecule membership.
* [ ] **Task 5.11.2**: With 2–3 words selected: pairwise similarity and percentile ("more related than 97% of word pairs"), and the analogy offset b − a before the third pick.
* [ ] **Task 5.11.3**: Works identically in 2D and 3D (reads word-keyed state from Task 5.10.1); collapses with the dashboard.

### Feature 5.12: Live Drag with Physics (roadmap)
* **Description**: Dragging a word keeps the semantic physics running, so related words and molecules are tugged along through their links and unrelated words make way. You *feel* the relationships instead of only seeing them.
* [ ] **Task 5.12.1**: 2D: drag as a kinematic body (not static) so springs, orbits, and repulsion keep acting on neighbours; a dragged molecule moves as one unit.
* [ ] **Task 5.12.2**: 3D: drag in the camera-facing plane through the picked word (raycast), orbit controls suspended while dragging.
* [ ] **Task 5.12.3**: Visual tension: threads brighten and thicken with stretch while dragging; optional pin-on-drop that survives the dimension switch (Task 5.10.1).
* [ ] **Task 5.12.4**: Available in gravity mode too (2D and, with Stage B, 3D) so dragging against gravity shows which words cling together.

### Feature 5.13: Create (+) Mode in 3D (roadmap)
* **Description**: The + menu mode works in 3D: clicking empty space adds a word where you clicked.
* [ ] **Task 5.13.1**: Click on empty space (not a word, not an orbit drag) spawns a random word on the camera-facing plane through the orbit target at the click point.
* [ ] **Task 5.13.2**: Same rules as 2D: sandbox only (timed rounds keep their scarce, dealt supply); Move mode (hand) maps to Feature 5.12 dragging.

### Feature 5.14: Embedding-Shaped 3D Layout (MVP shipped · research complete)
* **Description**: The 3D configuration is decided by the board's own embedding distances, so the layout is itself a visualization: ordered words form lines, cycles form rings, families form clusters or sheets. Driven by [docs/research/embedding-shape.md](../docs/research/embedding-shape.md).
* **Key findings**: the sphere came from the forces, not the container. The calibrated model saturates (days of the week: fidelity −0.04, ring lost); raw embedding distance makes it worse, because in 384 dimensions unrelated words are all ~√2 apart. Board-relative **rank** targets fix both: best fidelity on 8 of 9 boards (families −0.79 → −0.88, days −0.04 → −0.94, numbers −0.86 → −0.98), distinct shapes (numbers anisotropy 0.07 = a line, days 0.00 = a flat ring), and the most stable when a word joins (0.98–1.00).
* **MVP (2026-09-23)**
  * [x] **Task 5.14.1**: `targetModel` in `orbitalForces` ("calibrated" | "metric" | "adaptive" | "rank") with stress-majorization forces; board targets cached per similarity matrix.
  * [x] **Task 5.14.2**: `layoutPresets`: 3D defaults to **Shape** (rank, container 1,400); **Orbits** keeps the Phase 2 model. Dashboard pill (3D only), live switch without moving bodies, remembered per device.
  * [x] **Task 5.14.3**: Nearest-neighbour skeleton threads (k = 2) in Shape mode, so chains and loops are readable.
  * [x] **Task 5.14.4**: Best-view camera: look along the least-variance principal axis (`src/physics/principalAxes.ts`); 0.86–0.99 of the layout's variance visible on screen.
  * [x] **Task 5.14.5**: Headless exit criteria in `tests/spaceFidelity.test.ts` (families ≤ −0.85, dense ≤ −0.80, days ≤ −0.90, numbers ≤ −0.95) and unit tests for every target model.
  * [x] **Task 5.14.5b (player feedback: "still a ball of stuff")**: Shape switched from rank to the **grouped** model: similarity clusters (average linkage at ~p97), rank-spaced within groups (170–480) and between groups (780–1,300), unweighted; threads kept inside groups. Group separation 0.45 → 0.63 (orbits 0.60) at fidelity −0.85; between-group distances 2.6–3.7× within-group in the app. See [embedding-shape.md §5](../docs/research/embedding-shape.md).
* **Next (roadmap)**
  * [ ] **Task 5.14.6**: 2D rank model: local formulation (k-nearest ranks or local stress) that does not collapse random boards (2D rank today: random30 −0.11 vs −0.46 calibrated).
  * [ ] **Task 5.14.7**: Curved-structure measures (principal curves) so antonym-bent gradients (temperature's horseshoe) are scored fairly; surface "this scale bends because the model treats hot and cold as related" in the HUD (Feature 5.11).
  * [ ] **Task 5.14.8**: Focus on a cluster: double-click a group to re-run the layout on just those words, revealing internal shape that mixed boards compress.
  * [ ] **Task 5.14.9**: Seed shape layouts with classical MDS (Feature 5.10 finding: meaningful at frame 1, settled in ~2 s) instead of random starts.
  * [ ] **Task 5.14.10**: Shape legend: name the detected structure ("line", "ring", "clusters") from anisotropy, radial spread, and skeleton topology, as a learning cue.

### Feature 5.15: Molecule Gravity & Accretion (roadmap · idea from play-testing)
* **Description**: Word molecules become gravity wells. A molecule's pull grows with its size; related words orbit it and may join when their relationship pulls them into contact, while words that do not belong are held off by repulsion and keep orbiting instead of bonding. Molecules repel other molecules, so the board settles into distinct systems that visualize the current cluster configuration rather than a sphere.
* **Design sketch**
  * A molecule is a body with mass = sum of member masses, positioned at its centre of mass; its pull on a word scales with that mass and with the word's strongest similarity to any member.
  * Stable orbits: attraction outside an orbit radius (a function of relatedness and molecule size), firm repulsion inside it for words below the bonding threshold, plus the existing tangential swirl, so unrelated-but-nearby words circle instead of colliding.
  * Accretion: a word linked (p99) to a member that touches the molecule bonds and joins (the 2D rule, Feature 5.6), up to the size cap.
  * Molecule–molecule repulsion scaled by both masses and by (1 − similarity between the molecules' mean vectors): unrelated systems push far apart, related ones sit as neighbours. This is the grouped model's between-group gap, driven by molecules the player built instead of computed clusters.
* [ ] **Task 5.15.1**: Molecules in 3D (Task 5.4.1.5 prerequisite): sphere-based overlap relaxation and containment for `MoleculeGraph`.
* [ ] **Task 5.15.2**: Mass-scaled attraction and orbit-radius repulsion in `orbitalForces` (pure, unit-tested), for 2D and 3D.
* [ ] **Task 5.15.3**: Molecule–molecule repulsion; measure with the cluster-separation experiment (molecules as ground-truth groups) against the grouped model.
* [ ] **Task 5.15.4**: Visuals: molecule halo size by mass, orbit trails for satellites, a flash on accretion.
* **Exit criteria**: satellites orbit a molecule for ≥ 10 s without bonding or escaping (unrelated words), related words accrete within 10 s of contact, and molecule systems keep silhouette ≥ 0.6 on the grouped boards.

### Feature 5.16: Focus & Board Analogies (shipped 2026-09-23)
* **Description**: A new word draws the eye, and every analogy on the board is one click from being seen again, in 2D and 3D.
* **User Stories**:
  * **Story 5.16.1**: *As a player, when a word joins the world, I want the view to show me where it landed.*
    * [x] **Task 5.16.1.1**: `WordWorld.focusWords(words)`; spawn requests carry `focus` (player-added words and analogy answers).
    * [x] **Task 5.16.1.2**: 3D: `CameraDirector` (extracted from `SpaceWorld`) flies to the focused words and tracks them for 2.8 s while they settle; fits all of them in view, never closer than the pixel-matched distance (a single word shows at its 2D size with its neighbours). Focused labels glow (thread-colour stroke) and pulse. Focus hands the camera to the player (no auto-framing afterwards; double-click resets).
    * [x] **Task 5.16.1.3**: 2D: focused boxes get a pulsing ring for 2.8 s (`Box.focusUntil`). 2D has no camera yet; panning to off-screen words waits for Task 5.7.1.
  * **Story 5.16.2**: *As a player, I want the analogy in the HUD to be links, so I can find its words on the board.*
    * [x] **Task 5.16.2.1**: HUD words a, b, c and the answer are focus links; ⌖ focuses the whole analogy.
    * [ ] **Task 5.16.2.2** (roadmap): the HUD keeps the last analogy across reloads and fresh boards, where its words may not be on the board and the links do nothing. Dim off-board links and offer "drop onto board" instead.
  * **Story 5.16.3**: *As a player, I want a list of the analogies I created on this board, each one a link that focuses it.*
    * [x] **Task 5.16.3.1**: `MenuStore.boardAnalogies` (newest first, capped at 50, pure rules in `src/game/boardAnalogies.ts` with tests); survives 2D ↔ 3D switches; cleared by a fresh board and by a new timed round.
    * [x] **Task 5.16.3.2**: Menu toggle (list icon, word views only) opens "Analogies on this board": each row focuses its analogy, each word chip focuses that word.
    * [ ] **Task 5.16.3.3**: Persist board analogies with saved views (Feature 5.9); a global "all my analogies" browser from IndexedDB (Epic 2).
* **Result (2026-09-23)** ✅ Verified in the running app (Playwright via `window.__lexical`). 3D: the orbit target ends within 1–29 units of the focused word(s) for the HUD link, a panel row, a panel chip, and a dropped word. 2D: a panel row pulses exactly {man, king, woman, queen}, the pulse expires after 2.8 s, the HUD link and dropped words pulse. The list survives the 3D → 2D switch. Found and fixed during verification: a 420-unit minimum made a single focused label ~2× its 2D size, and a new answer drifted after a 1.8 s fly (now tracked for the whole glow).

### Feature 5.17: Color Hint Mode (roadmap · idea 2026-09-24)
* **Description**: A toggle that replaces random word colours with a semantic colour strategy: similar concepts get similar colours, so colour becomes a second hint about relationships, on top of distance. It is aware of the board's structure: words in the same similarity group share a hue family, and the members of a molecule share one hue. Works in 2D and 3D.
* **Design sketch**
  * Hue from meaning: project the board's vectors to 2D (PCA or classical MDS, from Task 5.10.2) and map the angle around the centroid to hue in a perceptual space (OKLCH), so nearby meanings get nearby hues and unrelated groups land far apart on the wheel.
  * Structure-aware: groups (`similarityGroups`, the grouped layout's clusters) get distinct hue families spread around the wheel. Words within a group vary lightness and chroma by similarity to the group's core word. A molecule takes one hue, and its halo (Task 5.6.3) matches.
  * Stability: colours must not flicker when a word joins or leaves. Procrustes-align each new projection to the previous one, and ease hue changes over ~500 ms.
  * Accessibility: label text keeps `readableTextColor` (≥ 4.5:1). Keep lightness within ranges that read in both themes. Check that hue families stay distinguishable under common colour-vision deficiencies, and fall back to lightness steps where they do not.
  * One colour source for both worlds: a pure `semanticColors(words, vectors, groups, molecules, previous)` in `src/physics/` (or `src/theme/`), used by `CustomWorld` and `SpaceWorld`, so colours carry across the 2D ↔ 3D hand-off.
  * Toggle: a flag in `GameStore`, persisted in the profile, with a menu button and a tooltip. Available in 2D and 3D. Open question: also allowed in gravity mode, or only with hints on?
* [ ] **Task 5.17.1**: Research note in `docs/research/`: projection → hue mapping options (PCA angle vs MDS vs group-first palette), measured by Spearman between colour distance (OKLab ΔE) and cosine similarity, plus hue separation between groups.
* [ ] **Task 5.17.2**: Pure `semanticColors` with tests: determinism, group hue separation, molecule hue sharing, stability when one word is added, contrast guarantee.
* [ ] **Task 5.17.3**: Flag, menu toggle, and wiring into both worlds (spawn colours, recolouring on toggle, hand-off, molecule halos).
* [ ] **Task 5.17.4**: Screenshot comparison (random vs semantic colours) on the families board in 2D and 3D.
* **Exit criteria**: colour-distance vs similarity Spearman ≤ −0.5 on the families board; words in different groups differ by ≥ 60° of hue on boards with ≤ 6 groups; no colour change larger than ΔE 10 on existing words when a word is added; all label text ≥ 4.5:1.

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
* [x] **Profanity defaults (2026-09-23)**: production always filters; local dev shows the unfiltered space by default (`VITE_PROFANITY_FILTER=on` previews the player view). `data/vocab/profanity-extra.txt` supplements the base list with common terms it missed (e.g. "dick", which reached a dealt hand); ambiguous everyday words (kill, suicide, screw, butt, hoe, nazi) are deliberately not listed.

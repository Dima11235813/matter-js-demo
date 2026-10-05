# Epic 2: Gamified Language Discovery Experience

## 📋 Overview
Turn the physics prototype into an engaging, addictive educational game. Players will work to discover new words, trace conceptual relationships, hit target semantic categories, and clear cascading letter/word block threats.

---

## 🛠️ Features, Stories & Tasks

### Feature 2.1: Discovery Mode (Semantic Connection Goals)
* **Description**: A mode where players start with basic words and must combine them to reach a target word or concept.
* **User Stories**:
  * **Story 2.1.1**: *As a player, I want to see a target word (e.g., "Astronaut") and starting words (e.g., "sky", "person", "metal"), so that I have a clear puzzle objective.*
    * [ ] **Task 2.1.1.1**: Design a game level config schema specifying: `levelId`, `name`, `targetWord`, `startingWords`, and `allowedMoves`.
    * [ ] **Task 2.1.1.2**: Create a level selection screen and score tracking in `stores/GameStore.ts`.
  * **Story 2.1.2**: *As a player, I want a "proximity meter" indicating how close my closest word's embedding vector is to the target word, so that I can tell if I am making semantic progress.*
    * [ ] **Task 2.1.2.1**: Implement a UI component that tracks the cosine similarity of all active words against the target.
    * [ ] **Task 2.1.2.2**: Render the similarity distance as a warm/cold temperature bar or percentage meter.

### Feature 2.2: Survival Mode (Semantic Block Cascade)
* **Description**: A high-action mode where words fall from the sky and the player must merge similar concepts to clear them before they stack to the top.
* **User Stories**:
  * **Story 2.2.1**: *As a player, I want new words to drop at increasing speeds, so that my reflex and vocabulary speed are tested.*
    * [ ] **Task 2.2.1.1**: Implement a spawn scheduler that drops words from the top bounds of the Matter.js container.
    * [ ] **Task 2.2.1.2**: Add acceleration parameters that scale spawn rates and physics gravity over game time.
  * **Story 2.2.2**: *As a player, I want a "grid fill" failure condition to end the game when blocks stack past a red deadline, so there is a real challenge.*
    * [ ] **Task 2.2.2.1**: Define a failure boundary line near the top of the canvas.
    * [ ] **Task 2.2.2.2**: Trigger a game-over screen if any physics bodies stay above the deadline for more than 3 consecutive seconds.

### Feature 2.3: Gamified Scoring & Multipliers
* **Description**: Reward player creativity, rare word usage, and high-similarity combinations with points, visual banners, and combo multipliers.
* **User Stories**:
  * **Story 2.3.1**: *As a player, I want points awarded when I merge words, with higher points for words that were far apart but had high semantic correlation, so I feel rewarded for clever associations.*
    * [x] **Task 2.3.1.1**: Define the score formula based on embedding similarity, word lengths, and difficulty. — ✅ `analogyPoints` in `src/game/timedGame.ts`: similarity × 100 (min 10), +25 for a new question in the sandbox; repeats score 0 within a timed round.
    * [ ] **Task 2.3.1.2**: Track multipliers for quick consecutive mergers (combos).
  * **Story 2.3.2**: *As a player, I want to see a floating "+500" or "Perfect Match!" text pop up on screen where the merger occurred, to provide sensory satisfaction.*
    * [ ] **Task 2.3.2.1**: Write a custom rendering utility in `TypographyDisplay.ts` to manage transient text particle animations.
    * [ ] **Task 2.3.2.2**: Add sound effects or screen shake on massive combos.

### Feature 2.4: Interactive Concept Tree & History Graph
* **Description**: Render an end-game overview visualizer showing how the player navigated the embedding space.
* **User Stories**:
  * **Story 2.4.1**: *As a player, I want to see a history of all word mergers I made during the session, so I can review my conceptual path.*
    * [x] **Task 2.4.1.1**: Keep a transaction log in `stores/GameStore.ts` tracking: `{ parentA, parentB, result, similarity, score }`. — ✅ done as a persisted, sync-ready analogy collection (IndexedDB `analogies` store keyed by question, with answer, alternatives, similarity, times played) plus timed-round results (`games` store).
  * **Story 2.4.2**: *As a player, I want an interactive node graph at the game-over screen showing the branching tree of my word consolidations, so I can save/share my creation path.*
    * [ ] **Task 2.4.2.1**: Create a Canvas or SVG-based force-directed graph component representing the merge tree.
    * [ ] **Task 2.4.2.2**: Enable tooltips showing the similarity scores and vector distances on each edge of the graph.

### Feature 2.5: Lexical Fountain Sandbox Modes (Linguistic Scale Progression)
* **Description**: Establish modular sandbox rules determining the scale at which physical objects interact and merge (from single characters to full text blocks).
* **User Stories**:
  * **Story 2.5.1**: *As a player, I want to toggle between "Word Mode", "Sentence Mode", and "Paragraph Mode", so that I can control the linguistic scope of my sandbox interactions.*
    * [ ] **Task 2.5.1.1**: Add a mode selector dropdown/toggle to the side menu representing: `Word`, `Sentence`, `Paragraph` modes.
    * [ ] **Task 2.5.1.2**: Update the physics collision handler to execute different merge checks based on the active sandbox scale.
  * **Story 2.5.2**: *As a player in Sentence Mode, I want words to attract each other based on parts-of-speech (nouns attract verbs/adjectives) and cosine vector proximity to fuse into clauses, so I can watch sentences physically construct themselves.*
    * [ ] **Task 2.5.2.1**: Implement a parts-of-speech tagging utility on word merger outcomes.
    * [ ] **Task 2.5.2.2**: Calculate attraction forces between bodies based on syntactic compatibility and cosine vector distance.
  * **Story 2.5.3**: *As a player in Paragraph Mode, I want sentences to cluster, merging physically into paragraphs that trace a thematic arc, so I can construct a structured narrative flow in the canvas.*
    * [ ] **Task 2.5.3.1**: Add support for multi-line paragraph block physics bodies that grow in size dynamically.
    * [ ] **Task 2.5.3.2**: Hook paragraph fusion outcomes into context-similarity checks (e.g. combining sentence themes).

### Feature 2.6: Sandbox, Timed Game & Hint Mode (shipped 2026-09-22)
* **Description**: The two play modes the game actually has today, plus the shared hint flag.
  * [x] **Task 2.6.1**: **Sandbox** (the `fountain` view): free play, no timer, add any word, play analogies (select three words → answer spawns with ranked runner-ups).
  * [x] **Task 2.6.2**: **Timed game**: 2-minute rounds, 10 dealt words in related pairs, +2 words per 150 points up to 30 (scarce by design), best score saved; pure rules in `src/game/timedGame.ts`, dealer in `src/game/dealer.ts`.
  * [x] **Task 2.6.3**: **Hint mode**: low gravity and semantic orbits in both modes; per-device preference; enables the 3D view (Epic 5).
  * [ ] **Task 2.6.4** (roadmap): Discovery-style targets (Feature 2.1) on top of the timed game; combo multipliers (Task 2.3.1.2).
* **Relation to Feature 2.5**: word molecules (Epic 5 · Features 5.6, 5.15) are the first step of the word → phrase build-up that Sentence Mode describes.


### Feature 2.7: Voice Input (roadmap · idea 2026-09-24)
* **Description**: A microphone toggle in the menu. While it is on, speech is transcribed to text and the spoken words appear on the board as word blocks, in 2D or 3D, exactly as if typed into "Add a word" (they take focus, Feature 5.16). Speaking becomes a way to explore the space hands-free: say "ocean, river, desert" and watch where they land.
* **Design sketch**
  * **Speech-to-text engine**, with two options behind one `SpeechSource` interface:
    * **Web Speech API** (`SpeechRecognition`): zero download and streaming partial results. Chrome and Edge send audio to a cloud service, Safari support is partial, and Firefox has none. Fine as a quick first version, but it breaks the local-first promise.
    * **Local Whisper** (transformers.js, e.g. `whisper-tiny.en` / `whisper-base.en`, WebGPU with a WASM fallback): runs on-device and offline, and matches how MiniLM already runs in the browser. Costs a ~40–150 MB one-time model download and higher latency. Voice activity detection chunks the audio into utterances.
    * Recommendation to research: Web Speech for the MVP where available, local Whisper as the privacy/offline path, chosen automatically or in settings.
  * **Transcript → words**: lowercase, split into tokens, drop stopwords and filler ("um", "the"), apply the profanity policy (same as typed words), and de-duplicate against the board. Known vocabulary words spawn directly; unknown words go through the live encoder like typed player words. Only final results spawn: partial results show as a live caption in the dashboard.
  * **Rate limit**: cap spawns per utterance (e.g. 5) so a long sentence does not flood the board.
  * **Modes**: sandbox spawns freely. A timed round keeps its scarce, dealt supply, so voice there *selects* words already on the board (saying a dealt word selects it; three selections play the analogy), with no free spawning.
  * **Stretch: voice commands**: "king minus man plus woman" or "man is to king as woman is to …" plays the analogy directly; "focus queen" focuses a word.
  * **Toggle and permissions**: a mic button in the menu with tooltip and accessible name; `getUserMedia` permission prompt on first use; a clear recording indicator while listening. Turning it off stops the stream and releases the microphone. Off by default and never auto-started; the preference is stored per device, but it never auto-starts after a reload.
  * **Privacy**: say in the tooltip or settings whether audio leaves the device (cloud Web Speech) or not (local Whisper). No audio is stored.
* [ ] **Task 2.7.1**: Research note in `docs/research/`: Web Speech vs local Whisper. Measure word accuracy on a spoken word-list script, latency to spawn, download size, and browser coverage.
* [ ] **Task 2.7.2**: Pure `transcriptToWords(text, { stopwords, profanity, onBoard, max })` with unit tests.
* [ ] **Task 2.7.3**: `SpeechSource` implementations, the mic toggle in `MainMenu`, a listening indicator, and a live caption in the dashboard; spawns via the existing player-word path (`submitPlayerWord`), so 2D and 3D both work.
* [ ] **Task 2.7.4**: Timed-game rule: voice selects dealt words instead of spawning.
* [ ] **Task 2.7.5** (stretch): voice commands for analogies and focus.
* **Exit criteria**: spoken single words from the vocabulary appear on the board within 1.5 s (Web Speech) or 3 s (local) with ≥ 90% word accuracy on the test script; the microphone is released when the toggle is off (browser indicator gone); profanity policy applies identically to voice and typing; works in 2D and 3D.

### Feature 2.8: Text & Website Import (paste MVP shipped 2026-09-24 · website import roadmap)
* **Description**: Today a player can only type one word at a time. The input will also accept a pasted block of text (a paragraph, an article, lyrics), and its most meaningful words land on the board, so a whole text becomes a map of its ideas. Importing a website by URL comes later, through the backend (Epic 3 · Story 3.2.3).
* **Design sketch**
  * **One input, three behaviours**: a single word keeps today's path (`submitPlayerWord`: embed, add to the corpus, spawn with focus); an expression with `+`/`−` plays an analogy (Feature 2.9); multi-line or long input switches to import (the field grows into a text area and the button reads "Import").
  * **Choosing words** (a pure function shared with voice input, Task 2.7.2): lowercase, split into tokens, drop stopwords, numbers, and words the profanity policy blocks. Then score keywords by in-text frequency × rarity (vocabulary rank as an IDF proxy), so "photosynthesis" beats "people". Merge inflections with the existing stem rules (`sharesStem`) and take the top N (default 12, adjustable, capped by board size).
  * **Preview before spawning**: the chosen words appear as removable chips with a count ("12 of 340 distinct words"). The player confirms, removes words, or asks for more. Words outside the vocabulary are marked "new" and go through the live encoder; they join the player corpus only when confirmed.
  * **Spawning**: stagger spawns through the existing spawn queue (4 per frame) so words land one after another, then focus the whole imported set (Feature 5.16), in 2D or 3D.
  * **Modes**: sandbox only; a timed round keeps its dealt supply.
  * **Provenance**: record each import (source "paste" or URL, title, time, chosen words) in IndexedDB, sync-ready like other records, so a board can say where its words came from. This later feeds saved views (Epic 5 · Feature 5.9).
  * **Website import (needs the backend)**: paste a URL → `POST /api/import/url` (Epic 3 · Story 3.2.3) returns readable text → the same preview and spawn path. Until the backend exists, the URL option is hidden or says it needs the server.
* [x] **Task 2.8.1**: Pure `extractKeywords` (`src/game/keywords.ts`) with unit tests: tokenizing, stopwords, possessives and contractions, plural folding (including leaves → leaf), unknown words kept only when repeated, ranking by count × log(rank), profanity. Stopwords moved to `data/vocab/stopwords.txt`, shared with `scripts/build-vocab.mjs` (same 162 words). Inflections are merged by plural folding only: `sharesStem` merges unrelated words (car/care), so it is not used here.
* [x] **Task 2.8.2** (MVP): `WordEntryForm` (textarea: Enter submits, Shift+Enter adds a new line, Esc clears) shows keyword chips (click to remove, "+ more" adds 6, "clear"); "Drop N" runs `importKeywords`, which embeds new words (✦) into the player corpus and spawns the set in order, with the last request carrying `focusGroup`, so the whole set is focused together in 2D and 3D.
* [ ] **Task 2.8.3**: Import provenance store (IndexedDB migration) and a "from: <source>" note on the board.
* [ ] **Task 2.8.4**: URL import client, once Story 3.2.3 ships.
* **Result (2026-09-24)** ✅ Built vocabulary: ≥ 8 of 12 on-topic keywords on the science, sports, and cooking samples (`tests/keywords.test.ts`); keyword preview for a 500-word text in 0.2 ms in the app. Browser: 18 of 18 chosen science keywords landed in 3D ("photosynthesis" was new and joined the corpus), and the camera centred 35 units from the set; in 2D, all 12 sports keywords pulsed together. Single-word entry unchanged. Only the paste path works for now; no URL import (Story 3.2.3).
* **Exit criteria (MVP)**: pasting a ~500-word article shows a preview in < 300 ms, with ≥ 8 of 12 keywords judged on-topic on three sample texts (science, sports, cooking); confirming spawns them in 2D and 3D with focus; single-word entry works exactly as before; the profanity policy applies to pasted text.

### Feature 2.9: Analogy Expressions with + and − (shipped 2026-09-24)
* **Description**: Type the arithmetic directly: `king - man + woman` plays the analogy "man is to king as woman is to ?" and the answer lands on the board. The operators make the embedding math visible, which is the point of the game. Today an analogy needs three clicks in the right order.
* **Design sketch**
  * **Grammar**: `term (('+' | '-') term)*`, where a term is a word; `−`, `–`, and `-` all count as minus. A minus needs spaces around it, so hyphenated words ("well-known") stay single terms. `a : b :: c : ?` and "a is to b as c is to" are accepted as the same analogy.
  * **Three-term form** `b - a + c` maps to the existing solver (`solveAnalogy`, 3CosAdd with the stem filter): same answer, runner-ups, points, analogy collection, and board-analogies list (Feature 5.16) as a click-played analogy.
  * **General form** (any number of terms, e.g. `paris - france + italy`, `ocean + desert`): sum the signed unit vectors, return the nearest words excluding the inputs and their inflections, labelled "nearest to the sum". Scored only when it is a valid three-term analogy.
  * **Live preview**: while typing, show the parsed expression as chips (operands coloured + and −) and the current top answer with its similarity, before pressing Enter.
  * **Spawning**: operands not yet on the board spawn too; the answer spawns with focus, and the whole expression is focused (Feature 5.16) in 2D or 3D. Unknown operands go through the live encoder, like typed player words.
  * **Timed game**: operands must be dealt words on the board (typing replaces clicking); no free spawning of operands.
  * **Visual (ties to Task 5.5.4)**: draw the offset as arrows (a → b copied onto c → answer) in 3D, and as a dashed parallelogram in 2D.
  * **Voice**: voice commands (Task 2.7.5) reuse the same parser: "king minus man plus woman".
* [x] **Task 2.9.1**: Pure parser `parseEntry(input)` in `src/game/wordEntry.ts` (was planned as `parseExpression`) → terms with signs, or a single word, or an error with position; unit tests (unicode minus, hyphenated words, `a : b :: c`, empty terms, trailing operators).
* [x] **Task 2.9.2**: `semanticEngine.evaluateExpression(terms)` (no recording, for preview and submit): three-term analogies use `solveAnalogy`, and `playExpression` then calls `playAnalogy` (same points, collection, and board list); general sums use `solveExpression` (`src/embeddings/analogy.ts`) with stem exclusion; words new to the corpus are embedded on Play.
* [~] **Task 2.9.3**: Dashboard input: expression detection, live preview (terms as chips, answer, and the analogy it spells), Enter plays, tooltip with examples ✅. The timed-game operand rule is in `playExpression`, but the word box is still hidden in timed rounds ⬜ (show a typing-only box there).
* [ ] **Task 2.9.4**: Offset arrows in 2D and 3D (with Task 5.5.4).
* **Result (2026-09-24)** ✅ Browser, 3D: `king - man + woman` previews "= queen 0.47" and plays man : king :: woman → queen (the same as clicking): all four words land, one board-list entry is added, and the camera centres 8 units from the four. `ocean + desert` ≈ beach 0.67 (then sea, gulf, aquatic). 2D: `paris - france + italy` = florence (+90), and all four pulse. Preview in ~6 ms. `tests/wordEntry.test.ts`, `tests/expression.test.ts` (a three-term sum matches the analogy solver on the built vocabulary).
* **Exit criteria**: `king - man + woman` returns the same answer, points, and list entry as clicking man → king → woman; preview updates within 100 ms of typing; hyphenated words are never split; works in 2D and 3D.

### Feature 2.10: Connect-All Puzzles (roadmap · idea 2026-09-24)
* **Description**: A puzzle version of the 3D board. The board starts with loose words, and the HUD shows how many words are well connected: "14 of 20 connected (70%)". A word counts as connected when it has **at least two** connections; words with one connection (dangling) or none (free-floating) are highlighted. Add words (typed, `+`/`−` expressions, imports) until every word has two or more connections. At 100%, you win. Added words are nodes too, so each one must also end with two connections: a bridge word has to belong on both sides.
* **Why**: the goal is to iterate on the rules until the puzzle is balanced, meaning no single strategy dominates. In game-theory terms that is a stable, Nash-equilibrium-like design where the player's best move depends on the board. From that stable rule set, permutations of the board generate many distinct puzzles that are fun, not only solvable.
* **Design sketch**
  * **Connection**: a pair of board words with similarity ≥ the link threshold (the calibrated p99 links the hint layout already draws). Degree = number of connections. Metric = share of words with degree ≥ 2. Works in 2D; designed for 3D, where the web of connections is easiest to read.
  * **Moves and scoring**: each added word is a move. **Par** = the fewest words the solver needs; score by moves vs par (golf-style), with an optional timer. Removing a word is allowed and costs a move.
  * **Dominant strategy to design out**: generic hub words ("thing", "person", "stuff") that link to everything. Levers to balance it:
    * a stricter link threshold for common words (threshold by frequency rank);
    * a cap on how many connections one added word can create;
    * a word budget;
    * banning the most frequent N words as moves.
  * **Solver** (also the par and the hint system): greedy set cover over the vocabulary. Candidate words are scored by how many under-connected words they would lift to degree 2, while ending at degree ≥ 2 themselves. Beam search on top of it tightens par.
  * **Balance harness** (the "equilibrium" test): simulate bot strategies on many puzzles: greedy-hub bot, nearest-neighbour bot, random bot, and the solver. The rules are balanced when no bot dominates across puzzles, and the solver's par spreads into distinct difficulty bands. Results go into a `docs/research/` report that is updated at each rule iteration.
  * **Puzzle generation by permutation**: start from a solved template (clusters plus bridges), then permute it. Swap each seed word for a neighbour in the same similarity band, so the connection graph keeps its shape but the words change. Keep variants whose par and difficulty band match the template. Seeds are deterministic, so puzzles are shareable ("puzzle #1042") and a daily puzzle is possible.
  * **Visuals**: highlight dangling and free-floating words (pulse or ring, with Color hint mode 5.17 optional). Brighten a word's connections as it reaches degree 2. Play a completion burst at 100%.
* [ ] **Task 2.10.1**: Pure `connectionStats(words, similarity, threshold)` → degree per word, dangling/free lists, ratio; unit tests.
* [ ] **Task 2.10.2**: Solver (greedy + beam) and par; hub-word levers as rule parameters; tests on fixture boards.
* [ ] **Task 2.10.3**: Balance harness: bots × rule sets × generated puzzles → a research report (`docs/research/connect-all-balance.md`) with the chosen rule set.
* [ ] **Task 2.10.4**: Generator: templates, permutation by similarity band, deterministic seeds, par/difficulty filter.
* [ ] **Task 2.10.5**: Puzzle mode UI: HUD ratio, loose-word highlighting (2D and 3D), move counter vs par, win state, next puzzle; results persisted like timed games.
* **Exit criteria**: every generated puzzle is solvable within par by the solver; in the harness no strategy beats the others by more than 20% on moves-over-par across 200 puzzles; three difficulty bands with ≥ 50 puzzles each; play-test: the user finds a puzzle fun, not just solvable.

### Feature 2.11: Relation Scoring for the Timed Game (designed questions shipped 2026-09-25)
* **Description**: In the scoring version of the game, an analogy earns points only when the answer really completes it, meaning it **connects to the third word**, and loses points when the answer falls back onto the first or second word. Driven by [docs/research/analogy-scoring.md](../docs/research/analogy-scoring.md).
* **Key findings (gamed out with simulated plays)**:
  * The rule as first stated is inverted: it penalizes 77% of known-good analogies (a correct answer is naturally close to *b*: queen–king 0.53 vs queen–woman 0.22), and rewards 95% of a synonym-pair exploit and 97% of ordinary dealt-board plays, most of which transfer nothing (the answer is just *c*'s nearest word).
  * Today's similarity-based points barely separate real analogies (59) from random words (42).
  * A guarded rule keeps the core idea and cannot be gamed by either exploit: 70% of real analogies rewarded, ≤ 1% of exploit plays.
* **Proposed rule**
  * **Reward**: *a, b* related (≥ p99) **and** *d* connects to *c* (≥ p95) **and** the relation carries over (cos(b − a, d − c) ≥ 0.25). Points scale with the offset cosine.
  * **Penalty** (small, explained): *d* connects to *a* or *b* but not to *c*: "the answer fell back onto your first pair".
  * **Otherwise**: no points, with a hint.
  * The sandbox shows the verdict as a learning hint, without scoring.
* **Dealing must change**: dealt boards hold almost no analogies (0% of typical plays qualify), so the timed game should deal **analogy quads**: two pairs sharing a relation, mined offline (both pairs linked, offset cosine ≥ 0.35).
* [x] **Task 2.11.1** (as a learning hint, per §5): pure `relationHint` (`src/game/relationHint.ts`): carried / collapsed / unclear. "Carried" = a, b related above calibrated p90, the answer connects to *c* (≥ p95), offset ≥ 0.20. The p90 relatedness replaces p99 because man–king is only 0.10 in this model, which would have hidden the textbook analogies; it scores better too (held-out 54% vs 51%, known-good 77% vs 70%, synonym exploit 4%, random 1%). Shown after every analogy in both modes; changes no points.
* [x] **Task 2.11.2**: Held-out validation (2026-09-25): 492 Google-set analogies in the vocabulary. **Gate failed**: 42% rewarded (51% at offset ≥ 0.20), below the 60% gate, while exploits stay ≤ 4%. MiniLM's relation offsets are weak (42% of real analogies answer with *c*'s nearest word, like the synonym exploit), so no threshold separates cheap-but-true plays from insightful ones. See [analogy-scoring.md §5](../docs/research/analogy-scoring.md).
* [x] **Task 2.11.2b** (decided 2026-09-25, simulated): designed questions. With the game solver and top-3 leniency, skilled play earns 68.9 points per play, half-informed strategies about 0.2 of that, random ≈ 0, and every board has ≥ 2 completable plays. Partial rewards removed (they made guessing pay). See [analogy-scoring.md §7](../docs/research/analogy-scoring.md). Original plan: score against **designed questions**: dealt analogy quads, where a play scores when its answer lands on the board word that completes a quad (partial points for another word linked to *c*, a penalty for a collapse). The vector verdict becomes a learning hint only (offset ≥ 0.20). Validate by simulation first: ≥ 2 completable quads per board, random play < 10% of skilled play.
* [x] **Task 2.11.3**: Relation-pair bank (10 categories from §7, shipped as a small text asset) and a quad dealer for timed rounds: 3 pairs from one category plus 2 from another, stem-free across pairs (shared with the Connect-All generator, Feature 2.10).
* [x] **Task 2.11.6**: Pure `scoreDesignedPlay(board pairs, a, b, c, solver result)` → full (top-3 leniency) / penalty / none, with unit tests; timed rounds use it instead of similarity points.
* [~] **Task 2.11.4**: HUD verdict ✅: "completes a dealt pair" (naming the model's first choice when a top-3 word was taken) / "fell back onto your first pair" (−10, in red) / "not one of this round's relation pairs", plus the hint; the timed HUD names the round's relation ("relation: capitals"). ⬜ Offset-scaled points (the simulation validated a flat 100). Original plan: ✓ relation carried over / ✗ fell back onto the first pair / – no relation, with the three similarities; points scaled by the offset cosine; a small, explained penalty.
* [x] **Task 2.11.5** (local phase, 2026-09-25): Log real plays. IndexedDB v3 `playEvents` store (append-only, client-generated ids so uploads will be idempotent, schema version, session id per page load, vocab version, context: view, dimension, hint mode, and in timed rounds the rules version and relation). Event types: `analogy` (question, answer, the model's first choice, top 3, similarities and offset, hint, verdict, designed flag, points, click vs typed), `expression`, `word`, and `import` (the chosen words only, never the pasted text). "Download my play log" in the analogies panel exports JSON without the device id or sync bookkeeping; `window.__lexical.playLog()` / `exportPlays()` in dev. Tests: `tests/playLog.test.ts`, repository v3 migration, and e2e (a play, then a download, checking the file). ⬜ Upload with consent: telemetry ingest (Epic 3, see the backend research).
* **Result (2026-09-25)** ✅ Timed rounds deal designed questions: `data/vocab/relation-pairs.txt` (307 pairs, 10 categories) and `src/game/relationPairs.ts` (bank, `dealRelationPairs`, `designedAnswer`, `scoreDesignedPlay` with top-3 leniency; full 100 / penalty −10 / otherwise 0, no partial credit). `applyPlay` takes points; the round score never drops below 0 (rules version 2). Reward deals add a pair of the round's relation. Browser: a capitals round, bangkok : thailand :: damascus → syria, +100, "✓ the relation carried over". e2e: a timed round plays a designed analogy by clicking in 2D (3/3 runs, never skipped), and the sandbox shows the hint. Unit: `tests/relationPairs.test.ts`, plus timed-rule penalty and zero floor.
* **Exit criteria** (first plan; replaced by the simulation gates in the research doc §7): on the held-out set, ≥ 60% of real analogies rewarded and ≤ 5% penalized; every simulated exploit strategy ≤ 5% reward; every dealt timed round contains ≥ 2 rewardable analogies; play-test: penalties feel fair.

### Feature 2.12: Personas & Skill Rating → Puzzle Complexity (roadmap · owner, 2026-09-27)
* **Description**: Each account (persona) has a **rating** that sets the complexity of what it is served: which relation categories a timed round deals, how many decoy pairs appear, and (Feature 2.10) which Connect-All difficulty band. Different personas (novice / intermediate / expert test accounts, Epic 6 · Feature 6.7) then see measurably different games, which is also how we test the difficulty model.
* **Design sketch**
  * **Rating**: Elo-style, updated from designed-play outcomes. Each designed question has a difficulty from the simulation (analogy-scoring §7: skilled points per category, e.g. world capitals 90 → opposites 62 → adjective-to-adverb 46). A full completion against a hard category raises the rating more than an easy one; a penalty lowers it.
  * **Storage and sync**: the rating is derived from synced `games` plus designed-play results (never a free-standing number merged across devices); the server can recompute it for leaderboards (Stage E).
  * **Serving complexity**: the dealer picks the main category from the difficulty band matching the rating, then adds more decoy pairs and shorter rounds at higher ratings. New accounts start at a neutral rating after 1–2 calibration rounds.
  * **Personas for testing**: dev personas can be seeded with a rating (e.g. `novice` = 800, `expert` = 1600) through the dev handle, so e2e can assert that each persona is served a different band.
* [~] **Task 2.12.1** (✅ priors 2026-10-04: `CATEGORY_DIFFICULTY` in `src/game/rating.ts`, Elo scale, ordered by human familiarity: family 800 … opposites 850 … comparatives/-ing 900 … superlatives/past tense 950 … common capitals 1150, nationalities 1200, world capitals 1450, city → state 1500. The model's completion rates from §7 don't apply, because Guess grades exact picks. ⬜ calibrate from real play logs): Difficulty per relation category (from the quad-board simulation and, later, real play logs), as data shipped with the relation bank.
* [x] **Task 2.12.2** (`rateGuess`, `expectedScore`, `pickCategory`; `tests/rating.test.ts`, 6 tests: symmetric, harder relations reward more, bounded 100–3000, simulated players of skill 800/1200/1500 converge within 120 with SD < 120 over plays 300–400, novice and expert get disjoint relation sets): Pure rating update (`rateDesignedPlay(rating, difficulty, verdict)`) with unit tests (bounded, converges, symmetric).
* [~] **Task 2.12.3** (✅ stored in the account's own database (`meta.rating`), so each persona has its own; every graded, non-repeated guess updates it (a correct guess in its relation, a wrong one in the round's); each round deals its main relation from the 3 categories nearest the rating; the Guess HUD shows "rating 1032 +16"; the rating goes into the play log. ⬜ sync across devices (derive from synced plays), more decoys and shorter rounds at high ratings): Rating stored per account (derived from synced games/plays), shown in the HUD; the dealer chooses its band from the rating.
* [x] **Task 2.12.4** (`window.__lexical.rating.set/get`, dev and e2e only; e2e "personas have their own skill rating…": a novice at 800 is dealt an easy relation, a correct guess raises the rating and the HUD shows +N, an expert at 1600 is dealt a hard relation, and switching back finds the novice's rating unchanged): Dev personas with seeded ratings; e2e: `novice` and `expert` are dealt different bands.
* **Exit criteria**: the simulated skilled player's rating separates categories as predicted; personas get different bands; ratings don't oscillate (bounded update).

### Feature 2.13: Discovery vs Guess — separate exploring from scoring (owner, 2026-10-03)
* **Owner's idea**: "when you pick one word and then another word and then you pick one more word right now we're manifesting other word into the world and that is one mode of Discovery but the actual guessing mode is where we have to pick four words and then we grade if it's a good analogy or not … separate Discovery versus gameplay". Also: a real analogy earns points, a non-analogy earns none.
* **Design** (grading reuses the designed questions of Feature 2.11; [analogy-scoring.md §7](../docs/research/analogy-scoring.md) simulated exactly this "answer is a board word" case as the board-only solver: skilled 94.6 points per play, random −0.7)
  * **Discovery** (the free-play board, view `fountain`): pick three words → the model's answer lands on the board with the relation hint. It brings new words in. **Points: none** (owner, 2026-10-04: "the key point is that Discovery and guesses are different"); points come only from correct guesses (Task 2.13.5).
  * **Guess** (the timed game, view `game`): pick **four** board words *a : b :: c : d* → graded, nothing spawns. **Correct** when *a → b* and *c → d* are two different dealt pairs of the same relation, in the same direction (or both reversed): +100 and a reward deal. Anything else: 0, with the vector hint as feedback (no penalty: the owner asked for "no points", and a 4-pick has no collapse case). Repeating a quad scores 0.
  * A random 4-pick almost never scores: a board of 10 words has 5,040 ordered 4-picks and about 12 designed quads (≈ 0.2%).
* [x] **Task 2.13.1**: Pure `gradeGuess(pairs, a, b, c, d)` → `{ correct, category, points }` (`src/game/relationPairs.ts`) with unit tests (both directions, case, same pair twice, mixed categories and directions, words not dealt).
* [x] **Task 2.13.2**: Selection: 3 picks in Discovery, 4 in Guess (`picksFor(view)`; 2D and 3D share `selectWordForAnalogy`; the store's hard cap of 3 picks became a parameter, found by the e2e test). The HUD's mode tag reads Discovery / Guess, the formula shows a fourth pick slot in Guess, and the menu tooltips and round tooltip explain the picks.
* [~] **Task 2.13.3**: ✅ Guess plays score through the round rules (`recordRoundGuess`: a repeated quad scores 0, reward deals, clock) and add to the lifetime score; HUD verdict "✓ a real analogy: both pairs are capitals" / "✗ not an analogy from this round's pairs (the model would answer …)" plus the hint; logged as an `analogy` event with `guess: true` (`answer` = the player's pick, `modelAnswer` = the solver's). ⬜ Discovery points (owner decision above).
* [x] **Task 2.13.5** (decided and shipped 2026-10-04): Discovery plays earn no points (`semanticEngine.playAnalogy` no longer scores; `analogyPoints` and the new-question bonus are gone; the HUD shows "new!" for a first-time question instead of "+N"). The sync, persona, and export e2e tests earn 100 through a correct guess (`window.__lexical.guess.playCorrect()`, dev and e2e only); the export test asserts a Discovery play leaves the score at 0. 25/25 e2e, 282 unit. Original plan: Discovery plays earn no points: `semanticEngine.playAnalogy` stops adding similarity points, the HUD shows the relation hint instead of "+N", and the lifetime score grows only from correct guesses. Rework the sync and persona e2e tests to earn score through Guess plays (or a dev-handle guess), and keep the per-device score counters unchanged.
* [x] **Task 2.13.4**: e2e "Guess mode: four picks are graded against the dealt pairs; nothing spawns (2D clicks)": a correct quad +100, the same pairs with the second reversed 0, and every board word was dealt (no model answer spawned). It replaces the 3-pick timed-round test. Discovery spawning stays covered by the existing sandbox tests. 280 unit, 24 e2e.
* **Exit criteria**: a correct quad scores, a wrong one doesn't, and neither spawns words; Discovery spawns and doesn't score; e2e in 2D.

### Feature 2.14: One board across modes — letters → words → game (owner, 2026-10-03)
* **Owner's idea**: "sprinkle letters around then you can transition those words into the view where they show the relationships in 2D as well as 3D and then you can play a game with those ideas. We don't want to clear the world when you change modes; you want to enable transferring the state into game mode."
* **Design**: switching views hands the board over instead of clearing it (the 2D ↔ 3D hand-off, generalized). Letters → Discovery/Guess carries every merged box that spells a known word (letter boxes and fragments stay behind). Discovery ↔ Guess keeps the word board; a Guess round deals its relation pairs next to the carried words (carried words can be picked; only dealt pairs score). A new round within Guess still starts a fresh board.
* [x] **Task 2.14.1**: Cross-view hand-off: pure `boardTransfer(handoff, view, showsWords)` (`src/space/handoff.ts`): "continue" for a 2D ↔ 3D switch (board and queue, as before), "carry" for a view change (the words once each at their positions; the old view's queued spawns stay behind), nothing into letters mode. Both worlds use `takeBoardTransfer` + `startWordBoard` (`src/services/playground.ts`); Discovery shows carried words instead of a random board. Unit tests in `tests/handoff.test.ts`.
* [x] **Task 2.14.2**: `startTimedRound(stores, carried)` keeps carried words and deals its pairs around them (no repeats or shared stems with carried words). "Play again" still starts a fresh board. Note: opening the app in Discovery and switching to Guess now carries the 20 random Discovery words into the round (30 words); play-test whether that is too crowded.
* [x] **Task 2.14.3**: e2e "one board across modes": E + A + T dropped in letters mode merge into "eat"/"tea" ("the" is a stopword with no embedding, so it cannot carry); Discovery then shows exactly that word; Guess deals 10 words next to it. 3/3 repeats. 283 unit tests.
* [~] **Task 2.14.4**: ✅ Returning to letters mode restores the letter board as it was left (letters, fragments, words, with positions, angles, colors; merges pause 1 s so resting boxes don't merge into words the player never made); e2e: letters → Discovery → Guess → letters shows the same board. ⬜ Word boxes from Discovery/Guess dropping into letters mode.
* **Exit criteria**: no view switch among letters → Discovery → Guess loses a word the target view can show; e2e covers letters → Discovery and Discovery → Guess.

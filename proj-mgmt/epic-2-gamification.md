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
    * [ ] **Task 2.3.1.1**: Define the score formula based on embedding similarity, word lengths, and difficulty.
    * [ ] **Task 2.3.1.2**: Track multipliers for quick consecutive mergers (combos).
  * **Story 2.3.2**: *As a player, I want to see a floating "+500" or "Perfect Match!" text pop up on screen where the merger occurred, to provide sensory satisfaction.*
    * [ ] **Task 2.3.2.1**: Write a custom rendering utility in `TypographyDisplay.ts` to manage transient text particle animations.
    * [ ] **Task 2.3.2.2**: Add sound effects or screen shake on massive combos.

### Feature 2.4: Interactive Concept Tree & History Graph
* **Description**: Render an end-game overview visualizer showing how the player navigated the embedding space.
* **User Stories**:
  * **Story 2.4.1**: *As a player, I want to see a history of all word mergers I made during the session, so I can review my conceptual path.*
    * [ ] **Task 2.4.1.1**: Keep a transaction log in `stores/GameStore.ts` tracking: `{ parentA, parentB, result, similarity, score }`.
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


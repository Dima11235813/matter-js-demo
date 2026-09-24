# Lexical Fountain - Master Roadmap

Welcome to the future roadmap for **Lexical Fountain** (formerly Word Physics Embeddings Game). This document outlines our transition from a primitive in-memory string-matching physics prototype to an enterprise-grade, gamified learning application and sandbox where players explore linguistic relationships through physics and semantic embeddings.

---

## 🌟 The Vision (Lexical Fountain Sandbox)

By merging a **2D rigid-body physics engine (Matter.js + p5.js)** with **word embeddings (vector semantics)**, we will build a multi-mode sandbox where language flows dynamically:
1. **Word Mode (Core)**: Dropped letters bounce and collide, merging into words when dictionary patterns are formed.
2. **Sentence Mode (Linguistic Attraction)**: Formed words attract, repel, and merge into complex sentences based on vector semantic proximity and grammar templates.
3. **Paragraph Mode (Textual Synthesis)**: Sentences cluster and fuse together to compose synthetically coherent paragraphs, driven by context embeddings and local language generation.
4. **Semantic Physics**: Words don't just collide; they attract or repel based on cosine distance. Colliding `coffee` + `milk` yields `latte`, while opposing concepts (e.g. `hot` + `cold`) cancel each other out.

---

## 🗺️ High-Level Roadmap (The Epics)

The project is deconstructed into five key Epics. Click each file link to explore detailed features, user stories, and tasks:

### 🧬 [Epic 1: Semantic Word Embeddings & Advanced Collision Engine](file:///D:/GDrive/Dev/matter-js-demo/proj-mgmt/epic-1-embeddings-collision.md)
* **Goal**: Transition from simple string concatenations to vector-based semantic similarity calculations.
* **Core Tech**: Word vectors (GloVe/Word2Vec/FastText), Cosine Similarity, Dynamic Physics Forces.
* **Key Features**: Offline/Online embeddings caching, Cosine distance scaling, similarity-based merging, semantic attraction forces.

### 🎮 [Epic 2: Gamified Language Discovery Experience](file:///D:/GDrive/Dev/matter-js-demo/proj-mgmt/epic-2-gamification.md)
* **Goal**: Formulate engaging game loops, objectives, scoring systems, and feedback systems to make learning embeddings fun.
* **Core Tech**: Matter.js bodies, custom UI overlays, visual effects (p5), connection graphs.
* **Key Features**: Discovery Mode, Survival Mode, Word Attraction Visualizer, Semantic High-Scores, Interactive Concept Tree.
* **Roadmap**: voice input: a mic toggle turns speech into word blocks in 2D and 3D (Feature 2.7).

### 🏢 [Epic 3: Enterprise Architecture & Backend Transition](file:///D:/GDrive/Dev/matter-js-demo/proj-mgmt/epic-3-enterprise-architecture.md)
* **Goal**: Scale the monolithic frontend to a clean, DRY monorepo structure with a backend service, shared type definitions, and proper state management.
* **Core Tech**: NestJS / Express, TypeScript interfaces, Shared DTOs, MobX 6 state architecture.
* **Key Features**: Client-Server Separation, `/shared` DTO Package, API Cache & Vector Storage, Domain-Driven Frontend Structure.

### ⚡ [Epic 4: Modernization & Dependency Upgrades](file:///D:/GDrive/Dev/matter-js-demo/proj-mgmt/epic-4-modernization.md)
* **Goal**: Modernize the build stack, upgrade key libraries, and establish a robust developer experience.
* **Core Tech**: Vite, React 18+, MobX 6, MUI 5+, Strict TypeScript.
* **Key Features**: Migrate from CRA to Vite, Upgrade p5/Matter-js bindings, Resolve MobX experimental decorators, Strict type safety.

### 🪐 [Epic 5: 3D Semantic Space](file:///D:/GDrive/Dev/matter-js-demo/proj-mgmt/epic-5-3d-semantic-space.md)
* **Goal**: Lift the hint-mode orbital layout into an explorable 3D space where distance mirrors meaning.
* **Core Tech**: three.js (lazy-loaded), custom 3D integrator, all-pairs similarity layout.
* **Key Features**: All-pairs layout (2D first), 3D orbits, raycast selection, 2D ↔ 3D toggle gated on hint mode.
* **Shipped**: embedding-shaped 3D layout ([research](file:///D:/GDrive/Dev/matter-js-demo/docs/research/embedding-shape.md)): lines, rings, and clusters from the board's own embedding distances; focus on new words, HUD analogy links, and an "Analogies on this board" menu that focuses in 2D and 3D (Feature 5.16).
* **Next**: cross-dimension continuity without re-rendering ([research](file:///D:/GDrive/Dev/matter-js-demo/docs/research/cross-dimension-continuity.md)), selection metadata HUD, live drag with physics, Create mode in 3D, zoom, spin to detangle, saved views, color hint mode (semantic colours by group and molecule, 2D and 3D, Feature 5.17).

---

## 🚀 Execution Strategy

```mermaid
graph TD
    A[Epic 4: Modernization & Vite Upgrade] -->|Build Foundation| B[Epic 1: Semantic Embeddings & Math]
    B -->|Core Engine Ready| C[Epic 2: Gamification & Modes]
    B -->|Offline Prototypes| D[Epic 3: Enterprise Backend & Shared DTOs]
    C -->|Production Release| E[Enterprise Gamified App]
    D -->|Production Release| E
```

### Status snapshot (2026-09-23)
* **Phase 1 (Foundation)**: done (Epic 4 mostly complete; follow-ups in Feature 4.5).
* **Phase 2 (Semantic Engine)**: done in a different shape than planned: MiniLM vocabulary + live encoder, analogy solver, calibrated similarity (Epic 1 status note).
* **Phase 3 (Gameplay & UI)**: sandbox, timed game, hint mode, molecules, themes, accessible UI shipped (Epic 2 · Feature 2.6); the 3D semantic space (Epic 5) went beyond the original plan: toggle, embedding-shaped grouped layout, research-driven, plus focus and board analogies (5.16).
* **Phase 4 (Backend Integration)**: local-first persistence shipped and sync-ready (Epic 3 · Feature 3.5); PWA and sync server not started.
* **Next candidates**: molecule gravity & accretion (5.15, needs 3D molecules 5.4.1.5), cross-dimension continuity (5.10), 2D scroll zoom and pan (5.7.1, also lets 2D focus pan to off-screen words), selection metadata HUD (5.11), live drag with physics (5.12), PWA (3.5.3).
* **Research that drives plans**: [docs/research/](file:///D:/GDrive/Dev/matter-js-demo/docs/research/README.md).

### Development Phases
1. **Phase 1 (Foundation)**: Upgrade package dependencies and build systems (Vite, React 18, MobX 6) to establish a clean compiler environment.
2. **Phase 2 (Semantic Engine)**: Integrate the word embeddings dataset and update collision resolution logic with cosine similarity mathematics.
3. **Phase 3 (Gameplay & UI)**: Create the game loops, scoring, and particle/visual feedback systems.
4. **Phase 4 (Backend Integration)**: Stand up the backend server, migrate the database/dictionary resources, and integrate shared DTOs.

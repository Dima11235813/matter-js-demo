# Epic 3: Enterprise Architecture & Backend Transition

## 📋 Overview
Refactor the codebase from a single client-side project containing all vocabulary logic into an enterprise-grade client-server application. This Epic establishes a clean separation of concerns, DRY principles, strict TypeScript models, and a shared module for data contracts (DTOs) shared by frontend and backend.

---

## 🛠️ Features, Stories & Tasks

### Feature 3.1: Shared DTO Module & Strict Types
* **Description**: Create a shared directory or package where Type definitions and Data Transfer Objects reside, so changes compile-time validate both frontend and backend.
* **User Stories**:
  * **Story 3.1.1**: *As a developer, I want all API requests and responses to use strictly typed DTO models, preventing drift between the frontend and backend.*
    * [ ] **Task 3.1.1.1**: Set up a `shared/` folder (or workspace package) at the repository root containing shared types.
    * [ ] **Task 3.1.1.2**: Define interfaces:
      * `IWordEmbeddingRequest`: Payload containing words to retrieve vectors or similarity.
      * `IWordEmbeddingResponse`: Returned coordinates/vectors.
      * `IWordMergeRequest` & `IWordMergeResponse`: For validating if two words merge and what word they resolve to.
      * `ISubmitScoreDto` & `ILeaderboardDto`: For score submittals.
    * [ ] **Task 3.1.1.3**: Configure TypeScript path mappings in frontend and backend `tsconfig.json` to resolve import statements from `@shared/*` or `shared/*`.

### Feature 3.2: NestJS or Express TypeScript Backend
* **Description**: Implement a lightweight, high-performance API server to manage the heavy vector datasets, calculations, database persistency, and leaderboard endpoints.
* **User Stories**:
  * **Story 3.2.1**: *As a developer, I want embedding calculations to run on the server, so that the client app download size remains tiny and loads instantly.*
    * [ ] **Task 3.2.1.1**: Scaffold a backend application under `/server` using NestJS or Express with TypeScript.
    * [ ] **Task 3.2.1.2**: Integrate an embedding handler using a vector library or local model (e.g. SQLite-VSS or loaded GloVe arrays) inside a `VectorService`.
    * [ ] **Task 3.2.1.3**: Expose `/api/embeddings/similarity` endpoint that takes two words and returns their cosine similarity.
  * **Story 3.2.2**: *As a player, I want my high scores saved to a global leaderboard, so that I can compete with other word masters.*
    * [ ] **Task 3.2.2.1**: Set up a lightweight database storage (e.g., SQLite or PostgreSQL) with TypeORM or Prisma.
    * [ ] **Task 3.2.2.2**: Implement endpoints `/api/leaderboard` (GET) and `/api/leaderboard/submit` (POST).

### Feature 3.3: Scalable Frontend Folder Organization
* **Description**: Restructure the frontend directory to follow a feature-based, clean-architecture approach instead of throwing multiple files into `/src` and `/src/matterJsComp`.
* **User Stories**:
  * **Story 3.3.1**: *As a developer, I want files grouped by feature domain (e.g., game, physics, menu), so that I can easily locate and maintain modules.*
    * [~] **Task 3.3.1.1**: Propose and execute the folder layout restructure: — partial (2026-09-22/23): domain folders added (`src/embeddings`, `src/physics`, `src/persistence`, `src/services`, `src/game`, `src/space`, `src/theme`); legacy `src/matterJsComp` remains.
      ```
      src/
      ├── assets/           # SVG, styles, static files
      ├── core/             # Base services, HTTP clients, initializers
      ├── features/         # Feature domains
      │   ├── game/         # Game-play components, loop stores, types
      │   ├── menu/         # Main menu components, configuration
      │   └── physics/      # Matter.js world, shapes factory, collision handlers
      ├── shared/           # Frontend-only shared helpers/hooks
      └── index.tsx         # Main entry point
      ```
    * [ ] **Task 3.3.1.2**: Update import paths across all files to align with the new structure.

### Feature 3.4: DRY State Management & MobX 6 Migration
* **Description**: Consolidate scattered settings and variables into a single RootStore, and upgrade legacy decorator-based MobX syntax to modern standards.
* **User Stories**:
  * **Story 3.4.1**: *As a developer, I want to use standard modern MobX 6 state actions and observables without relying on buggy experimental decorator warnings, so my code complies with future standards.*
    * [x] **Task 3.4.1.1**: Rewrite `MenuStore.ts` and `RootStore.ts` using `makeObservable` or `makeAutoObservable`. — ✅ `MenuStore`, `GameStore`, `RootStore` use `makeObservable`.
    * [~] **Task 3.4.1.2**: Remove references to legacy decorator packages in `package.json` and disable `experimentalDecorators` checks if no longer needed. — partial: no decorators in source; `vite.config.ts` still enables Babel `decorators-legacy`.
  * **Story 3.4.2**: *As a developer, I want all interaction events (clicks, drags, current tool mode) managed inside dedicated MobX stores instead of custom class properties in physics engine handlers.*
    * [ ] **Task 3.4.2.1**: Create `InteractionStore` and bind mouse coords, `clickType`, and selected body reference to MobX.
    * [ ] **Task 3.4.2.2**: Refactor `SketchHandler.ts` and `CustomWorld.ts` to consume variables directly from MobX stores.

### Feature 3.5: Local-First Persistence, PWA & Sync (partly shipped)
* **Description**: Player data lives on the device first and syncs to a server later. Decided 2026-09-22: IndexedDB now, progressive web app next, a sync server with auth when online.
  * [x] **Task 3.5.1**: IndexedDB schema (`src/persistence/db.ts`) with sync metadata on every record (`syncState`, `deviceId`, timestamps) and append-only migrations (v1 → v2 tested): player words, analogy collection, profile, timed-game results.
  * [x] **Task 3.5.2**: `LexicalRepository.pendingSyncCounts()` as the outbox hook for a future sync.
  * [ ] **Task 3.5.3** (roadmap): PWA: service worker and web manifest; precache the app shell and `public/vocab/` (a single static asset) for offline play.
  * [ ] **Task 3.5.4** (roadmap): Sync server + auth: push `pending` records, pull by account, merge by natural key (words by word, analogies by question, games by id); saved views (Epic 5 · Feature 5.9) sync the same way.


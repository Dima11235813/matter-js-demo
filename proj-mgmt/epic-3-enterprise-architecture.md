# Epic 3: Enterprise Architecture & Backend Transition

## 📋 Overview
Refactor the codebase from a single client-side project containing all vocabulary logic into an enterprise-grade client-server application. This Epic establishes a clean separation of concerns, DRY principles, strict TypeScript models, and a shared module for data contracts (DTOs) shared by frontend and backend.

**Direction (researched 2026-09-25, [platform-plan.md](../docs/research/platform-plan.md), [backend-sync-telemetry.md](../docs/research/backend-sync-telemetry.md))**:
* The backend is a thin TypeScript API (Hono + zod + `jose`) on GCP Cloud Run, with Postgres (Cloud SQL with IAM login, or Neon), served same-origin at `/api/*`.
* Embeddings stay in the browser.
* Research events go to monthly partitions with nightly Parquet copies for DuckDB.
* Accounts are Firebase Auth, verified by JWKS ([Epic 6](epic-6-accounts-privacy.md)); hosting and CI are in [Epic 7](epic-7-delivery-operations.md).

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

### Feature 3.2: NestJS or Express TypeScript Backend (superseded in part, 2026-09-25)
* **Superseded**: NestJS/Express and server-side embeddings. The research chose a thin Hono API on Cloud Run with embeddings kept in the browser (they already work offline and cost nothing to serve). Leaderboards move to Stage E with server-dealt, server-re-scored rounds, so scores can't be forged. The URL-import story (3.2.3) stands, as an isolated fetch service. Original plan kept below for the record.
* **Description**: Implement a lightweight, high-performance API server to manage the heavy vector datasets, calculations, database persistency, and leaderboard endpoints.
* **User Stories**:
  * **Story 3.2.1**: *As a developer, I want embedding calculations to run on the server, so that the client app download size remains tiny and loads instantly.*
    * [ ] **Task 3.2.1.1**: Scaffold a backend application under `/server` using NestJS or Express with TypeScript.
    * [ ] **Task 3.2.1.2**: Integrate an embedding handler using a vector library or local model (e.g. SQLite-VSS or loaded GloVe arrays) inside a `VectorService`.
    * [ ] **Task 3.2.1.3**: Expose `/api/embeddings/similarity` endpoint that takes two words and returns their cosine similarity.
  * **Story 3.2.2**: *As a player, I want my high scores saved to a global leaderboard, so that I can compete with other word masters.*
    * [ ] **Task 3.2.2.1**: Set up a lightweight database storage (e.g., SQLite or PostgreSQL) with TypeORM or Prisma.
    * [ ] **Task 3.2.2.2**: Implement endpoints `/api/leaderboard` (GET) and `/api/leaderboard/submit` (POST).
  * **Story 3.2.3** (roadmap · idea 2026-09-24): *As a player, I want to import a web page by URL, so its vocabulary lands on the board (Epic 2 · Feature 2.8).*
    * [ ] **Task 3.2.3.1**: `POST /api/import/url` fetches the page server-side (the browser cannot, because of CORS) and extracts the readable text (Readability-style main content, without navigation, ads, or scripts). It returns plain text and a title, never raw HTML.
    * [ ] **Task 3.2.3.2**: Safety: http(s) only; block private, loopback, and link-local addresses, including after redirects and DNS resolution (SSRF); a size cap (e.g. 2 MB), a timeout, and content-type checks; a per-user rate limit once auth exists; respect `robots.txt`.
    * [ ] **Task 3.2.3.3**: Shared DTO (`ImportResult { url, title, text, truncated }`) in the Feature 3.1 module.

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
  * [~] **Task 3.5.4** (roadmap, **revised 2026-09-25**): Sync server + auth. The original plan was to merge by natural key. The research found that is right for words, games, and views but **wrong for the counters** (score, `timesPlayed`): last-writer-wins loses offline points. Replaced by Feature 3.7's per-record merge rules plus Epic 6 · Task 6.1.1.1.

### Feature 3.6: Research Telemetry Ingest (Stage C · ~$0–12/month)
* **Description**: With consent (Epic 6 · Feature 6.2), a player's play log is uploaded for research. Pseudonymous (`researchId`), data-minimized (player-added words redacted to `<oov>`; pasted text, IP addresses, and user agents never stored), deduplicated by event id. Design: [backend-sync-telemetry.md §4](../docs/research/backend-sync-telemetry.md).
* [ ] **Task 3.6.1**: `server/` (Hono + zod + `jose` + `pg` via the Cloud SQL connector) and `shared/` (zod schemas as the DTO module, which realizes Feature 3.1). Local development is `docker compose` Postgres, **with its volume outside the Drive-synced tree**.
* [ ] **Task 3.6.2**: `POST /v1/session` (a Turnstile check exchanged for a 24 h HMAC ingest token bound to `researchId`), `POST /v1/events` (≤ 100 events / 64 KB; unknown schema versions quarantined, not dropped), `POST /v1/consent`, `POST /v1/research/delete`.
* [ ] **Task 3.6.3**: Client sender: batches of 20 events or 30 s via `fetch` keepalive, and `sendBeacon` when the page is hidden (≤ 32 KB). The shipped `playEvents` store is the queue: status queued → beaconed → acked, resent next session.
* [ ] **Task 3.6.4**: Postgres `play_events` / `molecule_events` partitioned by month; key `(occurred_on, event_id)`; hot fields (mode, verdict, points, a, b, c, answer) as columns; `quality` = ok or suspect (words not in the vocabulary, impossible similarities or timing). Limits: 600 events per hour and 5,000 per day per `researchId`; Cloud Run `max-instances=3` as a cost fuse; budget alerts.
* [ ] **Task 3.6.5**: A nightly Cloud Run Job writes closed partitions to Parquet in GCS (ids HMAC'd per export key, deletion ledger honoured). `docs/research/experiments/playLog.experiment.ts` runs the report's §4.5 queries in DuckDB, first on downloaded play logs, then on the archive.
* **Measure**: ingest success rate (acked ÷ generated), duplicate rate, p95 latency, cold-start share, cost per 1k events, real bytes per event and plays per session (these replace the report's assumptions).

### Feature 3.7: Sync API (Stage D)
* **Description**: The server side of optional accounts: outbox push, cursor pull, and merge rules per record. Design: [backend-sync-telemetry.md §3](../docs/research/backend-sync-telemetry.md).
* [ ] **Task 3.7.1**: Tables `users`, `identities (issuer, subject)`, `devices (device_id, user_id, secret_hash)`, `sync_records (user_id, collection, key, payload jsonb, server_seq)`, `games`.
* [ ] **Task 3.7.2**: `POST /sync/push` (≤ 200 records; per record: applied, merged, stale, or rejected) and `GET /sync/pull?since=<cursor>`. The cursor is a server-assigned sequence, never a client clock.
* [ ] **Task 3.7.3**: Merge rules, pure functions in `shared/` so client and server run the same code:
  * settings: last-writer-wins per field;
  * score and `timesPlayed`: per-device counters;
  * words: add-wins set keyed by word + model + dtype, syncing the vector itself;
  * analogy answers: last-writer-wins by (vocabVersion, updatedAt);
  * games: insert if absent;
  * saved views: last-writer-wins for the whole document.

  Property-based two-device tests: commutative, idempotent, no lost points.
* [ ] **Task 3.7.4**: A client `SyncService` behind `LexicalRepository`: push on a timer, when back online, and after sign-in; pull at start; exponential backoff with jitter; a record becomes `synced` only when the server acknowledges that exact `updatedAt`.
* [ ] **Task 3.7.5**: Schema versioning: accept versions N and N−1, upgrade on read; `X-Client-Version`; a `426` response asks the client to refresh.

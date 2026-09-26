# Backend Architecture for Sync and Research Telemetry

> **Provenance**: researched 2026-09-25 by a delegated research agent (web search plus official pricing and docs pages; no code was run). Prices marked **(verify)** were not read from an official page, and even the rest came through an automated page reader, so re-check every price before spending money. The combined recommendation and the decisions it needs are in [platform-plan.md](platform-plan.md).

> **Since this report**: the local play log shipped (commit `cf10128`, IndexedDB v3 `playEvents`, event schema 1, UUIDv4 ids, types analogy/expression/word/import). The report's §4.1 envelope (UUIDv7, `researchId`, `clientSeq`, OOV redaction) is applied at upload time; see [platform-plan.md §3](platform-plan.md).

**Status**: research complete, decision pending · **Date**: 2026-09-25 · **Scope**: Lexical Fountain (React 18 + Vite SPA, local-first IndexedDB) · **Prices**: public list prices found on 2026-09-25; anything not read from a vendor page is marked **(verify)**.

---

## 1. Question

Lexical Fountain has to go public so people can play, and their plays have to be collected so we can learn which analogies work and how molecules form. Accounts are optional. The auth provider is researched separately, but the backend must verify its tokens. Four things have to be decided:

1. **Where the backend runs**: BaaS (Supabase, Firebase), serverless (Cloudflare Workers + D1, Cloud Run + Cloud SQL or Firestore), or a classic Node API on a PaaS (Fly.io, Render, Railway) with managed Postgres.
2. **How sync works** for the records `src/persistence/db.ts` already defines (profile, player words, analogy collection, timed games), plus the planned play-event log and saved views.
3. **How telemetry is ingested and analysed**, for example "which analogies do players find, and which fail?".
4. **How privacy is built in**: consent, pseudonymous ids, minimization, retention, deletion and export.

Constraints: a solo developer; cheap at 0–10k MAU and reasonable at 100k; a lean toward GCP (Secret Manager is the vault); secrets only via env vars; scoped, short-lived credentials preferred.

### What exists today (read from the repo)

* `db.ts` (IndexedDB v2): `words` (key = word, with a raw 384-float `Float32Array`), `analogies` (key = `a:b::c`, `timesPlayed` counter), `profile` (key `"local"`; `score`, `hintMode`, `dimension`, and it **owns `deviceId`**), `games` (random UUID, immutable). Every record carries `SyncStamp {createdAt, updatedAt, syncState, deviceId}`.
* `LexicalRepository.touch()` marks a record `pending` again after every local edit. `pendingSyncCounts()` is the outbox hook.
* **Not in the committed code yet**: the play-event log store. It is not in `db.ts` v2, so this report proposes its shape (§4.1).
* Epic 3 sketches NestJS/Express with Postgres/SQLite, shared DTOs, `/api/leaderboard`, and `POST /api/import/url` with an SSRF checklist. Task 3.5.4 says "merge by natural key". §3 shows that is right for three record types and wrong for the two counters.

**Two data-model problems to fix before any sync ships**:
1. `profile.score` and `analogies.timesPlayed` are **counters**. If they merge by last-writer-wins (LWW), points earned offline on a second device are lost. They need per-device counters (§3.3).
2. Natural keys must be **normalized** (lowercase, Unicode NFC, trimmed) before they are used as keys. Otherwise `King:queen::man` and `king:queen::man` stay two records after they merge.

---

## 2. Options compared

Traffic model used for the cost rows (derived in §4.6): at 10k MAU, about 1M telemetry events a month, sent in batches of about 20. With sync calls that makes about 150k API requests a month. At 100k MAU, multiply by 10. In Postgres, raw events take about 0.5 GB a month at 10k MAU and about 5 GB a month at 100k MAU, before archiving.

**Cost rule for auth MAU**: create an auth user **only for people who make an account**. Anonymous players get a local pseudonymous id and no auth record. If every visitor signed in anonymously, auth MAU would equal all players, and Firebase would bill about $275 a month at 100k MAU ((100k − 50k) × $0.0055) **(verify)**. Supabase counts anonymous users toward its MAU quota as well.

| | **(a1) Supabase** (Postgres + RLS + Edge Functions) | **(a2) Firebase** (Firestore + Cloud Functions) | **(b1) Cloudflare Workers + D1 / DO / Queues** | **(b2) GCP Cloud Run + Cloud SQL Postgres** (or Firestore) | **(c) Node API (Fastify/Nest) on Fly / Render / Railway + managed Postgres** |
|---|---|---|---|---|---|
| **Sync fit** | Good. Postgres upserts with merge logic in SQL functions or an Edge Function. RLS isolates users. | Mixed. The Firestore SDK has its own offline cache, which would duplicate the IndexedDB layer. Merging is LWW per document; counters need `increment()`. | Good. A Worker does the merge and D1 stores it (SQLite). A per-user Durable Object is possible but more than this needs. | Good. Plain SQL upserts in a TS merge layer. Nothing new to learn. | Good, the same as b2. |
| **Telemetry ingest** | Fair. A direct PostgREST insert with the public anon key invites abuse, so it needs an Edge Function with rate limits. All analytics run in the same Postgres. | Poor for analysis. Every event is a billed document write, and querying needs the BigQuery export extension. | Excellent at the edge, with a rate-limit binding and Turnstile. Pipelines writes Parquet/Iceberg to R2 (billing not enabled yet). D1 has a 10 GB cap per database. | Good. BigQuery and GCS in the same project, with a free tier of 10 GB storage and 1 TB queries a month. | Good (Postgres). Analytics exports are yours to build. |
| **Token verification** | Native for Supabase Auth, with asymmetric keys and a JWKS endpoint. Third-party JWTs are supported **(verify)**. | Native for Firebase Auth; others via Identity Platform OIDC. | `jose` + JWKS in the Worker; any provider. | `jose` + JWKS in the service; any provider. | `jose` + JWKS; any provider. |
| **Cost at 10k MAU** | Free tier: 500 MB DB, 50k MAU, **paused after 1 week of inactivity**. Telemetry outgrows it in about a month, so realistically **Pro $25/mo**. | About **$0–5/mo** on Blaze: about 1M writes at $0.09 per 100k in us-central1 **(verify)**. | **$5/mo** Workers Paid covers it (10M requests; D1 50M rows written and 25B read; 5 GB). | Cloud Run inside the free tier (2M requests, 180k vCPU-s), plus Cloud SQL shared-core (about $8/mo) and storage: **about $10–12/mo (verify)**. With Neon instead of Cloud SQL: $0–5. | Render $7 + Postgres $6 = **about $13**. Fly $2 machine + Managed Postgres $38 (or an external Neon DB). Railway about $20 **(verify)**. |
| **Cost at 100k MAU** | Pro $25 + a Small/Medium compute add-on ($15–60, minus the $10 credit) + storage over 8 GB at $0.125/GB: **about $40–100** | Firestore about $10–30. Auth is free to 50k MAU and then $0.0055/MAU; with 20k account holders, $0. BigQuery streaming is small: **about $15–40 (verify)** | **About $5–20** (D1 storage over 5 GB costs $0.75/GB-mo, so archive old events to R2) | Cloud Run probably still near $0–5. Cloud SQL g1-small or 1 vCPU: $26–50. GCS or BigQuery: pennies. **About $35–70 (verify)** | **About $45–100** (a bigger instance plus Postgres) **(verify)** |
| **Cold starts** | Postgres is always on with Pro. Edge Functions are Deno isolates and start in about 100 ms **(verify)**. | Functions gen2 run on Cloud Run: 0.5–2 s for Node. | About 0 ms (isolates). | 0.5–2 s for Node from zero. CPU boost cuts that by about 30%; `min-instances=1` removes it at a cost. The Neon DB wakes from zero in about 0.5 s **(verify)**. | None on paid always-on plans. The Render free tier spins down. |
| **Local development** | `supabase start` runs the full stack in Docker. `db diff` produces migrations. | Emulator Suite: Firestore, Auth, Functions. | `wrangler dev` (miniflare) with local D1 in SQLite. | `docker compose` Postgres + Node. The Cloud SQL connector is used only in production. | `docker compose`. |
| **Migrations** | SQL files via the CLI. Preview branches need Pro. | Schemaless; backfills are scripts. | `wrangler d1 migrations` (SQLite dialect). | Any Postgres tool (drizzle-kit, node-pg-migrate, dbmate). | The same as b2. |
| **Lock-in** | Low–medium. Postgres is portable. RLS and Auth are Supabase-shaped; Edge Functions are Deno. | **High**: document model, rules language, SDK-driven client. | Medium. The Workers runtime and D1's SQLite dialect are Cloudflare's. Hono code ports to Node. | **Low**: a container + Postgres. | Low. |
| **Solo ops burden** | **Lowest** for DB + Auth + API in one place. RLS policies are a new thing to test. | Low to operate. Analysis and research queries are harder. | Low. It is a second cloud next to GCP, with secrets in `wrangler secret`. | Medium on day 1: IAM, the Cloud SQL connector, Hosting rewrites. After that it is low. **Best fit for GCP Secret Manager and short-lived IAM DB credentials.** | Medium. You own the server lifecycle. NestJS is heavy for one person; Fastify or Hono is lighter. |
| **Research SQL** | Full Postgres. | None without BigQuery. | SQLite, 10 GB per DB. | Full Postgres, plus BigQuery or DuckDB on exported Parquet. | Full Postgres. |

**Reading the table**:
* **Firebase** is cheap, but it is the worst fit for the main goal, research queries. Its offline cache would also compete with our own IndexedDB layer.
* **Cloudflare** is the cheapest and fastest ingest edge, but it is a second cloud, and D1 caps each database at 10 GB.
* **Supabase** has the lowest ops burden if its Auth wins the separate auth research.
* **Cloud Run + Postgres** has the least lock-in and matches GCP Secret Manager and IAM credentials. At 10k MAU its fixed cost is about $10/month.

---

## 3. Sync design

### 3.1 Principles

* **Outbox push, cursor pull.** The client pushes records marked `pending`. It pulls every change after a **server-assigned monotonic cursor** (`server_seq`, a Postgres `bigint` sequence), never after a client timestamp, because device clocks drift.
* **Client-generated ids** make pushes idempotent. Immutable records (games, events, views) use **UUIDv7**: time-ordered, B-tree friendly, and they carry their own timestamp. `crypto.randomUUID()` is v4, so add a small v7 helper or `uuid@>=10`'s `v7()`. Mutable records use their normalized natural key.
* **No general CRDT library.** Nothing here is collaboratively edited text, so Yjs or Automerge would be overkill. Three simple state-based types cover every record: **LWW register**, **grow-only set** and **per-device counter (G-Counter)**.
* **Sync is for the player; telemetry is for research.** Play events never go through the sync tables (see §4). Keeping them apart means deleting an account and withdrawing research consent are separate, understandable actions.

### 3.2 Endpoints (all under `/api/v1`, served from the same origin as the SPA)

| Endpoint | Auth | Body / result |
|---|---|---|
| `POST /sync/push` | Bearer JWT (accounts only) | `{schema: 1, deviceId, records: [{collection, key, op: "upsert"\|"delete", clientUpdatedAt, schemaVersion, payload}]}` (max 200 records or 256 KB) → `{results: [{collection, key, status: "applied"\|"merged"\|"stale"\|"rejected", serverSeq, merged?}]}`. When a merge changed a record, the merged record comes back, and the client stores it and marks it `synced`. |
| `GET /sync/pull?since=<cursor>&limit=500` | Bearer | `{changes: [...], nextCursor, hasMore}`. The cursor is an opaque string holding `server_seq`. |
| `POST /devices/claim` | Bearer + device proof | Links an anonymous `deviceId` to the user (§3.5). |
| `GET /me/export` | Bearer | JSON of all sync records, games and the user's own research events, in the same format as the Phase 0 export. |
| `DELETE /me` | Bearer (recent login) | Deletes everything (§5.5) and returns a deletion receipt id. |

Client side: a `SyncService` behind `LexicalRepository` (the class comment already plans this). Push runs on a timer, on `online`, and after a sign-in. Pull runs at startup and after a push. Retries use exponential backoff with jitter. `syncState` goes `pending` → `synced` only when the server acknowledges that exact `updatedAt`. If the record changed locally during the request, it stays `pending`.

### 3.3 Merge rule for each record

| Collection | Key (normalized) | Rule | Why |
|---|---|---|---|
| `profile.settings` (`hintMode`, `dimension`) | `profile` | **LWW per field** (`clientUpdatedAt`, tie-break `deviceId`) | Preferences; the last choice wins. |
| `profile.score` | `profile` | **G-Counter**: `{[deviceId]: points}`; score = sum. Or derive it on the server from `games` and plays. | LWW loses points earned offline on two devices. |
| `words` | `word + model + dtype` | **Add-wins set.** The vector is immutable for a given key (see the note below). Deletes are tombstones. | The same word from two devices is one record. |
| `analogies` | `a:b::c` | `timesPlayed` is a **G-Counter** per device. `answer`, `similarity` and `alternatives` are **LWW by (`vocabVersion`, `updatedAt`)**, so a newer vocabulary beats a newer clock. `createdAt` = min. | Repeat plays on two devices must add up. Answers change when the corpus changes. |
| `games` | UUIDv7 | **Insert-if-absent** (immutable) | Each finished round is a fact. |
| `views` (saved views, planned) | UUIDv7 | **LWW for the whole document.** The thumbnail is a content-addressed blob (`sha256`) in object storage. Deletes are tombstones. | Rare conflicts; a view is small and edited as one unit. |
| play and molecule events | UUIDv7 | **Not synced.** Telemetry only (§4). | Research log, not player state. |

**Word vectors**: sync the vector itself (1,536 bytes as base64 of little-endian float32) rather than re-embedding on the other device. q8 quantization and WebGPU-vs-WASM backends can differ numerically, and the CLAUDE.md note on per-batch quantization shows the output is sensitive to how the model runs.

### 3.4 Schema versioning

* Each record carries `schemaVersion`. The server accepts versions N and N−1 and **upcasts on read** (pure TS functions `v1 → v2`, unit tested). The `payload` is stored as `jsonb`, so unknown fields survive a round trip through an older server.
* The API is versioned by path (`/v1`). The client sends `X-Client-Version`. The server can answer `426` with `{minClientVersion}` to ask for a refresh; a PWA service-worker update then fixes it.
* IndexedDB keeps its own append-only `DB_VERSION` migrations, independent of the wire schema.
* **Shared DTOs** (Epic 3 · Feature 3.1) become zod schemas in `shared/`. The server imports them to validate input, and the client imports them for types.

### 3.5 Claiming an anonymous device on first sign-in

1. **Device proof, created now at no cost.** On first launch the client already creates `deviceId`. It should also create a random `deviceSecret`, stored locally and never displayed. The server only ever sees `sha256(deviceSecret)`, sent when the device first calls telemetry (Phase 1). That stops someone else claiming the device's research data by guessing its `deviceId`.
2. **Sign-in.** The client calls `POST /devices/claim {deviceId, deviceSecret}` with the new JWT. The server checks the hash and inserts `devices(user_id, device_id)`. If the user consents, it also writes a restricted link `research_links(research_id → user_id)` so deletion and export can find the anonymous-era events (§5).
3. **Local data becomes the user's.** In Phase 1 nothing about an anonymous player lives on the server except telemetry, so the claim is: re-stamp every local record `pending` and push it. The server merges with whatever the account already has, using §3.3 (for example, a second device's analogy counters add up).
4. **Signing out** asks: "keep this device's data locally" (default) or "clear this device". A device claimed by user A that then signs in as B pushes into B only after asking. The UI prevents two accounts silently merging on a shared machine.

**Alternative to watch**: PowerSync and ElectricSQL are Postgres-backed sync engines. Adopting one would mean replacing our IndexedDB layer with their SQLite-in-browser client, which costs more than the five collections here justify. Revisit if saved views become collaborative.

---

## 4. Telemetry ingest and analysis

### 4.1 Event envelope and payloads (schema `play.v1`, `molecule.v1`)

```jsonc
{
  "eventId": "0192f3a4-…",          // UUIDv7, client-generated; the timestamp is inside
  "type": "play", "schema": 1,
  "researchId": "…",                 // pseudonymous, generated at consent (§5.2); never deviceId or userId
  "sessionId": "…",                  // random per app load
  "clientSeq": 42,                   // per session; gives order and gap detection
  "occurredAt": 1790000000000,       // client clock; the server keeps its own receivedAt
  "app": {"version": "0.1.0", "vocabVersion": "…", "rulesVersion": 3, "model": "all-MiniLM-L6-v2/q8", "backend": "wasm|webgpu"},
  "payload": {
    "mode": "sandbox|timed", "dimension": "2d|3d", "hintMode": true,
    "roundId": "…", "boardCategory": ["capital-common", "family"], "designedQuadId": "…|null",
    "a": "man", "b": "king", "c": "woman", "oov": [false, false, false],
    "answer": "queen", "top3": [["queen", 0.61], ["princess", 0.52], ["monarch", 0.49]],
    "sims": {"da": 0.22, "db": 0.53, "dc": 0.41}, "offsetCos": 0.39,
    "hint": "carried|collapse|none", "verdict": "full|partial|penalty|none", "points": 100,
    "leniencyUsed": true, "msSinceDeal": 8400, "input": "drag|typed"
  }
}
```

* **Out-of-vocabulary words.** A player-added word can be personal (a name, a pasted phrase), so it is sent as `"<oov>"` with `oov: true`. Only base-vocabulary words leave the device.
* **Molecule events** (`molecule.v1`) are emitted when a molecule is **stable**: held for 2 s or more. Each carries `members` (vocabulary words only), `size`, the mean and min pairwise similarity, `dimension`, the `trigger` (collision, merge or dealt), `msSinceBoardStart`, and a `dissolvedAt` follow-up event. Cap them at about 30 per minute per session. Physics can form and break clusters every frame, and raw collision events would swamp everything else.

### 4.2 Client pipeline

1. **Local first.** Every event is written to an IndexedDB `events` store (`status: queued|beaconed|acked`), whether or not the player has consented. Without consent it never leaves the device, and it still feeds the Phase 0 JSON export.
2. **Batching.** Flush after 20 events or 30 s, whichever comes first, using `fetch(…, {keepalive: true})`. Mark events `acked` on `200 {accepted, duplicates}`.
3. **Unload.** On `visibilitychange → hidden`, **not** `unload` or `beforeunload`, call `navigator.sendBeacon('/api/v1/events', blob)`. The beacon limit is about 64 KiB of keepalive payload per page, so keep each beacon under 32 KB (about 40 events). Beaconed events stay `beaconed` and are resent in the next session. Server-side deduplication makes the resend harmless.
4. **Same origin.** A beacon can't set an `Authorization` header, and a cross-origin beacon has to use a CORS-safelisted content type. Serving the API from the SPA's origin avoids both problems: Firebase Hosting rewrites `/api/**` to Cloud Run (or use a Worker route on Cloudflare). The ingest credential goes in the body (§4.4).

### 4.3 Server ingest and idempotency

* `POST /api/v1/events`: at most 100 events or 64 KB per request. Each event is validated with zod against its `schema`. Unknown `schema` values are **kept** in a `quarantine` table, not dropped, so a newer client can't lose data on an older server.
* **Deduplication**: `INSERT … ON CONFLICT (occurred_on, event_id) DO NOTHING`. The partition key `occurred_on` is computed **by the server from the UUIDv7 timestamp**, clamped to within ±2 days of `receivedAt`. A resent event therefore always lands in the same partition, and the primary key (which must include the partition column) still deduplicates.
* The server adds `received_at`, `ingest_version` and `quality` (`ok|suspect`). It stores **no IP address and no user-agent string**, only a coarse `platform` (desktop/mobile).

### 4.4 Rate limiting and abuse protection

* **Session token.** At the first flush after consent, the client does an invisible Cloudflare Turnstile check (free), then calls `POST /api/v1/session {turnstileToken, researchId, deviceSecretHash}`. The server verifies the token with `siteverify` (tokens are single use and valid for 300 s) and returns a **short-lived HMAC ingest token** (24 h, bound to `researchId`). The HMAC key comes from Secret Manager through an env var. Batches carry that token. Firebase App Check with reCAPTCHA Enterprise does the same job on the Firebase path.
* **Limits.** Per `researchId`, 600 events per hour and 5,000 per day. Per IP, a token bucket held in instance memory; the IP is never stored. Also a maximum batch size, and Cloud Run `max-instances` (for example 3) as a cost fuse. Cloud Armor needs a load balancer, which costs about $18/mo **(verify)**, so it isn't worth adding until there is real abuse. On Cloudflare, the Workers rate-limit binding does this per key.
* **Plausibility.** The server loads the vocabulary word list (about 20k words, small). Events whose words aren't in the vocabulary (and aren't flagged `oov`), with similarities outside [−1, 1], or with timing that isn't humanly possible, are marked `quality='suspect'`, not dropped. Research queries filter them out.
* **Budget alerts.** GCP billing budgets at $10, $25 and $50, with email alerts.

### 4.5 Storage for analysis

| Stage | Store | Why |
|---|---|---|
| Phases 0–1 | **Postgres** `play_events`, `molecule_events`, range-partitioned by month | Deduplication with `ON CONFLICT`, deletion by `research_id`, and SQL a researcher already knows. It handles the 10k-MAU volume easily. |
| From Phase 1 on | **Nightly export of closed partitions to Parquet** in GCS (a Cloud Run Job + Cloud Scheduler, using DuckDB's `postgres` extension and `COPY … TO 'x.parquet'`) | Parquet is roughly 5–10× smaller than Postgres rows **(verify)**. Researchers run DuckDB on a laptop. It matches the repo's reproducible `docs/research/experiments`. |
| Only if needed | **BigQuery**: external or BigLake tables over the GCS Parquet, or free batch loads | Once data passes about 50 GB, or when collaborators need a hosted query UI. The free tier gives 10 GB storage and 1 TB queries a month. On-demand queries cost $6.25/TiB. |
| Retention | Raw events stay in Postgres for 3–6 months, then live only in Parquet (§5.4) | Keeps Postgres small at 100k MAU (about 5 GB a month of raw events otherwise). |

**What a researcher runs** (the same SQL in Postgres or DuckDB):

```sql
-- Which designed analogies do players complete, and which fail? (timed rounds, consented, quality ok)
SELECT payload->>'designedQuadId' AS quad, payload->'boardCategory'->>0 AS category,
       count(*) AS plays, count(DISTINCT research_id) AS players,
       avg((payload->>'verdict' = 'full')::int)    AS full_rate,
       avg((payload->>'verdict' = 'penalty')::int) AS collapse_rate,
       avg((payload->>'leniencyUsed')::bool::int)  AS needed_top3,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY (payload->>'msSinceDeal')::int) AS median_ms
FROM play_events
WHERE quality = 'ok' AND payload->>'mode' = 'timed' AND schema = 1
GROUP BY 1, 2
HAVING count(DISTINCT research_id) >= 10          -- k-anonymity floor for reporting
ORDER BY full_rate ASC;                            -- hardest analogies first
```

Other questions the same tables answer:
* Sandbox questions (a, b, c) that players keep asking where the hint says `none`: analogies the embedding can't express.
* Answers where `top3[0] != designed answer` but a player still found the designed word: leniency doing its job.
* A per-category comparison against the simulated skilled play in `analogy-scoring.md` §7, to check the simulation against real play.

**Promote the hot fields to columns.** `mode`, `verdict`, `points`, `a`, `b`, `c` and `answer` should be real columns rather than `jsonb` keys, so they can be indexed and read without casts. They are small.

### 4.6 Event volume estimate (10k MAU)

| Assumption | Low | **Mid** | High |
|---|---|---|---|
| Sessions per MAU per month | 1.5 | **3** | 8 |
| Analogy plays per session | 10 | **20** | 40 |
| Play events per month | 150k | **600k** (about 20k/day) | 3.2M |
| + molecule events (about 0.5× plays, capped) | 75k | **300k** | 1.6M |
| Total events per month | 0.23M | **about 0.9M** | 4.8M |
| Bytes per event (JSON on the wire) | | **about 0.7–1 KB** | |
| Postgres per month (row + PK + indexes, about 0.5 KB) | 0.1 GB | **about 0.45 GB** | 2.4 GB |
| Parquet per month (about 60–100 B/event) **(verify)** | | **about 0.1 GB** | |
| Ingest requests (20 events per batch) | 12k | **about 45k** | 240k |

**Consent roughly halves these figures** (opt-in rates of 30–60% are an assumption). At 100k MAU, multiply by 10: about 9M events and 4–5 GB of raw Postgres a month, which is why partitions are archived to Parquet. Every platform in §2 absorbs the request rate within its free or base tier. The cost difference is storage and fixed database compute.

Measure first: Phase 0 records the real bytes per event and plays per session from play-tests. That replaces the "Mid" assumptions above, following the working agreement to measure before claiming.

---

## 5. Privacy engineering

*This section is engineering guidance, not legal advice. Have the privacy policy reviewed once real players' data is collected.*

### 5.1 Consent in the client

* **Telemetry is off by default.** A `ConsentStore` (MobX) holds `{policyVersion, grantedAt, scopes: ["plays", "molecules"]}` in IndexedDB. The event sender is **not created** until consent exists, so the gate is enforced by code structure, not by a flag checked at call sites.
* **Where it is asked**: a short, dismissible prompt after the first finished round ("Share your plays anonymously to help us learn which analogies work? You can stop any time."), plus a toggle in Settings. It is never a wall; play works fully without consent.
* **Backlog**: plays made before consent stay local unless the player also ticks "include my earlier plays on this device".
* **Withdrawal**: stop sending, drop queued events, and offer "also delete what you sent" (§5.5). Every grant and withdrawal is written to the server-side `consent_events` table as proof.
* **Legal basis.** Research telemetry rests on consent: GDPR Art. 6(1)(a). The ePrivacy rule on storing or reading identifiers on the device covers the `researchId` in IndexedDB anyway. CNIL's consent exemption applies to basic audience measurement, not to research on gameplay behaviour, so don't rely on it.

### 5.2 Pseudonymous ids (three ids, three purposes)

| Id | Created | Used for | Seen by researchers? |
|---|---|---|---|
| `deviceId` (exists) | First launch | Sync provenance, the claim | No |
| `researchId` | When consent is granted; **reset** on withdrawal plus re-consent | Telemetry only | Only as a keyed hash in exports |
| `userId` | At account creation | Sync, leaderboards | No |

* `research_links (research_id → user_id)` is the **only** join between research data and identity. It is created only when the player links them (§3.5), stored in a separate restricted schema, and used for deletion and export, never for analysis.
* **Exports** replace `research_id` with `HMAC(exportKey, research_id)`, where `exportKey` comes from Secret Manager and rotates yearly. Longitudinal analysis works within one key period, and a leaked export can't be joined back to the production tables.
* Under the EDPB's pseudonymisation guidelines (01/2025), pseudonymised data is still personal data, so deletion, export and retention rules apply to it in full.

### 5.3 Data minimization

* **Never store pasted text or URL-import content.** Import runs in the browser (paste) or returns text to the browser only (URL import, §6 Phase 3). The server keeps at most `{hostname, byteCount, status}` counters for abuse monitoring.
* OOV words are redacted to `<oov>` in telemetry (§4.1). Player words go to the server only through the user's own sync, never to research.
* No IP address or user-agent is stored in tables. **Cloud Run request logs do contain the client IP**: set a Cloud Logging exclusion or a 30-day retention for the ingest route, and don't send request bodies to logs.
* Leaderboard display names are optional, filtered by the production profanity policy, and default to a generated handle.
* **Ages**: a game about words may attract under-16s or under-13s. For an EU or US audience, decide whether to add a simple age question before any account or telemetry consent (open question §7).

### 5.4 Retention

| Data | Kept for |
|---|---|
| Raw events in Postgres | 6 months, then Parquet only |
| Parquet research archive | 24 months, then only aggregates (counts per question/category with k ≥ 10) |
| Sync data | Until the account is deleted. Accounts inactive for 24 months: email, then delete **(policy choice)** |
| Consent events | For the life of the data they authorize, plus the limitation period |
| Request logs | 30 days |
| Cloud SQL backups | 7 days (deletions propagate once the last backup expires; say so in the policy) |

### 5.5 Deletion and export across copies

* **Account**: `DELETE /me` removes, in one transaction, `sync_records`, `games`, `leaderboard_entries`, `devices`, `identities` and `users`. It then looks up the linked `research_id`s and deletes their `play_events` and `molecule_events`. It also appends each `research_id` to a **`deletion_ledger`** (id and date only).
* **Anonymous players** get the same through "Delete my research data" (authenticated by `researchId` + `deviceSecret`).
* **Analytics copies**: the Parquet writer **excludes ids in `deletion_ledger`**, and a monthly compaction job rewrites any archived Parquet files that contain ledger ids. Parquet is immutable, so delete means rewrite. BigQuery (if used) runs `DELETE … WHERE research_id IN (ledger)`. Researchers' local copies are covered by a data-use rule: refresh from the latest export, and delete old ones after 90 days.
* **Target**: completed within 30 days (GDPR's one-month response window), with a receipt id shown to the player.
* **Export**: `GET /me/export` returns the same format as the Phase 0 local JSON export, plus the server copy of the user's events.

---

## 6. Recommendation, schema and phased plan

### 6.1 Recommendation

**A thin TypeScript API (Hono, so it also runs on Node or Workers) on GCP Cloud Run, backed by Postgres, with Parquet in GCS for research. Firebase Hosting serves the SPA and the 8 MB vocabulary, and rewrites `/api/**` to Cloud Run, so everything is same-origin. Tokens from any auth provider are verified through JWKS.**

Why this over the others:
* **Goal fit.** Research questions are SQL questions. Postgres plus Parquet/DuckDB answers them on day 1 and stays reproducible in `docs/research/experiments`.
* **Workspace fit.** GCP Secret Manager maps to Cloud Run env vars. Cloud SQL **IAM database authentication** through the Node connector means short-lived tokens and no database password. Workload Identity Federation lets CI deploy without keys. No second cloud.
* **Lock-in and solo ops.** One container, one database. Local development is `docker compose up` (Postgres) plus `vite`. Migrations use drizzle-kit or node-pg-migrate. A Hono app can move to Workers later if edge latency ever matters.
* **Cost.** About $0–12 a month at 10k MAU, about $35–70 at 100k. Cloud Run's free tier absorbs the request load at both scales.
* **Cold starts don't matter much.** Telemetry is asynchronous, and sync runs in the background. Enable CPU boost; add `min-instances=1` only if the leaderboard page feels slow.

**Database choice for Phase 1**: **Neon** (free tier, then pay-as-you-go at about $5/mo) to reach zero fixed cost, **or Cloud SQL shared-core** (about $10/mo) for IAM auth and single-vendor ops. **Default: Cloud SQL**, because the workspace prefers short-lived, scoped credentials. Choose Neon if $10/month matters before there are any players. The schema and code are identical either way.

**Conditional alternative: if the auth research picks Supabase Auth**, put Postgres **and** Auth on **Supabase Pro ($25/mo)** in place of Cloud SQL. Keep the same Cloud Run API, connecting through Supabase's pooler and verifying Supabase JWTs by JWKS. Don't move ingest into PostgREST or RLS: ingest needs rate limits and validation, and one TS merge layer is easier to test than RLS policies plus SQL functions.

**Rejected**: Firebase (research queries need BigQuery from day 1; its offline cache competes with ours; high lock-in). Cloudflare-only (a second cloud, D1's 10 GB cap and SQLite analytics). It stays the best **edge ingest** if Cloud Run cold starts or abuse ever become a problem, since Hono ports directly. NestJS on Fly, Render or Railway (always-on fees plus managed Postgres cost more at 10k MAU than Cloud Run plus shared-core, and NestJS is heavy for one developer).

### 6.2 Proposed schema (Postgres)

```sql
-- identity (Phase 2)
users            (user_id uuid PK, created_at, display_name text NULL, deleted_at NULL)
identities       (issuer text, subject text, user_id uuid FK, PRIMARY KEY (issuer, subject))   -- JWT iss+sub → user
devices          (device_id uuid PK, user_id uuid FK NULL, secret_hash bytea, first_seen, claimed_at NULL)

-- sync (Phase 2)
CREATE SEQUENCE sync_seq;
sync_records     (user_id uuid, collection text, key text,                -- 'profile'|'words'|'analogies'|'views'
                  payload jsonb, schema_version int, client_updated_at bigint, device_id uuid,
                  deleted bool DEFAULT false, server_seq bigint DEFAULT nextval('sync_seq'),
                  PRIMARY KEY (user_id, collection, key))
                  INDEX (user_id, server_seq)                              -- pull cursor
games            (game_id uuid PK, user_id uuid FK, mode text, rules_version int, started_at, ended_at,
                  score int, analogies int, words_dealt int, hint_mode bool, round_seed text NULL,
                  server_seq bigint DEFAULT nextval('sync_seq'))           -- typed for leaderboards
view_blobs       (sha256 bytea PK, gcs_path text, bytes int, created_at)   -- saved-view thumbnails (Phase 3)

-- research (Phase 1)
consent_events   (id uuid PK, research_id uuid, policy_version text, action text /*grant|withdraw*/,
                  scopes text[], at timestamptz)
play_events      (event_id uuid, occurred_on date, research_id uuid, session_id uuid, client_seq int,
                  occurred_at timestamptz, received_at timestamptz, schema int,
                  mode text, dimension text, a text, b text, c text, answer text, verdict text, points int,
                  app jsonb, payload jsonb, quality text DEFAULT 'ok',
                  PRIMARY KEY (occurred_on, event_id)) PARTITION BY RANGE (occurred_on)
                  INDEX (research_id), INDEX (a, b, c)
molecule_events  (same envelope; members text[], size int, mean_sim real, min_sim real, trigger text, …)
                  PARTITION BY RANGE (occurred_on)
quarantine_events(event_id uuid PK, received_at, raw jsonb, reason text)      -- unknown schema / invalid
ingest_sessions  (research_id uuid PK, secret_hash bytea, first_seen, last_seen, suspect bool)

-- privacy (restricted schema, not granted to the research role)
research_links   (research_id uuid PK, user_id uuid FK, linked_at)
deletion_ledger  (research_id uuid NULL, user_id uuid NULL, requested_at, completed_at, receipt uuid)

-- leaderboards (Phase 3)
leaderboard_entries (board text /*weekly:2026-W39|alltime*/, user_id uuid, game_id uuid, score int,
                     hint_mode bool, verified bool, PRIMARY KEY (board, user_id))
rounds           (round_id uuid PK, user_id uuid NULL, seed text, rules_version int, dealt jsonb,
                  issued_at, expires_at)                                    -- server-dealt timed rounds
```

Database roles: `api` (read/write, no access to the `privacy` schema except through deletion functions) and `research_ro` (read-only on `play_events`/`molecule_events` views with `quality='ok'`). Neither role has a password in Cloud SQL, which uses IAM.

### 6.3 Phased plan (each phase ends with tests and a measured number, per the working agreements)

**Phase 0: local play log and JSON export ($0, no backend)**
* IndexedDB v3: an `events` store (UUIDv7 key, `status`, `type`, `schema`) holding exactly the §4.1 envelope. A `deviceSecret` in `profile`. Normalized natural keys, with a migration that re-keys existing `analogies`.
* Change `profile.score` and `analogies.timesPlayed` into per-device counters now (a cheap local migration; §3.3).
* Settings → "Export my plays" (NDJSON or JSON). Add `docs/research/experiments/playLog.experiment.ts`, which loads an export with DuckDB and runs the §4.5 queries.
* Consent UI and `ConsentStore`, with nothing sent yet.
* **Measure**: bytes per event, plays per session, and molecule events per minute from play-tests. These replace the §4.6 assumptions.

**Phase 1: telemetry ingest and anonymous ids (about $0–12/mo)**
* Cloud Run service `api` (Hono + zod + `jose` + `pg` with the Cloud SQL connector). Endpoints: `POST /v1/session` (Turnstile → ingest token), `POST /v1/events`, `POST /v1/consent`, `POST /v1/research/delete`.
* Firebase Hosting for the SPA and vocabulary, with the `/api/**` rewrite. Secrets (Turnstile secret, ingest HMAC key, export key) from Secret Manager as env vars. Deploys from CI through Workload Identity Federation. Budget alerts. `max-instances=3`.
* Postgres tables: `consent_events`, `ingest_sessions`, `play_events`, `molecule_events`, `quarantine_events`, `deletion_ledger`, plus a monthly partition job.
* A nightly Cloud Run Job writes Parquet to `gs://…/research/play_events/month=YYYY-MM/`, with ledger filtering and HMAC'd ids.
* **Measure**: ingest success rate (acked ÷ generated for consented sessions), duplicate rate, p95 ingest latency, cold-start share, and cost per 1k events.

**Phase 2: accounts and sync**
* JWT verification by JWKS for the chosen provider. `users`, `identities`, `devices` and `sync_records`. `POST /sync/push`, `GET /sync/pull`, `POST /devices/claim`, `GET /me/export`, `DELETE /me`.
* Client `SyncService` behind `LexicalRepository`. Merge functions live in `shared/` so the client and server run the same code.
* **Tests**: property-based two-device merge tests with fake-indexeddb (commutative, idempotent, and no lost points), and a claim flow e2e test.
* **Measure**: time to converge across two devices, and a sync payload of about 1 KB per record.

**Phase 3: leaderboards, saved views, URL import, molecule research**
* **Leaderboards**: the server deals timed rounds (`rounds`, a seed plus designed quads), and the server re-scores the submitted plays. It knows the dealt quads, and it can run top-3 3CosAdd over **board words only** using vocabulary vectors held in memory (20k × 384 float32 = about 30 MB). Client-computed scores are trivial to forge, so only `verified` entries are ranked. Weekly and all-time boards, split by `hint_mode`.
* **Saved views**: `sync_records` collection `views`. Thumbnails upload directly to GCS through **V4 signed URLs** (5 minutes, `image/png`, 200 KB max) and are content-addressed by sha256.
* **URL import**: a **separate** Cloud Run service `fetcher` with no service-account permissions and no VPC connector, only egress. It uses an SSRF guard that resolves DNS once, rejects private, loopback, link-local and metadata addresses (`169.254.169.254`, `metadata.google.internal`), pins the address, and re-checks after every redirect (e.g. `ssrf-guard`). It enforces http(s) only, 2 MB, 10 s, `text/html` only and `robots.txt`, rate-limits per user, and returns `{url, title, text, truncated}`. **Nothing is stored.**
* **Molecule research**: `molecule.v1` analysis plus a Parquet partition, and a first research report on "how molecules form" in `docs/research/`.

---

## 7. Risks and open questions

**Risks**

| Risk | Mitigation |
|---|---|
| Cost blow-up from abuse or a bug (event storms from the physics loop) | Client caps (molecules 30/min), server limits per `researchId`, Turnstile tokens, `max-instances`, budget alerts |
| Counters merged by LWW lose points | Fix the data model in Phase 0 (§3.3), before any sync |
| Consent bias: only engaged players opt in | Report consent rate alongside every finding; compare against aggregate, id-free counters (plays per mode) if those are later judged exempt |
| Re-identification through rare words or tiny cohorts | OOV redaction, k ≥ 10 floor in reports, HMAC'd ids in exports |
| Forged leaderboard scores | Server-dealt rounds and server re-scoring (Phase 3); unverified entries hidden |
| Lost unload events | Local queue + beacon + resend on next session + deduplication; measure the ack rate |
| Clock skew misorders events | Server `received_at`, per-session `client_seq`, cursors from server sequences |
| Schema drift across long-lived offline clients | Accept N and N−1, quarantine unknowns, `426` + PWA update |
| Vendor price changes (D1 hard caps from 2026-09-01; Fly and Neon repricing) | Portable stack (container + Postgres); re-check prices before each phase |
| The repo lives on Google Drive | Keep server code in the same repo (`server/`, `shared/`) but run Postgres in Docker volumes **outside** Drive |
| Cloud Run logs hold client IPs | Log exclusion or 30-day retention for `/api/v1/events` |

**Open questions for the user**

1. **Auth provider** (separate research): Supabase Auth changes the database choice (§6.1 conditional alternative). Firebase Auth or Identity Platform keeps everything on GCP.
2. **Region**: will players be mostly in the EU? If so, choose `europe-west1` for Cloud Run, Cloud SQL and GCS now; moving data later is painful.
3. **Age policy**: add an age question before consent or accounts?
4. **OOV words in research**: never (default), or allow opt-in sharing of player-added words that pass the profanity filter?
5. **Who are the researchers?** Only you (DuckDB on Parquet is enough), or collaborators who need BigQuery access?
6. **Retention numbers** in §5.4 are proposals. Confirm them before the privacy policy is written.
7. **Sync scope**: should saved views and player words sync for signed-out users (anonymous server storage)? This report assumes **no**: anonymous data stays local, and only research events leave the device.

---

## 8. Sources

Pricing and platform facts (retrieved 2026-09-25):
* Supabase pricing: https://supabase.com/pricing
* Supabase compute sizes: https://supabase.com/docs/guides/platform/manage-your-usage/compute · https://makerkit.dev/blog/saas/supabase-pricing
* Supabase JWT signing keys and JWKS: https://supabase.com/docs/guides/auth/signing-keys · https://supabase.com/docs/guides/auth/jwts · https://supabase.com/docs/reference/javascript/auth-getclaims
* Supabase anonymous sign-ins (count as MAU; convert via `linkIdentity` / `updateUser`): https://supabase.com/docs/guides/auth/auth-anonymous · https://supabase.com/docs/guides/auth/rate-limits
* Supabase CLI and local development: https://supabase.com/docs/guides/local-development/cli/getting-started · https://supabase.com/docs/guides/deployment
* Firebase pricing: https://firebase.google.com/pricing
* Firestore per-operation prices (us-central1 $0.03 reads / $0.09 writes per 100k): https://airbyte.com/data-engineering-resources/google-firestore-pricing · https://cloud.google.com/firestore/pricing
* Firebase Auth MAU tiers beyond 50k: https://blog.logto.io/firebase-authentication-pricing · https://www.metacto.com/blogs/the-complete-guide-to-firebase-auth-costs-setup-integration-and-maintenance
* Firebase Emulator Suite: https://firebase.google.com/docs/emulator-suite
* Firestore → BigQuery extension: https://extensions.dev/extensions/firebase/firestore-bigquery-export
* Firebase App Check with reCAPTCHA Enterprise: https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
* Firebase Hosting rewrites to Cloud Run: https://firebase.google.com/docs/hosting/full-config · https://oneuptime.com/blog/post/2026-02-17-how-to-use-firebase-hosting-rewrites-to-route-traffic-to-cloud-run-services/view
* Cloudflare Workers pricing (Workers, Durable Objects, Queues): https://developers.cloudflare.com/workers/platform/pricing/
* Cloudflare D1 pricing and limits: https://developers.cloudflare.com/d1/platform/pricing/ · https://developers.cloudflare.com/d1/platform/limits
* D1 free-tier hard caps from 2026-09-01: https://shattered.io/cloudflare-d1-free-tier-caps-workers-64mib-2026/
* Durable Objects SQLite storage billing: https://developers.cloudflare.com/changelog/2026-01-07-durable-objects-sqlite-storage-billing
* Workers rate-limit binding: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
* Hyperdrive (Workers → Postgres): https://developers.cloudflare.com/workers/databases/connecting-to-databases/ · https://neon.com/docs/guides/cloudflare-hyperdrive
* Cloudflare Pipelines (billing not yet enabled): https://developers.cloudflare.com/pipelines/ · https://blog.cloudflare.com/cloudflare-data-platform/
* Cloudflare Turnstile: https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/ · https://developers.cloudflare.com/turnstile/concepts/widget/
* Cloud Run pricing (free tier 180k vCPU-s, 360k GiB-s, 2M requests; $0.000024/vCPU-s, $0.40/M requests): https://cloud.google.com/run/pricing · https://cloudchipr.com/blog/cloud-run-pricing · https://cloudcostkit.com/guides/gcp-cloud-run-pricing/
* Cloud Run cold starts and CPU boost: https://docs.cloud.google.com/run/docs/tips/general · https://cloud.google.com/blog/products/serverless/announcing-startup-cpu-boost-for-cloud-run--cloud-functions
* Cloud SQL pricing (db-f1-micro about $7.67–10/mo): https://cloud.google.com/sql/pricing · https://www.bytebase.com/dbcost/cloudsql-pricing/ · https://securityboulevard.com/2026/05/google-cloud-sql-pricing-2026-instance-costs-storage-and-what-the-calculator-hides/
* Cloud SQL IAM database authentication: https://cloud.google.com/sql/docs/postgres/iam-authentication · https://docs.cloud.google.com/sql/docs/postgres/iam-logins
* BigQuery pricing (free 10 GB and 1 TB/month; $6.25/TiB): https://cloud.google.com/bigquery/pricing · https://airbyte.com/data-engineering-resources/bigquery-pricing
* Neon plans (free 0.5 GB and 100 CU-h; Launch $0.106/CU-h, $0.35/GB-mo): https://neon.com/docs/introduction/plans · https://vela.run/articles/neon-serverless-postgres-pricing-2026/
* Fly.io pricing and Managed Postgres ($38 Basic): https://fly.io/docs/about/pricing/ · https://fly.io/pricing-update/ · https://fly.io/docs/mpg/
* Render pricing ($7 Starter, $6 Basic Postgres): https://makerkit.dev/pricing-calculator/render · https://kuberns.com/blogs/render-postgres-pricing-setup-limits/
* Railway pricing: https://docs.railway.com/pricing/plans · https://railway.com/pricing

Sync, telemetry and analysis:
* Sync engines compared (PowerSync, ElectricSQL, Replicache): https://kanopylabs.com/blog/electric-sql-vs-powersync-vs-livestore-local-first · https://powersync.com/pricing
* `sendBeacon` and its 64 KiB limit: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon · https://blog.huli.tw/2025/01/06/en/navigator-sendbeacon-64kib-and-source-code/
* DuckDB Postgres extension and Parquet export: https://duckdb.org/docs/current/core_extensions/postgres/overview · https://duckdb.org/docs/current/guides/database_integration/postgres

Security and privacy:
* SSRF prevention in Node (DNS pinning, redirects): https://owasp.org/www-community/pages/controls/SSRF_Prevention_in_Nodejs · https://github.com/jonathanong/ssrf-guard
* EDPB Guidelines 01/2025 on pseudonymisation: https://www.edpb.europa.eu/system/files/2025-01/edpb_guidelines_202501_pseudonymisation_en.pdf · https://www.hunton.com/insights/publications/edpb-advises-on-pseudonymisation-for-gdpr-compliance
* CNIL audience-measurement consent exemption (limits): https://www.cnil.fr/en/sheet-ndeg16-use-analytics-your-websites-and-applications

Repository context: `src/persistence/db.ts`, `src/persistence/LexicalRepository.ts`, `proj-mgmt/epic-3-enterprise-architecture.md`, `docs/research/analogy-scoring.md` (§5–7: designed questions, and the note "log real plays … to re-run this analysis on actual games").

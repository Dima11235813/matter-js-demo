# Cloudflare-native hosting for Lexical Fountain: verification and deeper findings

> Part of [hosting-options.md](../hosting-options.md) (round 2, 2026-10-10): one of three parallel deep dives, written by a research agent and reviewed before committing.

**Date**: 2026-10-10 · **Scope**: the Cloudflare path only (Workers static assets, Hono API on Workers, databases, deploy) · **Method**: read `docs/research/hosting-options.md`, `wrangler.jsonc`, `public/_headers`, `.github/workflows/ci.yml`, all of `server/src/*.ts`, `packages/shared/src/sync.ts`, `src/services/account.ts`, `src/account/syncService.ts`, `src/embeddings/liveEncoder.ts`, `node_modules/@huggingface/transformers/dist/transformers.web.js`; measured `dist/` on disk; ran a CPU micro-benchmark of the API's JavaScript work ([`experiments/hosting-cpu-bench.mts`](../experiments/hosting-cpu-bench.mts), Node 22, desktop CPU); read Cloudflare, Neon, Turso and Supabase pages on 2026-10-10 (each source below lists the page's own "last updated" date). Nothing was deployed. **(unconfirmed)** marks facts not found on an official page.

## 1. Workers static assets (Phase 1: the game without sign-in)

### 1.1 Limits against this repo

| Limit | Free | Paid ($5) | This repo | Verdict |
|---|---|---|---|---|
| Static asset requests | "free and unlimited" [CF-SA] | same [CF-PR] | all page, JS, vocab traffic | $0 at any player count |
| Per-file size | 25 MiB [CF-LIM] | 25 MiB | largest: `ort-wasm-simd-threaded.asyncify-*.wasm` **23,567,050 B = 22.48 MiB** (2.5 MiB headroom); next `vocab.bin` 7.40 MiB | fits; CI guard fails at 24 MiB (`ci.yml` line 88) |
| Files per version | 20,000 [CF-LIM] | 100,000 | `dist/` = 22 files, 34 MB | fits |
| `_headers` | up to 100 rules, 2,000 chars/line; **not applied to responses produced by Worker code** [CF-HDR] | same | 3 rules (`/assets/*` immutable, `/vocab/*` no-cache, `/*` nosniff + Referrer-Policy) | fits; API responses must set their own headers |
| SPA fallback | `not_found_handling: "single-page-application"`: unknown paths get `/index.html` with 200; with compat date ≥ 2025-04-01, browser navigations get the shell **without invoking the Worker** [CF-SPA] | same | `wrangler.jsonc` has it, compat date 2026-09-25 | works; navigations stay free even after a Worker is added |
| Over the free daily request limit | requests matching `run_worker_first` get **429**, assets keep being served [CF-SA] | no daily limit | only `/api/*` would run the Worker | the game never breaks; only sync does |
| Custom domain | Workers Custom Domains need the zone on Cloudflare DNS (from the existing report [CF6], not re-read) | same | optional | — |

### 1.2 The 22.5 MiB ONNX wasm and the MiniLM model (verified in code)

* `transformers.web.js` (v4.2.0) lines 7786–7795: if the app has not set `ONNX_ENV.wasm.wasmPaths`, it sets them to `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNX_ENV.versions.web}/dist/` (`…asyncify.mjs/.wasm`, or the non-asyncify pair on Safari). `src/` never sets `wasmPaths`, `remoteHost` or `localModelPath` (grep over `src/` is empty; `liveEncoder.ts` only calls `pipeline("feature-extraction", model, { dtype })`). So **the wasm is fetched from jsDelivr, the model from `huggingface.co`; the copy Vite emits into `dist/assets/` is never requested** (code reading; not observed in a network log).
* Consequence: the bundled wasm only costs upload size and the 25 MiB headroom. `onnxruntime-web` is a **dev build** (`1.26.0-dev.20260416-b7804b056c`); a future ORT that grows the asyncify wasm past 25 MiB would fail the deploy even though the file is unused. Cheapest fix: add `assets/ort-wasm*.wasm` to `public/.assetsignore` (today it holds only `*.map`), as Task 7.2.5 proposes, after an e2e check of live encoding.
* Third-party runtime dependencies (not Cloudflare's): jsDelivr (wasm, only when a player adds an unknown word) and Hugging Face (~23 MB model). Both are free to us; both are availability and privacy dependencies (decision D9).

## 2. Running the Hono API on Workers

### 2.1 What in `server/src` blocks it today

| File | Workers-incompatible part | Needed change |
|---|---|---|
| `db.ts` | statically imports `@electric-sql/pglite` (in-process Postgres + filesystem; Workers have no persistent disk, 128 MB per isolate [CF-LIM]) next to `pg` `Pool` | split: `db-pglite.ts` (local, tests) and `db-postgres.ts` (`pg.Client` per request, Cloudflare's Hyperdrive pattern [CF-HD-NEON]). `app.ts` imports `./db` with `import type` only, so it stays clean |
| `main.ts` | `@hono/node-server` `serve`, `process.loadEnvFile`, top-level `migrate()` at startup | not used by the Worker; new `server/src/worker.ts` entry |
| `web.ts` | `node:fs`, `serveStatic` from `@hono/node-server` | not used by the Worker (Cloudflare serves `dist/`) |
| `config.ts` | `node:os`, `node:path`, `randomBytes`, `process.env` | not used by the Worker; read `env` bindings instead (`FIREBASE_PROJECT_ID` as a plain var) |
| `app.ts` | `node:crypto` (`createHash`, `randomUUID`) | runs with `compatibility_flags: ["nodejs_compat"]` (`node:crypto` 🟢 supported [CF-NODE]); or swap to `crypto.randomUUID()` + `crypto.subtle.digest` and drop the flag dependency |
| `auth.ts` | none: `jose` 6 (`createRemoteJWKSet`, `jwtVerify`) is Web Crypto + `fetch` based; **no `firebase-admin`** in the repo | none. JWKS is cached per isolate; each cold isolate spends 1 subrequest (Free allows 50 per request [CF-LIM]) |
| `migrations.ts` | runs at process start | move to a `yarn db:migrate` CI step against `DATABASE_URL`, or run lazily once per isolate under `pg_advisory_xact_lock` (no DB secret in CI; 2 extra queries per cold isolate) |

Bundle size is no issue: Workers have 64 MiB uncompressed and, per the page read today, no compressed-size limit; 1 s startup [CF-LIM]. Hono, zod, jose and `pg` (≥ 8.16.3 with `nodejs_compat` [CF-HD-NEON]; repo has `^8.23.0`) all run on Workers.

### 2.2 CPU time: does sync fit Workers Free (10 ms per request)?

Measured JavaScript work per request (JSON parse, zod validation, merge, stringify; warmed V8 on a desktop; **excludes** the `pg` wire-protocol parsing and Hono overhead, so Workers numbers will be higher, and a cold isolate is slower again):

| Request | Body | JS CPU (measured) | Fits Free 10 ms? |
|---|---|---|---|
| Idle 30 s tick (`sync/pull`, nothing new) + RS256 `jwtVerify` (0.08 ms) | < 1 KB | ~0.1 ms | yes, easily |
| Push of 1 word | 2 KB | 0.05 ms | yes |
| Push of 10 mixed records | 15 KB | 0.43 ms | yes |
| **Push of 200 words** (first sync of a long-time local player; `MAX_PUSH_RECORDS` = 200) | 455 KB | **5.5 ms** + ~600 `pg` round trips | **probably not** |
| **Push of 200 analogies** | 126 KB | **9.7 ms** + ~600 `pg` round trips | **no** |
| Pull page of 500 words | 1.1 MB | 2.8 ms | likely yes |

Free plan: 10 ms CPU per invocation; Paid: 30 s default, up to 5 min; I/O waits do not count [CF-LIM][CF-PR]. Whether Free tolerates occasional bursts over 10 ms is **(unconfirmed)**; plan for a 1102 "exceeded resources" error. Fix on Free: the client pushes in pages of ~25 records (`syncService.ts` loops over `MAX_PUSH_RECORDS`; a smaller client page needs no server change), or move to Paid.

### 2.3 Wall time and placement (missing from the existing report)

`sync/push` runs **3 sequential queries per record** (`SELECT … FOR UPDATE`, `nextval`, `INSERT … ON CONFLICT`), so 200 records = ~600 round trips plus BEGIN/COMMIT. A Worker runs at the player's nearest data center while the Neon database sits in one AWS region: from Europe to `us-east` each round trip is ~80–100 ms, so a first sync could take **~50 s** (estimate). Workers have no wall-clock limit on HTTP requests ("Duration: no charge or limit" [CF-PR]); Hyperdrive's 60 s cap is per statement [CF-HD-LIM]. Two fixes, both cheap:
1. `"placement": { "region": "aws:us-east-2" }` (match Neon's region) or `"mode": "smart"` (Smart Placement is on every plan [CF-PLACE]; whether region hints are on Free is unconfirmed). Assets are still served from the edge [CF-PLACE].
2. Make the push set-based (one `SELECT … WHERE key = ANY($3) FOR UPDATE`, one multi-row upsert): 600 round trips become ~4. About 2–3 hours, covered by the existing PGlite tests.

### 2.4 Hyperdrive query caching is ON by default: a correctness bug for this API (missing from the existing report)

Hyperdrive caches eligible read-only query responses for **60 s** (`max_age`) plus 15 s stale-while-revalidate, on by default [CF-HD-CACHE]. Writes, and queries using volatile/stable functions (`now()`, `random()`), are not cached; whether queries inside a transaction are cached is not stated [CF-HD-CACHE]. Affected reads in `app.ts`:

| Query | What a cached result breaks |
|---|---|
| `SELECT user_id FROM identities WHERE issuer=$1 AND subject=$2` | first sign-in: the empty result of the first lookup is cached, the read-back after the insert returns no row → `rows[0].user_id` throws → **500 for up to 75 s** |
| `SELECT user_id FROM devices WHERE device_id=$1` (`requireDevice`) | first sync right after `devices/claim` → **403 "device-not-claimed"** for up to 75 s |
| `sync/pull` `SELECT … WHERE server_seq > $2` | another device's push is invisible for up to a minute (delayed, not lost) |
| `me/export` after `DELETE /me` or new plays | stale export |

**Required**: create the Hyperdrive configuration with `--caching-disabled` (or `wrangler hyperdrive update <id> --caching-disabled`) [CF-HD-CACHE]. Caching would also have counted against nothing useful: cached statements still count toward the Free 100k queries/day [CF-HD-PR].

### 2.5 Other Workers limits that matter for the API

| Limit | Free | Paid | Relevance |
|---|---|---|---|
| Requests/day | 100,000 | no daily limit; 10M/month included, then $0.30/M [CF-PR] | the 30 s poll sets the count (§4) |
| Subrequests per request | 50 | 10,000 [CF-LIM] | TCP sockets (Hyperdrive/`pg`) are not subrequests; they count toward 6 simultaneous connections [CF-LIM]. An HTTP database driver (Neon serverless HTTP, Turso/libSQL over HTTP, Supabase REST) would spend one subrequest per query: **a 200-record push would hit the Free cap** unless statements are batched |
| Memory | 128 MB per isolate [CF-LIM] | same | rules out PGlite in a Worker |
| Env vars | 64 (Free) / 128, 5 KB each [CF-LIM] | — | the Worker needs **no secrets**: `FIREBASE_PROJECT_ID` is public, DB credentials live inside the Hyperdrive config |

## 3. Database options on Cloudflare

### 3.1 Comparison

| Option | Free tier (official) | Gotchas | SQL / code change vs today's Postgres | Paid price |
|---|---|---|---|---|
| **Neon via Hyperdrive** | Neon Free: 1 GB/project, **100 CU-hours/project/month**, autoscale to 2 CU, **scale-to-zero after 5 min, cannot be turned off**, 5 GB egress, 6 h restore, no card [NE-PR]. Hyperdrive Free: 100,000 queries/day (cached or not), resets 00:00 UTC, then errors [CF-HD-PR]; ~20 origin connections [CF-HD-LIM] | **When the 100 CU-hours (or 5 GB egress) run out, compute is suspended until the next billing period** (data kept) [NE-PR]: sync is down for the rest of the month. Wake from idle 500 ms – a few s [NE-LAT]; open idle connections do not keep it awake ("no active queries for 5 minutes") [NE-LIFE]. Caching must be disabled (§2.4); placement (§2.3) | **none** to the SQL; `db.ts` split, `worker.ts`, migrations step. PGlite tests keep covering production SQL | Neon Launch $0.106/CU-hour, $0.35/GB-month, **no monthly minimum**, 500 GB egress [NE-PR]. Hyperdrive on Paid: unlimited queries, no egress charge [CF-HD-PR] |
| **Supabase via Hyperdrive** | 500 MB, 5 GB egress, shared CPU/500 MB RAM, 2 active projects; **paused after 1 week of inactivity** [SB-PR] (undated page) | a week without a signed-in player pauses the database (a restore from the dashboard is needed, **unconfirmed** whether automatic) | none (Postgres) | Pro from $25/month [SB-PR] |
| **D1** (SQLite, Cloudflare) | 5M rows read/day, 100k rows written/day, 5 GB total, 500 MB per database, 10 databases; **50 queries per Worker invocation** [CF-D1-LIM][CF-PR] | **auto-commit only; transactions only as `batch()`**, no interactive BEGIN/COMMIT across awaits [CF-D1-API]: the read-merge-write of `sync/push` (`FOR UPDATE`) cannot be a transaction; 100 bound parameters per query [CF-D1-LIM] | **rewrite**: `uuid`, `timestamptz`, `jsonb`, `CREATE SEQUENCE`/`nextval`, `FOR UPDATE`, `count(*)::text` handling; push redesigned as read-all → merge in JS → batch write; PGlite tests no longer cover production (needs `@cloudflare/vitest-pool-workers`/Miniflare) | included in Workers Paid $5: 25B rows read, 50M written/month, 5 GB [CF-PR] |
| **Durable Objects (SQLite storage)**, one object per user | on Workers Free: 100k requests/day, 13,000 GB-s/day, 5M rows read, 100k written/day, 5 GB [CF-DO-PR] | Version URLs are not generated for Workers with Durable Objects [CF-VER] (the newer Worker Previews provision DO namespaces per Preview [CF-PREV]); exports/deletes per user are natural, cross-user queries (research archive) are not | rewrite to SQLite **and** to a per-user object; synchronous transactions (`transactionSync`) fit the merge well | Paid: 1M requests/month included, +$0.15/M; 400k GB-s; rows as D1 [CF-DO-PR] |
| **Turso** (libSQL) | 100 databases, 5 GB, 500M rows read, 10M written per month, no card [TU-PR] (page shows only "© 2026") | over HTTP from a Worker: each request is a subrequest (50 on Free); interactive transactions over HTTP **(unconfirmed)** | rewrite to SQLite (as D1) | Developer $4.99/month [TU-PR] |

### 3.2 Monthly cost by player count (USD, no domain)

Load model (stated, since the existing report's arithmetic is off; see §6): 30% of MAU sign in; signed-in players have a tab open 40 min/day; one `sync/pull` per 30 s while open (`SYNC_INTERVAL_MS`), a push only when something changed (`syncService.ts` skips empty pushes). Per tick ≈ 2 queries (identity lookup + pull) via Hyperdrive.

| | 0 players (now) | 1k MAU | 10k MAU |
|---|---|---|---|
| API requests/day | ~0 | 300 × 80 = **~24k** | **~240k** (over Free's 100k/day) |
| Hyperdrive queries/day | ~0 | **~50–60k** (Free cap 100k) | **~500k+** (needs Paid) |
| Neon awake hours/month (0.25 CU) | ~0 | depends on spread: players across ~14–18 h/day → **~105–135 CU-h** (Free: 100) | ~24 h/day → **~180 CU-h** |
| **Static only (Phase 1)** | **$0** | **$0** | **$0** |
| **Workers + Hyperdrive + Neon** | **$0** | **$0 if Neon stays under 100 CU-h**; otherwise Neon Free **suspends sync for the rest of the month**, or Launch ≈ **$11–14** (all CU-hours billed at $0.106) | Workers Paid **$5** (≈7M requests/month < 10M included; CPU ≈ 7M × ~2 ms ≈ 14M ms < 30M included) + Neon Launch **≈ $19** (180 CU-h; cap autoscaling at 0.25–0.5 CU) = **≈ $24** |
| Same, with sync on change/focus instead of a 30 s timer | $0 | **$0** (requests and awake hours drop several-fold; estimate) | $5 + Neon ~$5–15 (estimate) |
| **Workers + D1** (after the SQL rewrite) | **$0** | **$0** (well inside 5M reads/100k writes a day; push pages ≤ ~15 records for the 50-queries cap) | **$5** (Workers Paid includes D1 at this size) |
| **Workers + Durable Objects SQLite** | $0 | $0 | ~$5–6 (DO requests over 1M at $0.15/M; estimate) |
| Supabase Free via Hyperdrive | $0 (but pauses after an idle week) | $0 | $5 + $25 Pro = $30 |

**Reading**: Neon is the cheapest in *effort* (no SQL rewrite) and $0 now; the 30 s poll is what makes it cost money at 1k–10k. D1 is the cheapest in *dollars* at every scale but costs a rewrite and loses transactional merges and the PGlite test coverage.

## 4. Deploy effort

| | GitHub Actions + wrangler (what `ci.yml` has) | Workers Builds (Cloudflare's GitHub app) |
|---|---|---|
| Credentials | an API token from the "Edit Cloudflare Workers" template + account id as CI secrets; **no OIDC** mentioned for Cloudflare [CF-GHA] | none in GitHub (the app is authorised once) |
| Gate on our tests | yes: `deploy-production` `needs: [verify, e2e]` and deploys the tested `dist` artifact | no built-in wait for GitHub checks **(unconfirmed)**; builds on Cloudflare (2 vCPU, 8 GB, 20 min timeout, 3,000 min/month free, 1 concurrent build) [CF-WB-LIM]; install scripts likely on (DEP-03 conflict, **unconfirmed**) |
| Branch previews | `wrangler versions upload --preview-alias <branch>` → `<alias>-lexical-fountain.<sub>.workers.dev` (alias + name ≤ 63 chars; last 1,000 aliases kept; public) [CF-VER]; or `wrangler preview` (Worker Previews, Wrangler ≥ 4.135.0; repo has **4.141.0**) [CF-PREV] | "Enable Preview Builds" runs `npx wrangler preview` on every non-production branch and comments on the PR [CF-WB-BR] |
| Preview isolation | Worker Previews do **not** inherit production bindings/vars/secrets; define a `previews` block; 100 Previews per Worker on Free, 500 on Paid; public by default with `X-Robots-Tag: noindex`; Cloudflare Access can protect them [CF-PREV]. For API previews, bind a separate Hyperdrive config to a **Neon branch** (Free: up to 10 branches [NE-PR]) — whether Previews accept a different Hyperdrive binding is not stated **(unconfirmed)** | same |
| Worker secrets | `wrangler secret put` (deploys a new version), `wrangler versions secret put`, `--secrets-file` on `deploy`/`versions upload` (≤ 100 per request), or the dashboard; visible as `env` or `process.env` with `nodejs_compat` [CF-SEC]. **This API needs none** (§2.5) | same |
| CI secrets this path needs | `CLOUDFLARE_API_TOKEN` (deploy) and, if migrations run in CI, `DATABASE_URL` (Neon direct, unpooled) | `DATABASE_URL` only if migrations run in the build |
| Effort | Phase 1: ~1 h agent (route B edit) + ~1 h owner. Phase 2 adds a migrate step and an `/api/v1/health` smoke check | ~0.5 h owner, but loses the e2e gate |

Recommendation: keep GitHub Actions (it already gates on e2e); add a `develop`-branch job with `wrangler versions upload --preview-alias develop` if the owner wants a phone-testable preview without deploying production.

## 5. Phase 2 code changes and effort (Workers + Hyperdrive + Neon)

| # | File | Change | Hours |
|---|---|---|---|
| 1 | `server/src/db.ts` → `db-pglite.ts` + `db-postgres.ts` (or keep `db.ts` for the interface) | no PGlite import reachable from the Worker; Postgres impl over one `pg.Client` per request, `BEGIN/COMMIT` on the same client | 1–1.5 |
| 2 | `server/src/worker.ts` (new) | `fetch(req, env, ctx)`: client on `env.HYPERDRIVE.connectionString`, `createApp({db, verifier})`, `ctx.waitUntil(client.end())`; verifier created once per isolate; `Cache-Control: no-store` on API responses (`_headers` does not apply) | 1.5–2 |
| 3 | `wrangler.jsonc` | `main`, `compatibility_flags: ["nodejs_compat"]`, `assets.run_worker_first: ["/api/*"]`, `hyperdrive` binding, `vars.FIREBASE_PROJECT_ID`, `placement`; also fix the stale "proxy the API to Cloud Run" comment | 0.5 |
| 4 | `server/src/migrations.ts` + root `package.json` (`db:migrate`) + `.github/workflows/ci.yml` | migrations as a CI step before `wrangler deploy` (or lazy with an advisory lock); smoke test `curl /api/v1/health` → `"db":"postgres","devAuth":false` | 1.5–2 |
| 5 | `server/test/worker.test.ts` (new), `server/package.json` (`@cloudflare/workers-types` dev dep), `server/tsconfig.json` | handler test with stub env; typecheck of the Worker entry | 1–2 |
| 6 | `src/account/syncService.ts` | push in pages of ~25 (Free CPU) — or accept Workers Paid | 0.5 |
| 7 (optional) | `server/src/app.ts` | set-based push (fewer round trips, §2.3) | 2–3 |
| 8 (optional) | `src/services/account.ts` | sync on change, focus and `online` instead of every 30 s (keeps Neon Free and Workers Free longer) | 1–2 |
| 9 | `docs/setup/accounts-and-deploy.md`, human-todo items | Hyperdrive with `--caching-disabled`, Neon role/unpooled string, Firebase authorised domain | 1 |
| | **Total** | | **~8–12 h agent** (+ 2–3 h for 7–8), **~1–2 h owner** |

Owner steps: Neon project (US East, decision D3), a dedicated role, the **unpooled** connection string [CF-HD-NEON]; Hyperdrive config created in the dashboard (connection string pasted in the form, not a command line, SEC-08) **with caching disabled**; Firebase authorised domain for the workers.dev host; `DATABASE_URL` as a `production` environment secret if migrations run in CI.

D1 instead of Neon: add ~10–16 h (SQL rewrite, push redesign without interactive transactions, Miniflare-based tests), in exchange for $0 → $5 flat at 10k.

## 6. What the existing report (`hosting-options.md`) gets wrong or leaves out

1. **Hyperdrive query caching** (on by default, 60 s) is not mentioned; with this API it causes a 500 on first sign-in and a 403 on the first sync after a device claim. Phase 2 must create the config with `--caching-disabled` (§2.4).
2. **Neon Free exhaustion behaviour** is not mentioned: running out of the 100 CU-hours suspends compute until the next billing period (sync down, data kept) [NE-PR]. "$0 expected at 1k MAU" is optimistic with the 30 s poll; it is $0 only if signed-in play is concentrated in under ~13 h/day, otherwise ~$11–14 on Launch.
3. **Load arithmetic** (§2 item 3): "30% of 1k MAU for 40 minutes a day" at one request per 30 s is 300 × 80 = **24k requests and ~50k queries a day**, not 12k and 25k. Still under the Free caps at 1k; at 10k it is ~240k requests/day, over Workers Free's 100k/day, so 10k MAU needs Workers Paid regardless of CPU.
4. **Wall time / placement** of `sync/push` (3 queries per record, ~600 for a full page) is not discussed; a Worker far from the database makes a first sync take tens of seconds (§2.3).
5. **First-sync CPU**: a 200-record push measured 5.5–9.7 ms of JS alone, so the 10 ms Free limit is likely exceeded on first sync; the report only says "measure".
6. **D1 rejection** is right but understated: besides the SQL rewrite, D1 has no interactive transactions and only 50 queries per invocation on Free.
7. Minor: the "429 when over the limit" in Group 2 refers to the daily request limit, not CPU (CPU overrun is an exceeded-resources error); the Workers script-size note can drop the old compressed limit (the limits page now lists none, 64 MiB uncompressed); Workers Builds now uses **Worker Previews** (`wrangler preview`, per-branch URLs with separate bindings) rather than only version aliases [CF-WB-BR][CF-PREV]; `wrangler.jsonc` still says the API would be proxied to Cloud Run.
8. Confirmed as stated: assets free and unlimited; 25 MiB per file; 20,000 files (Free); Workers Free 100k requests/day and 10 ms CPU; Paid $5 with 10M requests and 30M CPU-ms; Hyperdrive Free 100k queries/day; Neon Free 1 GB/100 CU-h/5 GB egress/5-min suspend/6 h restore/no card, Launch $0.106/CU-h; Workers Builds 3,000 min/month; `pg` > 8.16.3 with `nodejs_compat`; the wasm comes from jsDelivr and is unused in `dist/`; no code change for Phase 1.

## 7. Risks

* **Neon free-quota cliff** (sync stops mid-month) — mitigate with change-driven sync, compute capped at 0.25 CU, a usage alert, or Launch with no minimum.
* **Cache bug** if Hyperdrive caching stays on (§2.4).
* **10 ms CPU on Free** for first syncs — smaller push pages or Paid ($5).
* **Single-region DB latency** for players outside the US — placement + set-based push.
* **ORT wasm growth** past 25 MiB on a dependency bump — `.assetsignore` it.
* **Vendor concentration**: hosting, DNS (if a domain), DB proxy all on Cloudflare; the exit (`yarn start` on Fly.io or a VPS) stays intact because `main.ts`/`web.ts` are untouched.
* **Previews are public** by default; a preview wired to the production database could write real data — bind previews to a Neon branch or leave the API out of previews.

## Sources (read 2026-10-10; date = the page's own "last updated")

* [CF-LIM] Workers limits (Free/Paid CPU, subrequests 50/10,000, 6 connections, 128 MB, 64 MiB script, 1 s startup, 25 MiB asset, 20,000/100,000 files, env vars) — updated 2026-10-08: https://developers.cloudflare.com/workers/platform/limits/
* [CF-PR] Workers pricing (Free 100k/day, 10 ms; Paid $5, 10M req, 30M CPU-ms, +$0.30/M, +$0.02/M CPU-ms; static assets free; Hyperdrive and D1 tiers) — updated 2026-10-02: https://developers.cloudflare.com/workers/platform/pricing/
* [CF-SA] Static assets billing and limitations (free and unlimited; `run_worker_first` 429 over the free limit) — updated 2026-04-23: https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
* [CF-HDR] Static assets headers (`_headers` 100 rules, 2,000 chars, not applied to Worker responses) — updated 2026-09-22: https://developers.cloudflare.com/workers/static-assets/headers/
* [CF-SPA] SPA routing (index.html 200, navigation requests skip the Worker from compat date 2025-04-01) — updated 2026-08-25: https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
* [CF-NODE] Node.js compatibility (crypto, fs, path, net supported; os partial; tls partial) — updated 2026-08-12: https://developers.cloudflare.com/workers/runtime-apis/nodejs/
* [CF-PLACE] Placement (Smart Placement on all plans; region/host/hostname hints; assets still from the edge) — updated 2026-04-23: https://developers.cloudflare.com/workers/configuration/placement/
* [CF-HD-PR] Hyperdrive pricing (Free 100k queries/day incl. cached, resets 00:00 UTC; Paid unlimited; no egress fee) — updated 2026-06-18: https://developers.cloudflare.com/hyperdrive/platform/pricing/
* [CF-HD-LIM] Hyperdrive limits (~20/~100 origin connections, 60 s statement, 10 min idle) — updated 2026-06-09: https://developers.cloudflare.com/hyperdrive/platform/limits/
* [CF-HD-CACHE] Hyperdrive query caching (on by default, max_age 60 s, SWR 15 s, `--caching-disabled`) — updated 2026-07-05: https://developers.cloudflare.com/hyperdrive/concepts/query-caching/
* [CF-HD-NEON] Hyperdrive + Neon (unpooled string, dedicated role, `pg` > 8.16.3, `nodejs_compat`, client per request) — updated 2026-04-21: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/neon/
* [CF-D1-LIM] D1 limits (10 DBs, 500 MB/DB, 5 GB, 50 queries per invocation on Free, 100 params) — updated 2026-04-21: https://developers.cloudflare.com/d1/platform/limits/
* [CF-D1-API] D1 Database API (auto-commit; `batch()` is the transaction) — updated 2026-06-22: https://developers.cloudflare.com/d1/worker-api/d1-database/
* [CF-DO-PR] Durable Objects pricing (SQLite DOs on Free; daily caps; Paid included amounts) — updated 2026-09-30: https://developers.cloudflare.com/durable-objects/platform/pricing/
* [CF-VER] Version URLs and aliases (`--preview-alias`, public, no DO Workers, 63 chars, 1,000 aliases) — updated 2026-09-22: https://developers.cloudflare.com/workers/configuration/previews/
* [CF-PREV] Worker Previews (`wrangler preview` ≥ 4.135.0, separate bindings, 100/500 per Worker, public + noindex) — updated 2026-09-24: https://developers.cloudflare.com/workers/previews/
* [CF-WB-BR] Workers Builds branches (production branch, Enable Preview Builds → `npx wrangler preview`, PR comments) — updated 2026-10-01: https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
* [CF-WB-LIM] Workers Builds limits (3,000/6,000 min, 1/6 concurrent, 20 min, 2/4 vCPU, 8 GB) — updated 2026-05-29: https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/
* [CF-GHA] GitHub Actions with wrangler-action (API token + account id; no OIDC mentioned) — updated 2026-09-18: https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
* [CF-SEC] Worker secrets (`secret put`, `versions secret put`, `--secrets-file`, `process.env` with nodejs_compat) — updated 2026-07-03: https://developers.cloudflare.com/workers/configuration/secrets/
* [NE-PR] Neon pricing (Free limits, suspension until the next period when CU-hours/egress run out, Launch prices, no minimum) — read 2026-10-10 (no date on page): https://neon.com/pricing
* [NE-LIFE] Neon compute lifecycle (idle after 5 min with no active queries) — https://neon.com/docs/introduction/compute-lifecycle
* [NE-LAT] Neon connection latency (wake 500 ms to a few seconds) — https://neon.com/docs/connect/connection-latency
* [SB-PR] Supabase pricing (Free 500 MB, 5 GB egress, pause after 1 week, 2 projects; Pro from $25) — no date on page: https://supabase.com/pricing
* [TU-PR] Turso pricing (Free 5 GB, 500M reads, 10M writes; Developer $4.99) — only "© 2026" on page: https://turso.tech/pricing
* Changelog for branch preview URLs (2025-07-23): https://developers.cloudflare.com/changelog/2025-07-23-workers-preview-urls/

Repo evidence: `server/src/{app,auth,config,db,main,migrations,web}.ts`, `packages/shared/src/sync.ts` (`MAX_PUSH_RECORDS` 200, `MAX_PULL_RECORDS` 500), `src/services/account.ts` (`SYNC_INTERVAL_MS` 30,000), `src/account/syncService.ts`, `wrangler.jsonc`, `public/_headers`, `public/.assetsignore` (`*.map`), `.github/workflows/ci.yml` (24 MiB guard, `deploy-production`), `node_modules/@huggingface/transformers/dist/transformers.web.js` lines 7786–7795, `node_modules/onnxruntime-web` 1.26.0-dev.20260416, `node_modules/wrangler` 4.141.0, `dist/` (22 files, 34 MB, built 2026-10-05). Benchmark script: `docs/research/experiments/hosting-cpu-bench.mts`.

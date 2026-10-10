# Hosting Options After SiteGround: Lowest Cost for Acceptable Effort

**Status**: research complete 2026-10-10; recommendation awaits the owner's decision · **Drives**: [Epic 7 · Task 7.6.3](../../proj-mgmt/epic-7-delivery-operations.md) (choose the next host), and revisits decision D1 in [platform-plan.md](platform-plan.md) §5 · **Method**: repo measurements plus vendor pricing and docs pages read on 2026-10-10 (no code was run against any host)

> **Provenance**: prices and limits were read through an automated page reader on 2026-10-10. Facts that came only from third-party articles, or that could not be confirmed on an official page, are marked **(unconfirmed)**. Re-check a price before paying for it. Several vendors changed their free tiers in 2026 (Render, Hetzner, Oracle, Fly.io snapshots); see §3.4.

## 1. Question

The game ran on SiteGround Node.js hosting from 2026-10-05 to 10-09, then the owner dropped it (human-todo 12, Epic 7 · Task 7.6.2). The owner's goal: **"research an appropriate host given our requirements and our goal is to minimize cost but balance effort and maintenance"**.

Which host (or combination) serves the game to family and friends on phones now, can carry optional sign-in and sync later, and stays cheap at about 1,000 monthly players, without a server to patch?

## 2. Method

1. **Requirements from the repo**: read `server/src/*`, `package.json`, `vite.config.ts`, `wrangler.jsonc`, `public/_headers`, `.github/workflows/ci.yml`, `src/services/account.ts`, `src/embeddings/liveEncoder.ts`, and the earlier plans ([platform-plan.md](platform-plan.md), [delivery-cicd.md](delivery-cicd.md), [backend-sync-telemetry.md](backend-sync-telemetry.md), [docs/setup/accounts-and-deploy.md](../setup/accounts-and-deploy.md)). Measured `dist/` (the 2026-10-05 build) and `public/vocab/` on disk.
2. **Traffic model**: the one from [delivery-cicd.md](delivery-cicd.md) §2, about **12 MB per monthly player** (1.5 cold loads of about 7.8 MB brotli; repeat visits revalidate). So about 0.25 GB/month now (about 20 play-testers), **about 12 GB/month at 1k MAU**, and about 120 GB at 10k.
3. **API load model** (only when sign-in is on): a signed-in tab syncs every 30 s (`SYNC_INTERVAL_MS`), so about 120 API requests and about 240 database queries per open hour (`requireUser` looks up the identity, then the pull query). If 30% of 1k MAU sign in for 40 minutes a day, that is about 12k requests and 25k queries a day.
4. **Vendor research**: official pricing, limits and docs pages for 13 options in three groups (static only; static plus serverless API; always-on Node host), with third-party articles only where official pages hid the numbers.

## 3. Findings

### 3.1 What the game actually needs from a host

| Requirement | Evidence in the repo | Consequence for the host |
|---|---|---|
| Static files: `dist/` is 22 files, 34 MB on disk | `du dist`: 22.5 MiB `ort-wasm-simd-threaded.asyncify-*.wasm`, 7.4 MiB `vocab/vocab.bin`, 200 KB `vocab.json`, JS chunks (startup `index-*.js` 504 KB, `WorldContainer` 1.2 MB, `SpaceWorld` 552 KB, `transformers.web` 556 KB) | Any static host works, but the **largest file is 22.5 MiB**: within Cloudflare's 25 MiB per-file cap (the CI guard fails above 24 MiB) |
| The 22.5 MiB wasm is never downloaded by players | transformers.js sets `wasmPaths` to `cdn.jsdelivr.net` (`transformers.web.js` line 7788) unless the app overrides it, and the app does not; Epic 7 · Task 7.2.5 records the same | It costs no bandwidth today. It can be dropped from the upload with one `.assetsignore` line (Task 7.2.5), after an e2e check of live word encoding |
| The MiniLM model (~23 MB) comes from `huggingface.co` | `env.remoteHost = "https://huggingface.co/"`; `LiveEncoder` loads `Xenova/all-MiniLM-L6-v2` (q8) only when a player adds an unknown word | Not billed to us. Self-hosting it is decision D9 (privacy vs bandwidth) |
| Bandwidth: about 7.8 MB per cold visit, dominated by `vocab.bin` (int8 vectors barely compress) | [delivery-cicd.md](delivery-cicd.md) §1 measurements; `_headers` gives `/vocab/*` `no-cache` (cheap 304s on repeat visits) | A host that bills bandwidth or caps it at a few GB a month runs out fast: 5 GB is about 640 cold visits |
| Cache headers | `public/_headers` (Cloudflare format): `/assets/*` immutable for a year, `/vocab/*` `no-cache`, `nosniff`, `Referrer-Policy`; `server/src/web.ts` mirrors them for Node hosts | The host must let us set headers (GitHub Pages cannot) |
| Single-page-app fallback | `wrangler.jsonc` `not_found_handling: "single-page-application"`; `web.ts` returns `index.html` for unknown paths | Needs a rewrite rule or SPA mode |
| **The game needs no server at all** | Sign-in appears only when the build has the `VITE_FIREBASE_*` values (`bootAccount`); the production build never calls `/api` otherwise (`detectDevPersonas` runs only in dev and e2e builds). Embeddings, scoring, and saves run in the browser (IndexedDB) | **Static hosting alone is the complete game.** The API is only for optional sign-in, sync, export and delete |
| The API (when wanted): Hono app on `/api/v1`, same origin | `server/src/app.ts`: `health`, `devices/claim`, `sync/push` (512 KB body cap, a transaction per batch), `sync/pull`, `me/export`, `DELETE /me`. `auth.ts` verifies Firebase ID tokens against Google's JWKS with `jose` (no service-account key) | Any runtime that runs Hono. `createApp({db, verifier})` is runtime-neutral apart from `node:crypto` (`createHash`, `randomUUID`) |
| **Persistent state: only the API's database** | `db.ts`: PGlite (in-process, needs a **persistent disk** at `PGLITE_DATA_DIR`) or Postgres via `DATABASE_URL` (`pg` pool). Without either, production runs PGlite in memory and loses accounts on restart (`config.ts` warns) | Either a host with a durable volume (for PGlite) or a hosted Postgres. Serverless runtimes rule out PGlite |
| Schema | `migrations.ts`: plain Postgres (`jsonb`, `uuid`, `timestamptz`, a sequence, `SELECT … FOR UPDATE`), applied at startup | Postgres-compatible databases keep the code and the PGlite-based unit tests valid; SQLite (D1) would mean rewriting the SQL |
| Build | `yarn build` = `vite build` (~10 s locally; vocabulary committed); CI already builds, tests, and keeps the artifact | Any host that accepts a pre-built folder, or runs `yarn build` |
| Deploy pipeline already written | `ci.yml` `deploy-production` (gated by `DEPLOY_ENABLED`): GitHub OIDC → GCP Workload Identity Federation → Secret Manager `cloudflare-deploy-token` → `wrangler deploy` of the e2e-tested `dist`, plus a smoke test; `wrangler.jsonc` (static assets, SPA fallback) | Cloudflare Workers needs **no code change** to go live; only owner setup |
| Users | Family and friends on phones now; maybe a public launch later; children may play (local-only, decision D5) | No personal data reaches the host until sign-in is switched on. Cold starts on page load would hurt phone play-tests |

### 3.2 Options compared

Costs are USD per month for hosting plus the database, with no custom domain. "Now" is about 20 play-testers (about 0.25 GB); "1k MAU" is about 12 GB of static transfer plus the API load in §2.

**Group 1: static only** (the whole game, no sign-in)

| Option | Now | 1k MAU | Free-tier limits and gotchas | Can `/api` be added later? | Setup effort / upkeep | Code + CI change |
|---|---|---|---|---|---|---|
| **Cloudflare Workers static assets** | **$0** | **$0** (also $0 at 10k and 100k) | Static asset requests are "free and unlimited"; 25 MiB per file; 20,000 files per version (Free) [CF1][CF2]. Custom domains need the zone on Cloudflare DNS; TLS is automatic [CF6] | **Yes, same origin**: `run_worker_first: ["/api/*"]` invokes the Worker only for the API; asset requests stay free [CF1][CF7] | Low / none (no server) | **None**: `wrangler.jsonc`, `_headers`, and the deploy job exist. Optional: the token route in §4.2 |
| Cloudflare Pages | $0 | $0 | Same 25 MiB file cap and 20,000 files; 500 builds/month on Free [CF5] | Yes, with Pages Functions | Low / none | A different deploy command; Cloudflare puts new features into Workers ([delivery-cicd.md](delivery-cicd.md) §2) |
| GitHub Pages | $0 | $0 | 1 GB site, 100 GB/month **soft** bandwidth, 10 builds/hour; not for commercial use [GH1]. No custom headers or SPA fallback (unconfirmed on the limits page; documented in [delivery-cicd.md](delivery-cicd.md)) | No (cross-origin API with CORS only) | Low / none | A Pages deploy job; a `404.html` SPA trick; `_headers` ignored |
| Netlify Free | $0 | **~$9** (Personal) | 300 credits/month: bandwidth 20 credits/GB, **each production deploy 15 credits** [NL1]. 1k MAU = 240 credits of bandwidth plus deploys: over the cap. When credits run out, production deploys pause until the cycle resets [NL2] | Yes (functions, proxy rewrites) | Low / none | A `netlify.toml` and deploy job |
| Vercel Hobby | $0 | $0 | 100 GB Fast Data Transfer, 1M requests, 1M function invocations; **personal, non-commercial use only**; over-limit features wait 30 days [VC1] | Yes (functions) | Low / none | A `vercel.json` and deploy job; Pro is $20 per seat if the game ever earns money (decision D4) |
| Firebase Hosting | $0 (Spark) | ~$0.20 (Blaze) | Spark: 10 GB stored, **360 MB/day** transfer (about 46 cold visits a day); Blaze: $0.15/GB after that [FB1] | Yes (`rewrites` to Cloud Run) | Low / none; Blaze needs a card | A `firebase.json` and deploy job. At 10k MAU about $16, at 100k about $180 |

**Group 2: static plus a serverless API** (sign-in and sync on)

| Option | Now | 1k MAU | Free-tier limits and gotchas | Persistent storage | Setup effort / upkeep | Code + CI change |
|---|---|---|---|---|---|---|
| **Cloudflare Workers (static + Hono API in the same Worker) + Neon Free via Hyperdrive** | **$0** | **$0** expected; ceiling ~$5 (Workers Paid) + Neon usage | Workers Free: 100,000 requests/day, **10 ms CPU per request** [CF3][CF4]; over the limit, `/api` requests get 429 (assets keep working) [CF1]. Hyperdrive is on Free with 100,000 queries/day [CF8]. Neon Free: 1 GB per project, **100 CU-hours/month**, 5 GB egress, suspends after 5 min idle (no card) [NE1]; resumes in a few hundred ms (unconfirmed, [NE2]); 6-hour restore window [NE1] | Hosted Postgres (Neon); PGlite cannot run in a Worker | Medium once (Neon, Hyperdrive, Firebase) / low (no server, managed DB) | A Worker entry, a PGlite-free DB module, migrations moved to a CI step, `wrangler.jsonc` bindings (§4.3) |
| Cloudflare Workers + D1 | $0 | $0 | D1 Free: 5M rows read and 100k written per day, 5 GB; queries stop when the daily cap is hit [CF9] | D1 (SQLite) | Medium / low | **Rewrite the SQL** for SQLite (no `jsonb`, sequences, `FOR UPDATE`, `uuid`); PGlite tests no longer cover production SQL. Rejected |
| GCP Cloud Run + Neon Free (the 2026-09-25 plan, D1) | $0 | $0 | 2M requests, 180,000 vCPU-s, 360,000 GiB-s, 1 GB egress (North America) free per month [GC1]; Artifact Registry 0.5 GB free [GC1]; scale to zero means Node cold starts (the server starts through `tsx`; not measured); a billing account (card) is required (unconfirmed) | Neon (or Cloud SQL, ~$10) | **High** once (billing, Workload Identity, Artifact Registry, Dockerfile, a Worker proxy or Firebase rewrite) / low | Dockerfile, deploy job, `/api` proxy route in the Worker |
| Vercel or Netlify functions + Neon | $0 | $0–9 | Vercel Hobby: non-commercial; Netlify: credits as above | Neon | Medium / low | A functions adapter for Hono plus the same DB split as the Worker option |
| Supabase (as the database) | $0 | $0 | 500 MB, 5 GB egress; **free projects pause after 1 week of inactivity** [SB1]: an idle week between family play-tests would pause sync | Hosted Postgres | Medium / low | Same as Neon |

**Group 3: always-on Node hosts** (run `yarn start` unchanged: game + API on `PORT`, PGlite on a disk)

| Option | Now | 1k MAU | Free-tier limits and gotchas | PGlite on a disk? | Setup effort / upkeep | Code + CI change |
|---|---|---|---|---|---|---|
| **Fly.io** (1 machine, shared-cpu-1x 512 MB, 1 GB volume) | **~$3.90** | **~$4.10** | No free tier: a 2-hour / 7-day trial, then a card [FL1]. 512 MB machine $3.69, volume $0.15/GB, outbound $0.02/GB (NA/EU), shared IPv4 free, daily snapshots kept 5 days ($0.08/GB after the first 10 GB) [FL1]. A volume lives on one host: data since the last snapshot is lost if it fails [FL2] | Yes | Low once / low (Fly patches the host and issues TLS) | A Dockerfile (or `fly launch`), `fly.toml`, a deploy job with a Fly deploy token; app code unchanged |
| Render | $0 (Free) / $7.25 (Starter + disk) | ~$8.30 | Free web services **spin down after 15 min (about 1 min to wake)** and cannot have disks [RD1]. Included bandwidth was cut 20× on 2026-08-01: **Hobby 5 GB**, then $0.15/GB [RD2][RD3]. Starter $7, disk $0.25/GB (third-party [RD4]) | Starter only | Low / low | Settings only (build `yarn build`, start `yarn start`, disk at `PGLITE_DATA_DIR`) |
| Railway (Hobby) | ~$5–8 | ~$6–9 | $5/month includes $5 of usage; RAM $10/GB-month, CPU $20/vCPU-month, volume $0.15/GB, egress $0.05/GB [RW1]. A 512 MB always-on service alone uses the $5 credit | Yes (5 GB cap on Hobby) | Low / low | Settings only |
| Koyeb | $0 | $0–29 | One free service (512 MB, 0.1 vCPU, Frankfurt or Washington), scales to zero after an hour; free Postgres limited to 5 active hours; card check; paid plan $29/month [KY1] | Not on the free service (unconfirmed) | Low / low | Settings only; 0.1 vCPU is likely too slow for PGlite plus compression (unmeasured) |
| DigitalOcean App Platform | $0 static / ~$12 with API | ~$12 | Free static sites get **1 GiB outbound per app** (about 130 cold visits); the $5 container has 50 GiB; no persistent volumes listed; a dev database is $7 [DO1] | No (needs `DATABASE_URL`) | Low / low | Settings only |
| Hetzner CX23 VPS (+ Caddy or Coolify) | ~€6 (~$7) | ~€6 | **€5.49 since the 2026-06-15 price rise** (was €3.99) plus €0.50 primary IPv4, excl. VAT; 2 vCPU, 4 GB, 40 GB, 20 TB traffic in the EU [HZ1][HZ2]. Backups cost extra (about 20% of the server price, unconfirmed) | Yes | **High** once and **ongoing**: OS updates, Node upgrades, firewall, TLS renewals (Caddy automates them), off-box backups, monitoring | systemd or Docker setup, an SSH deploy job, a backup script |
| Oracle Cloud Always Free (Ampere A1) | $0 | $0 | Allowance **halved on 2026-06-15** (4 OCPU/24 GB → 2/12) without an announcement; idle instances (< 20% CPU, network and memory at p95 over 7 days) may be reclaimed [OC1][OC2]; card required for sign-up (unconfirmed) | Yes | **High** / high (a VPS like Hetzner, plus the risk of silent changes or reclamation) | Same as Hetzner |

### 3.3 Cost estimate for the leading options

| Scale | Cloudflare static only | + API in the Worker, Neon Free | Fly.io all-in-one | Cloud Run + Neon (old plan) |
|---|---|---|---|---|
| Now (~20 players) | $0 | $0 | ~$3.90 | $0 |
| 1k MAU (~12 GB, ~12k API requests/day) | $0 | $0 (well under 100k requests and queries a day) | ~$4.10 | $0 |
| 10k MAU (~120 GB) | $0 | ~$5 (Workers Paid, for CPU headroom) + Neon: $0, or Launch at $0.106/CU-hour [NE1] | ~$6–8 (bandwidth $2.40; probably a larger machine) | ~$0–5 + Neon |
| Worst case for the database | — | Neon awake around the clock at 0.25 CU = 180 CU-hours ≈ **$19/month** on Launch (computed from [NE1]) | — | same |
| Optional domain | ~$10.46/year for `.com` at Cloudflare Registrar, at cost (third-party figures $9.15–10.46, [DM1]) | same | same | same |

**The database is the only number that can grow.** The 30-second sync poll keeps Neon awake whenever anyone is signed in: Free's 100 CU-hours cover about 400 awake hours at 0.25 CU, roughly 13 hours a day. Syncing on change and on tab focus instead of on a timer would keep the bill at $0 for longer (roadmap item for the owner).

### 3.4 Free tiers that changed in 2026 (why prices must be re-checked)

* **Render**, 2026-08-01: included outbound bandwidth cut 20× (Hobby 100 GB → 5 GB, Pro 500 GB → 25 GB) [RD2][RD3]. One month of 1k MAU would exceed it.
* **Hetzner**, 2026-06-15: CX23 €3.99 → €5.49, CAX11 €4.49 → €5.99; AMD lines up to +176% [HZ1][HZ2].
* **Oracle**, 2026-06-15: Always Free A1 halved, discovered from documentation diffs [OC1].
* **Fly.io**, January 2026: volume snapshots began to be billed (first 10 GB free) [FL1][FL3].
* **Netlify**: credit pricing; free-plan users reported production deploys paused when credits ran out, and a mid-2026 bug that paused deploys with credits left [NL2].

## 4. Recommendation

**Phased: Cloudflare Workers now (static, $0), the API in the same Worker with Neon when sign-in opens to real players ($0 expected), and Fly.io as the exit if that port goes badly.**

### 4.1 Why

* **Now, static on Cloudflare Workers** is the only option that is $0 at every scale considered, has no server, no sleep or cold start for the page, keeps our cache headers and SPA fallback, and is **already wired in the repo** (`wrangler.jsonc`, `public/_headers`, `ci.yml`). The game is complete without the API, so the family keeps playing exactly as on SiteGround minus sign-in. Children's play stays local: nothing personal reaches the host.
* **Later, the API inside the same Worker** keeps the same origin with no proxy, costs $0 at our scale and about $5 at 10k MAU, and has nothing to patch. Postgres via Hyperdrive keeps every SQL statement, the merge code, and the PGlite unit tests as they are. The code is already shaped for it: `createApp({db, verifier})` takes its database and verifier as arguments.
* **Runner-up 1: Fly.io all-in-one (~$4/month).** It runs `yarn start` unchanged with PGlite on a volume, the SiteGround model at about a third of the effort of a VPS. It lost because it bills from day one for a sync feature nobody uses yet, a volume lives on a single host (snapshots are daily), and the 7.8 MB vocabulary is served from one region instead of a CDN. It stays the **exit**: if the Worker port runs into trouble, Fly hosts the existing server in an afternoon.
* **Runner-up 2: Cloud Run + Neon (the 2026-09-25 plan, D1).** Also $0, and it runs the Node server unchanged, but it needs the most setup (a GCP billing account, Workload Identity, Artifact Registry, a Dockerfile, a Worker proxy for `/api`), and Node cold starts after idle periods. With the API in the Worker, GCP is not needed for hosting at all.
* **Rejected**: Render (5 GB bandwidth since August, a sleeping free tier, $7+ to keep a disk), Netlify (credits run out at about 1k MAU), Vercel Hobby (non-commercial clause; fine only while D4 is "never commercial"), GitHub Pages (no headers, no API), DigitalOcean (1 GiB free static transfer), Koyeb (0.1 vCPU free service, $29 paid plan), Hetzner and Oracle (we would become the sysadmin; Oracle can reclaim or shrink the box without notice), D1 (SQL rewrite), Supabase Free (pauses after a week idle).

### 4.2 Phase 1, now: static site on Cloudflare Workers

**Code**: none required. Optional, with an e2e check that adding an unknown word still encodes it: add `ort-wasm*.wasm` to `public/.assetsignore` (Task 7.2.5), cutting the upload from 34 MB to about 11 MB and leaving headroom under the 25 MiB cap.

**The one decision: where the Cloudflare deploy token lives.** Cloudflare has no OIDC for deploys, so CI needs an API token.

| Route | Owner steps | CI change | Fit with workspace standards |
|---|---|---|---|
| **A. As documented**: GCP Secret Manager via Workload Identity (human-todo 3, 4, 5) | Create the GCP project (Firebase creates one anyway), run the §2.2 commands, store the token with the §3.3 command, set 5 variables | None | Matches SEC-05 (the vault is the source of truth) and keyless CI. Secret Manager has a free tier of 6 secret versions [GC2]; whether it needs a billing account is unconfirmed |
| **B. Lighter**: a GitHub **environment secret** `CLOUDFLARE_API_TOKEN` on the `production` environment (branch `main` only) | Paste the token in GitHub's web form; set 3 variables | Replace the `google-github-actions/auth` and `get-secretmanager-secrets` steps with `${{ secrets.CLOUDFLARE_API_TOKEN }}`; drop `id-token: write` | Encrypted, scoped to `main`, and never in the Drive tree, but GitHub becomes the store of record for this one secret: **needs the owner's approval as an exception** |

*Recommended: B, for effort*, with the 90-day expiry and the secrets-inventory entry kept. Route A remains the right choice if the owner prefers one vault for everything. A third route, Cloudflare Workers Builds (Cloudflare's GitHub app, no token at all; 3,000 build minutes/month free [CF10]), was not chosen: it builds on Cloudflare with install scripts on (standard DEP-03) and deploys without waiting for our e2e job.

**Owner steps (route B)**:
1. Sign up at dash.cloudflare.com (free plan; whether a card is asked for is unconfirmed). Copy the **Account ID** (Workers & Pages → Overview).
2. Choose the **workers.dev subdomain** (e.g. `dima`); the site becomes `https://lexical-fountain.<subdomain>.workers.dev`.
3. Create an API token from the **Edit Cloudflare Workers** template, limited to your account, **expiring in 90 days**; set a calendar reminder to rotate it. Add it to `D:\GDrive\proj-mgmt\inventory\secrets-inventory.md` (SEC-04).
4. GitHub → Settings → Environments → `production` (deployment branch `main`) → **Add environment secret** `CLOUDFLARE_API_TOKEN`, pasted in the browser only.
5. GitHub → Settings → Secrets and variables → Actions → **Variables**: `CLOUDFLARE_ACCOUNT_ID`, `CF_WORKERS_SUBDOMAIN`, and last `DEPLOY_ENABLED=true`. Leave the `VITE_FIREBASE_*` variables unset, so the public build has no sign-in button until Phase 2.
6. Pause SiteGround's auto-deploy (human-todo 12).
7. Merge `develop` → `main`. Done when the deploy job's smoke test passes and a phone play-test on the workers.dev URL shows "20,001 words".
8. Optional: a domain (about $10/year at Cloudflare Registrar), added as a Workers Custom Domain (TLS is automatic) [CF6].

**Agent follow-ups for route B**: the `ci.yml` change above; update `docs/setup/accounts-and-deploy.md` §2–4 and human-todo 3–5 to match.

### 4.3 Phase 2, when sign-in and sync open to real players: API in the Worker, Neon via Hyperdrive

**Owner steps**:
1. Neon account (free, no card [NE1]); a project in an AWS US East region (decision D3: United States); database `lexical`.
2. Cloudflare dashboard → **Hyperdrive** → create a configuration and paste Neon's connection string in the form (not on a command line: SEC-08). Its id goes into `wrangler.jsonc` (an id, not a secret).
3. Firebase (human-todo 2): add the workers.dev host (and any domain) to **Authorized domains** and the browser-key referrers; set the four `VITE_FIREBASE_*` repository variables.
4. Migrations need a database URL in CI: a second `production` environment secret `DATABASE_URL` (or route A's Secret Manager).

**Code and CI changes (agent)**:
1. **Split `server/src/db.ts`** so the Worker bundle never imports PGlite: keep `createPgliteDb` for local runs and tests; add a Postgres implementation over one `pg` `Client` per request (Cloudflare's recommended pattern with Hyperdrive; `pg` above 8.16.3, the repo has `^8.23.0`) [CF11].
2. **`server/src/worker.ts`**: a Workers `fetch` handler that opens a client on `env.HYPERDRIVE.connectionString`, calls the existing `createApp`, and closes the client in `ctx.waitUntil`. The verifier is created once per isolate (`jose`'s JWKS cache), with no dev-token secret.
3. **`wrangler.jsonc`**: `"main": "server/src/worker.ts"`, `"compatibility_flags": ["nodejs_compat"]` (for `node:crypto` [CF12]), `"assets": { …, "run_worker_first": ["/api/*"] }`, a `hyperdrive` binding, and `vars.FIREBASE_PROJECT_ID` (a public id).
4. **Migrations out of startup**: a `yarn db:migrate` script that runs the existing `migrate()` against `DATABASE_URL`, run in the deploy job before `wrangler deploy` (forward-only, as Task 7.4.3 requires).
5. **Tests**: a unit test that the Worker handler answers `/api/v1/health` with a stub environment; the deploy smoke test adds `curl /api/v1/health` expecting `"db":"postgres"` and `"devAuth":false`; e2e keeps using the Node server and PGlite (unchanged).
6. **Measure before launch**: CPU per request for `sync/push` (Free allows 10 ms; I/O waits don't count) using Workers observability or `wrangler dev`. If it is over, move to Workers Paid ($5/month: 30 s default CPU, 10M requests [CF3][CF4]).
7. Nothing is removed: `yarn start` (`main.ts` + `web.ts`) stays the local production check and the portable exit to Fly.io or a VPS.

### 4.4 Decisions for the owner

| # | Decision | Recommendation |
|---|---|---|
| H1 | Next host | Cloudflare Workers static assets now; the API in the same Worker with Neon in Phase 2 |
| H2 | Deploy-token storage | Route B (GitHub environment secret) as an approved exception, or route A (GCP Secret Manager) as documented |
| H3 | Revisit D1's "Cloud Run" half | Replace it with "API in the Worker + Neon via Hyperdrive"; Cloud Run stays a fallback |
| H4 | When to open sign-in publicly (Phase 2) | After the Worker port passes the smoke test and a two-phone sync check (human-todo 6) |
| D2 | Database | Neon Free (already the recommendation before telemetry) |
| D4 | Domain, commercial use | A domain is optional; the workers.dev URL works. Commercial use would rule out Vercel Hobby, not Cloudflare |

## 5. Limitations

* **No host was tried.** Cold-start times, CPU per API request on Workers, and Fly memory use with PGlite are estimates; §4.3 step 6 measures the one that matters.
* **Traffic model**: 12 MB per MAU comes from the 2026-09-25 measurements; the 2D/3D chunk split has changed since. It is the vocabulary (7.4 MiB) that sets the number, so the order of magnitude holds.
* **Sources**: Render's Starter and disk prices, Hetzner's prices, Neon's resume time, and Oracle's changes came from third-party articles (the vendors' pages hid the numbers from the page reader). Card requirements for Cloudflare, GCP and Oracle, Hetzner's backup price, Koyeb volumes, and GitHub Pages headers were not confirmed on an official page.
* **Neon's free storage** reads "1 GB/project" on the pricing page fetched today; one third-party article says 0.5 GB. Either is far above our need (a few KB per player).
* **The ORT wasm** is unused at runtime according to the transformers.js source and Task 7.2.5; this report did not observe it in a browser network log.

## References

Repo: `server/src/{main,app,auth,config,db,migrations,web}.ts`, `wrangler.jsonc`, `public/_headers`, `.github/workflows/ci.yml`, `src/services/account.ts`, `src/embeddings/liveEncoder.ts`, `node_modules/@huggingface/transformers/dist/transformers.web.js` (lines 131, 7788), [delivery-cicd.md](delivery-cicd.md), [platform-plan.md](platform-plan.md), [backend-sync-telemetry.md](backend-sync-telemetry.md), [human-todo 12](../../proj-mgmt/human-todo/12-siteground-node-hosting.md).

* [CF1] Workers static assets billing: https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
* [CF2] Workers limits (static assets 25 MiB, 20,000 / 100,000 files; script 64 MiB): https://developers.cloudflare.com/workers/platform/limits/
* [CF3] Workers pricing (Free 100k requests/day, 10 ms CPU; Paid $5 with 10M requests, 30M CPU-ms): https://developers.cloudflare.com/workers/platform/pricing/
* [CF4] Workers limits, CPU time (Paid default 30 s, up to 5 min): https://developers.cloudflare.com/workers/platform/limits/
* [CF5] Pages limits: https://developers.cloudflare.com/pages/platform/limits/
* [CF6] Workers Custom Domains (Cloudflare zone required, automatic certificates): https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
* [CF7] `run_worker_first` route patterns: https://developers.cloudflare.com/workers/static-assets/binding/
* [CF8] Hyperdrive pricing (Free 100,000 queries/day): https://developers.cloudflare.com/hyperdrive/platform/pricing/
* [CF9] D1 pricing and limits: https://developers.cloudflare.com/d1/platform/pricing/
* [CF10] Workers Builds limits: https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/
* [CF11] Hyperdrive with Neon and node-postgres (client per request, `pg` > 8.16.3, `nodejs_compat`): https://developers.cloudflare.com/hyperdrive/examples/neon · https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/
* [CF12] Node.js compatibility (crypto, net supported): https://developers.cloudflare.com/workers/runtime-apis/nodejs/
* [GH1] GitHub Pages limits: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
* [NL1] Netlify pricing (credits): https://www.netlify.com/pricing/
* [NL2] Netlify forum, deploys paused when credits run out: https://answers.netlify.com/t/my-site-was-paused-due-to-exceeded-credit-limit-even-though-i-have-low-bandwidth-and-build-usage/158348 · https://answers.netlify.com/t/free-plan-shows-run-out-of-credits-but-30-30-credits-available-production-deploys-blocked/165662
* [VC1] Vercel Hobby plan (updated 2026-09-14): https://vercel.com/docs/plans/hobby
* [FB1] Firebase pricing (Hosting 360 MB/day on Spark, $0.15/GB on Blaze; Auth 50k MAU): https://firebase.google.com/pricing
* [NE1] Neon pricing (Free: 1 GB/project, 100 CU-hours, 5 GB egress, 5-min suspend, 6-hour history, no card; Launch $0.106/CU-hour, $0.35/GB-month): https://neon.com/pricing
* [NE2] Neon resume latency (third party): https://www.jetadmin.io/blog/neon-pricing/
* [SB1] Supabase pricing (Free pauses after 1 week idle): https://supabase.com/pricing
* [GC1] Google Cloud free tier (Cloud Run, Artifact Registry): https://docs.cloud.google.com/free/docs/free-cloud-features
* [GC2] Secret Manager free tier: https://cloud.google.com/blog/products/identity-security/google-cloud-secret-manager-adds-free-of-charge-tier-and-more
* [FL1] Fly.io pricing (trial, machines, volumes, snapshots, IPv4, bandwidth, Managed Postgres $38): https://docs.fly.io/about/pricing
* [FL2] Fly.io volume snapshots and single-host volumes: https://fly.io/docs/volumes/snapshots/
* [FL3] Fly.io community, snapshot billing from January 2026: https://community.fly.io/t/we-are-going-to-start-charging-for-volume-snapshots-from-january-2026/26202
* [RD1] Render free tier: https://render.com/docs/free
* [RD2] Render outbound bandwidth (Hobby 5 GB, Pro 25 GB, $0.15/GB): https://render.com/docs/outbound-bandwidth
* [RD3] Render 2026-08-01 plan change (third party): https://jwatte.com/blog/render-com-platform-review.md
* [RD4] Render Starter and disk prices (third party): https://deploycloud-shopify.devcloudsoftware.com/blog/render-pricing
* [RW1] Railway pricing: https://docs.railway.com/reference/pricing
* [KY1] Koyeb pricing FAQ: https://www.koyeb.com/docs/faq/pricing
* [DO1] DigitalOcean App Platform pricing: https://docs.digitalocean.com/products/app-platform/details/pricing/
* [HZ1] Hetzner price adjustment (official): https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/
* [HZ2] Hetzner June 2026 prices (third party): https://privatedevops.com/news/hetzner-june-2026-cloud-price-increase-what-to-do
* [OC1] Oracle Always Free cut (InfoQ, 2026-07): https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/
* [OC2] Oracle Always Free resources and idle reclamation: https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm
* [DM1] Cloudflare Registrar `.com` price (third party): https://vpsranking.com/domain/cloudflare/

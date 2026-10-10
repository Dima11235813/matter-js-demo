# Hosting on the Google / Firebase path (Lexical Fountain)

> Part of [hosting-options.md](../hosting-options.md) (round 2, 2026-10-10): one of three parallel deep dives, written by a research agent and reviewed before committing.

**Date**: 2026-10-10 · **Scope**: the Firebase/GCP-aligned slice of the hosting question ("most affordable and technology-aligned host"), next to `docs/research/hosting-options.md` (which recommends Cloudflare Workers) · **Method**: read `server/src/*`, `.github/workflows/ci.yml`, `wrangler.jsonc`, `public/_headers`, `src/account/authService.ts`, the four earlier research reports; vendor pages read on 2026-10-10 (most Firebase/GCP doc pages show "Last updated 2026-10-06/07"); one local measurement (server module load time). Nothing was deployed. **(unconfirmed)** marks anything not read on an official page.

## 0. Summary

* **Static site on Firebase Hosting**: technically a perfect fit (2 GB per-file limit, CDN, free custom domain + TLS, preview channels per PR, `firebase.json` headers and SPA rewrite). Cost is the problem only at scale: **10 GB/month-ish free (360 MB/day), then $0.15/GB**, so ~$0 now, ~$0.2-1 at 1k MAU, **~$16 at 10k MAU** (Cloudflare: $0 at all three).
* **API on Cloud Run** (the existing Node/Hono server, almost unchanged) behind a Hosting rewrite `/api/**` → same origin. Free tier covers 1k MAU easily ($0) and probably 10k ($1-14). Scale to zero means a **cold start of roughly 1-3 s** on the first sync after idle (estimate); `min-instances=1` removes it for **~$9.86/month** (1 vCPU, 512 MiB, computed from the idle rate).
* **Database**: Neon Free from Cloud Run (no card, $0, but AWS-only regions and the 30-s sync poll can exhaust 100 CU-hours near 1k MAU); Cloud SQL has a **~$9.37/month floor** (db-f1-micro + 10 GB SSD); Firestore is the cheapest at every scale (~$0-2 at 10k) but means rewriting the SQL sync layer (2-4 agent-days) and giving up SQL for research telemetry. **PGlite on a Cloud Run volume is not viable** (Google says GCS FUSE must not hold a database; Filestore's minimum is ~$164/month).
* **Billing safety is the weak point**: Blaze needs a card; budgets only alert; the new **spend caps (Preview)** cover only App Hosting, Cloud Functions for Firebase, Extensions and AI Logic, **not Hosting bandwidth, Firestore or Cloud SQL**. A scraper looping on the 7.4 MiB `vocab.bin` is uncapped at $0.15/GB.
* **Alignment wins**: same Firebase project as sign-in, keyless deploys through the Workload Identity Federation already planned (human-todo 3) with **no long-lived Cloudflare token**, Hosting serves `/__/auth/*` on our own domain (redirect sign-in works on phones without a proxy), one console and one bill, and the Node server runs as is (no Workers port, no 10 ms CPU limit, PGlite tests unchanged).

## 1. Firebase Hosting: Spark vs Blaze

| | Spark (no card) | Blaze (card) | Source |
|---|---|---|---|
| Storage | 10 GB | 10 GB free, then $0.026/GB | [FB1] |
| Transfer | **360 MB/day** (pricing page); the usage page says "10 GB/month". Both ≈ 46 cold visits a day at 7.8 MB | Same no-cost amount, **calculated daily** on Blaze, then **$0.15/GB** | [FB1][FB2] |
| Over the limit | Storage: deploys blocked. Transfer: "after a short grace period, your sites are disabled until the next month begins" (a hard cap) | Billed | [FB2] |
| Max file size | 2 GB (the 22.5 MiB ORT wasm and 7.4 MiB `vocab.bin` fit; no 25 MiB problem as on Cloudflare) | same | [FB2] |
| Custom domain + TLS | Included | Included | [FB1] |
| Free domains | `<project>.web.app` and `<project>.firebaseapp.com` | same | [FB5] |
| Preview channels | Yes: default expiry 7 days, max 30 days; deploying again extends; no documented cap per site (unconfirmed) | same | [FB3][FB4] |
| GitHub Action | `FirebaseExtended/action-hosting-deploy`: per-PR channel, PR comment; **requires a service-account JSON key** (`firebaseServiceAccount`), no WIF input documented | same | [FB6] |
| Keyless alternative | `google-github-actions/auth` (WIF) then `npx firebase-tools deploy --only hosting` / `hosting:channel:deploy pr-N` using ADC: works per community guides (unconfirmed on an official Firebase page) | same | [GH2] |
| Rewrites to Cloud Run | **Not available** (Cloud Run needs billing) | `"rewrites": [{"source": "/api/**", "run": {"serviceId": "...", "region": "us-central1", "pinTag": true}}]`; 60-s request timeout; `pinTag` pins Hosting releases to a Cloud Run revision (rollbacks roll both back, and **preview channels get their own tagged API revision**; 1,000 tags per service, oldest previews eventually stop working) | [FB7] |
| Cookies / auth header | Only the `__session` cookie reaches the backend; Hosting adds `Authorization` to `Vary` for dynamic content (so the bearer token is forwarded; confirm with the smoke test). Our API uses `Authorization: Bearer`, no cookies, so it is unaffected | | [FB8] |
| Release storage | Each deploy stores a version (34 MB `dist`, 11 MB without the unused wasm); set **release retention** (e.g. keep 10) or 300 deploys fill the 10 GB | | [FB4] |

**Fit for the 8 MB vocabulary and 22.5 MiB wasm**: yes on both plans. On Spark, a busy play-test day (50 cold phones) can exceed 360 MB and disable the site until the next month (the grace period length is not documented).

**Hosting traffic cost** (12 MB per monthly player, the model in hosting-options.md §2): now (~0.25 GB/month) **$0**; 1k MAU (~12 GB, ~0.4 GB/day) **~$0.2-1** depending on peak days; 10k MAU (~120 GB) **~$16**; 100k ~$180.

## 2. The API: Cloud Run, Cloud Functions for Firebase, App Hosting

| | Cloud Run service (container) | Cloud Functions for Firebase (2nd gen = Cloud Run functions) | Firebase App Hosting |
|---|---|---|---|
| What runs | `server/src/main.ts` unchanged apart from a lazy PGlite import (no `dist/` in the image, so `webApp()` returns nothing) | `onRequest(handler)` wrapping Hono: an adapter of ~30 lines (express req → `Request`, `rawBody`); community reports say `@hono/node-server` had POST-body issues there [HN2] | Whole site (static + server) on Cloud Run; first-class only for Next.js/Angular; Express-style apps "generally work, not guaranteed"; Yarn 1 workspaces not listed (Nx/Turborepo only) [FB10] |
| Free tier (monthly) | 2M requests, 180,000 vCPU-s, 360,000 GiB-s (request-based billing), 1 GB egress from North America [GC1][GC2] | 2M invocations, 400,000 GB-s, 200,000 GHz-s / CPU-s, 5 GB egress [FB1][GC1] | 10 GiB egress, 5 GB storage, then $0.15-0.20/GiB; plus Cloud Run, Cloud Build, Artifact Registry at GCP rates [FB1] |
| Prices beyond free (us-central1) | $0.000024/vCPU-s and $0.0000025/GiB-s active; **idle min instance $0.0000025/vCPU-s and /GiB-s**; $0.40 per million requests [GC2] | Cloud Run functions rates (same family) | as left |
| Spend cap (Preview) | Not listed by itself; the docs say a cap on App Hosting applies to "the underlying service" (Cloud Run) project-wide, so it may cap a plain service too (unconfirmed) | **Yes** (listed) | **Yes** (listed) [FB9] |
| Build / deploy | Image built in GitHub Actions (or `gcloud run deploy --source`, Cloud Build 2,500 free build-minutes) → Artifact Registry (0.5 GB free; set a cleanup policy) → `google-github-actions/deploy-cloudrun` with WIF | `firebase deploy --only functions` uploads source and builds in Cloud Build: our `@lexical/shared` workspace package is not on npm, so the function must be **bundled** (esbuild) first | Builds on Google's side with install scripts on (conflicts with the CI rule `--ignore-scripts`) and deploys without waiting for our e2e job |
| Cold start | Typical Node 0.5-2 s (third-party ranges; Google gives only "up to 30% faster with CPU boost") [GC4]. Local measurement: importing the server modules through `tsx` takes **~300 ms** on the dev PC (150 ms app+auth, 150 ms db+pg+PGlite+web), ~0.4-0.6 s per process. Add container start, the first JWKS fetch, and a Neon wake (~0.5 s, unconfirmed): **~1-3 s for the first sync after idle (estimate)**. Sync runs in the background, so players rarely notice | Same as Cloud Run | Same, but on the **page load path** (the page itself is served by Cloud Run behind a CDN) |
| Verdict | **Recommended**: runs today's server, keyless deploys, max-instances as a fuse | Runner-up: choose it for the spend cap, at the price of an adapter and a bundling step | Rejected: built for SSR frameworks; puts static files behind Cloud Run and bills egress after 10 GiB anyway |

**min-instances**: 1 vCPU + 0.5 GiB kept warm 730 h = 2,628,000 s × ($0.0000025 + 0.5 × $0.0000025) = **$6.57 + $3.29 ≈ $9.86/month** (computed from [GC2]; whether the free tier offsets idle time is unconfirmed). Not worth it for a background sync.

**Startup migrations**: `main.ts` runs `migrate()` at every start. With several Cloud Run instances starting at once, two could race on the first migration; move it to a CI step (`yarn db:migrate`) or wrap it in `pg_advisory_lock`. Needed for any multi-instance host, including Cloudflare.

## 3. Database options from the Google path

| Option | Cost floor / at 10k MAU | Code change | Fit | Verdict |
|---|---|---|---|---|
| **Neon Free** (Postgres, from Cloud Run over TLS) | $0 (1 GB/project, 100 CU-hours, 5 GB egress, suspends after 5 min, **no card**) / Launch $0.106 per CU-hour: worst case awake 24/7 at 0.25 CU ≈ $19 [NE1] | None (`DATABASE_URL`, `pg` Pool already there) | Regions are **AWS only** (us-east-1/2 closest to us-central1; Azure deprecated) [NE2]: ~20-30 ms per query round trip (unconfirmed), ×3 per request. The 30-s sync poll keeps it awake whenever anyone is signed in: near 1k MAU it can use up the 100 CU-hours (then, on Free, compute stops until next month (unconfirmed)) | **Recommended for now** (same DB as the Cloudflare plan) |
| Supabase Free | $0 / $25 Pro | None | Free projects pause after 1 week idle [SB1] | No |
| **Cloud SQL Postgres** db-f1-micro | **$7.67 instance + $1.70 for 10 GB SSD ≈ $9.37/month** (us-central1; $0.0105/h, SSD $0.000232877/GiB-h); db-g1-small $25.55 + storage; shared-core has **no SLA**; idle IPv4 $0.01/h [GC3] | None (IAM login through the Cloud SQL connector is optional extra work) | Same region as Cloud Run, IAM credentials (workspace preference), but a fixed bill with zero players | Later, once telemetry ships (as platform-plan D2 says) |
| **Firestore** | $0 floor; free 50k reads, 20k writes, 20k deletes/day, 1 GiB; then $0.03 per 100k reads, $0.09 per 100k writes; a query that returns nothing still costs 1 read [GC5]. At 1k MAU (~12k pulls/day) $0; at 10k (~120k pulls/day + lookups) **~$1-2/month** | **Rewrite** the storage layer: replace `Queryable` SQL in `app.ts` (claim, push with merge in a transaction, pull by cursor, export, delete cascade via recursive delete, `userFor`), replace the global `sync_seq` with a per-user counter document, drop `migrations.ts`, move server tests from PGlite to the Firestore emulator (a Java dependency in CI) or a fake. **Estimate 2-4 agent-days** plus re-testing sync on two phones | No idle cost, no wake latency, keyless (Cloud Run service account), Firebase-native. Loses SQL for the research telemetry the platform plan wants (BigQuery export instead) | Cheapest; only if the owner drops the SQL/telemetry direction |
| PGlite on a Cloud Run **GCS FUSE** volume | ~$0 | None | Google: "shouldn't be used as the backend for storing a database"; no file locking; last writer wins [GC6][GC7] | **Not viable** |
| PGlite on **Filestore NFS** | Basic HDD minimum 1 TiB ≈ **$163.84/month** [GC8] | None | Works technically | Not viable on cost |
| PGlite in memory + snapshot to GCS, `max-instances=1` | ~$0 | ~1 day of bespoke code (`dumpDataDir` after each push, restore on start) | Single instance only, loses writes since the last snapshot if killed, slow cold start as data grows | Not recommended (a home-made database) |
| Compute Engine e2-micro (Always Free in us-central1/us-east1/us-west1) running `yarn start` with PGlite on a 30 GB disk | $0 compute (external IPv4 may be billed, unconfirmed) | None | Hosting rewrites cannot target a VM (only Cloud Run/Functions), so the API would be cross-origin or need an ~$18 load balancer; we become the sysadmin [GC1] | No |

## 4. Billing safety

| Mechanism | What it does | Limits |
|---|---|---|
| **Stay on Spark** | No billing account: nothing can be billed; Hosting is disabled after a grace period when the daily/monthly quota is exceeded [FB2] | No Cloud Run, no `/api` rewrite, no Functions; ~46 cold visits a day |
| Card | Blaze = a Cloud Billing account; the GCP free tier "requires a billing account"; the $300/90-day trial requires a payment method [GC1] | — |
| Budget alerts | Email at thresholds; **do not pause services** [FB11] | Delayed reporting |
| **Spend caps (Preview, doc dated 2026-10-06)** | At 100% of a per-service budget, new usage is paused until month end | Only AI Logic, **App Hosting, Cloud Functions for Firebase**, Extensions; enforcement lags "several minutes" [FB9]. **Not Hosting bandwidth, Firestore, Cloud SQL** |
| Disable billing from a budget Pub/Sub notification (Google's tutorial function) | Unlinks billing when the budget is exceeded | Shuts down all paid resources; "resources might be irretrievably deleted" (Cloud SQL!); costs keep arriving during the delay [GC9]. With Neon (outside GCP) and a static site, the damage is the API stopping; whether the Firebase project then falls back to Spark quotas for Hosting is unconfirmed |
| Cloud Run `max-instances=2`, `concurrency=80`, short request timeout | Caps API compute | `requireUser` verifies the JWT (cached JWKS) before any DB query, so junk requests are cheap |
| Hosting egress | **No cap, no rate limit, no WAF in front of Firebase Hosting** (unconfirmed: none found in the docs) | Worst case: a bot pulling `vocab.bin` 1,000×/hour ≈ 7 GB/h ≈ $1/h ≈ $750/month. Mitigation: budget alert at $5/$10/$20 + the disable-billing function at e.g. $30; content-hash `vocab.bin` (Task 7.2.4) so repeat visits use the browser cache |

**Recommended setup if Blaze**: budget $20/month with alerts at 25/50/100%, the disable-billing function at $30 (Neon outside GCP, so no data loss), Cloud Run `max-instances=2`, release retention 10, Artifact Registry cleanup policy (keep 3 images). Owner time ~1 h.

## 5. Monthly cost at 0, 1k and 10k players

Assumptions: 12 MB static per MAU; API only with sign-in on; 30% of MAU signed in 40 min/day with the 30-s poll (≈12k requests/day at 1k, 120k at 10k); 200 ms of billed instance time per request with no overlap (upper bound). No domain (Firebase custom domains are free; a `.com` ~$10-12/year).

| Configuration | 0 (~20 testers) | 1k MAU | 10k MAU | Notes |
|---|---|---|---|---|
| **A. Firebase Hosting, static only, Spark** | **$0** | $0 but at risk: ~0.4 GB/day vs 360 MB/day → site disabled on busy days | not possible | Hard-capped; no API |
| **B. Hosting (Blaze) + Cloud Run API + Neon Free** (recommended Google path) | **$0** | **~$0.2-1** (Hosting overage; Cloud Run ~360k req and ≤72k vCPU-s, inside free) + Neon $0, or up to ~$19 if the poll keeps Neon awake 24/7 | **~$17-50**: Hosting ~$16 + Cloud Run $1-14 (1.6M requests over free = $0.64; CPU upper bound $13) + Neon $0-19 | Cold starts 1-3 s (est.) |
| B + `min-instances=1` | ~$10 | ~$10-11 | ~$27-60 | Removes API cold starts |
| C. Hosting + Cloud Run + **Cloud SQL** f1-micro | **~$9.4** | ~$9.6-10.5 | ~$27-45 (Hosting $16, Cloud Run $1-14, SQL $9.4, or g1-small ~$27) | IAM credentials, same region, no SLA on shared core |
| D. Hosting + Cloud Functions for Firebase + **Firestore** | $0 | ~$0.2-1 | ~$18-32 | Cheapest DB, hard spend cap on the API; 2-4 days of rewrite |
| E. Hybrid: **Cloudflare static** + Worker `/api/*` proxy to Cloud Run + Neon (the 2026-09-25 D1 plan) | $0 | $0 (Neon caveat) | ~$1-33 | Static stays $0; API keeps Node; one Cloudflare token |
| *Reference: Cloudflare Workers static + API in the Worker + Neon via Hyperdrive (hosting-options.md recommendation)* | $0 | $0 (Neon caveat) | ~$5 + Neon $0-19 | Needs the Worker port |

The **Neon caveat applies to every option that uses Neon**, including Cloudflare's: syncing on change and on tab focus instead of every 30 s is the cheapest cost fix on any host (roadmap item already in hosting-options.md §3.3).

## 6. Effort and code/CI changes (Google path, option B)

**Phase 1, static site only (Hosting)**: agent ~2-3 h, owner ~1 h (+ WIF setup from human-todo 3 if not done, ~1 h).

| File | Change |
|---|---|
| `firebase.json` (new) | `hosting.public: "dist"`; `ignore: ["**/*.map", "**/ort-wasm*.wasm"?]` (wasm only after the Task 7.2.5 e2e check); headers mirroring `public/_headers` (`/assets/**` immutable 1 year, `/vocab/**` and `index.html` `no-cache`, `nosniff`, `Referrer-Policy`); SPA rewrite `** → /index.html` |
| `.firebaserc` (new) | Project id (public) |
| `.github/workflows/ci.yml` | `deploy-production`: keep `google-github-actions/auth` (WIF), **drop the Secret Manager step and `wrangler deploy`**, run `npx firebase-tools@<pinned> deploy --only hosting --project $FIREBASE_PROJECT_ID -m $SHA`; smoke test against `https://<project>.web.app`; new PR job `hosting:channel:deploy pr-<n> --expires 7d` (same-repo PRs only; forks get no OIDC token) |
| `docs/setup/accounts-and-deploy.md`, `proj-mgmt/human-todo/02-05, 12` | Replace the Cloudflare token steps with Hosting setup; WIF service account roles (Firebase Hosting Admin; Cloud Run Viewer for the rewrite later) |
| `wrangler.jsonc`, `public/_headers` | Leave in place (never delete; `_headers` is harmless in `dist/`) |

**Phase 2, API (Cloud Run + Neon)**: agent ~5-8 h, owner ~1-2 h (enable Cloud Run, Artifact Registry, Secret Manager APIs; Neon project; the `DATABASE_URL` secret pasted in the console; budget and spend controls).

| File | Change |
|---|---|
| `Dockerfile` + `.dockerignore` (new, at the root: the server needs `packages/shared`) | Node 22 slim; copy `server/`, `packages/shared/`, lockfile; `yarn install --frozen-lockfile --ignore-scripts --production`; ideally an esbuild bundle of `server/src/main.ts` instead of `tsx` at runtime (faster cold start) |
| `server/src/db.ts`, `server/src/main.ts` | Import PGlite lazily (only without `DATABASE_URL`) |
| `server/src/migrate.ts` (new) + root `package.json` script `db:migrate` | Run migrations from CI before the deploy (or an advisory lock in `migrate()`) |
| `firebase.json` | Add `{"source": "/api/**", "run": {"serviceId": "lexical-api", "region": "us-central1", "pinTag": true}}` before the SPA rewrite |
| `.github/workflows/ci.yml` | Build and push the image to Artifact Registry, `google-github-actions/deploy-cloudrun` (`--max-instances 2 --cpu-boost`, `DATABASE_URL` from Secret Manager, `FIREBASE_PROJECT_ID` env), then the Hosting deploy; smoke test `curl /api/v1/health` → `"db":"postgres","devAuth":false` through the Hosting URL |
| `src/account/authService.ts` (optional) | With `authDomain` = the Hosting domain, `signInWithRedirect` works on phones without a `/__/auth` proxy (popup is used today) [FB12] |

Ongoing maintenance: low. Rebuild the image for Node security updates (Dependabot on the Dockerfile base image), watch the budget email, rotate nothing (no long-lived keys).

## 7. Risks

1. **Uncapped Hosting egress** on a card-backed account (§4). The single biggest difference from Cloudflare's free plan.
2. **Cold starts** of ~1-3 s on the first API call after idle (estimate, not measured on GCP); harmless for background sync, visible if a future feature (leaderboards) is interactive.
3. **Neon CU-hours** with the 30-s poll (same on Cloudflare).
4. **Preview tooling**: the official Hosting GitHub Action needs a JSON key (workspace standard says keyless); the CLI-with-WIF route is community-documented only.
5. **Spark trap**: if the family phase stays on Spark, a busy day can switch the site off until the next month.
6. Spend caps are in **Preview** and lag by minutes.
7. Neon (AWS) to Cloud Run (GCP) crosses clouds: extra latency and a second vendor for data; Cloud SQL fixes that for ~$9.37/month.

## 8. Comparison with the Cloudflare recommendation

| | Cloudflare (hosting-options.md) | Google / Firebase (option B) |
|---|---|---|
| Cost 0 / 1k / 10k | $0 / $0 / ~$5 + Neon | $0 / ~$0.2-1 / ~$17-50 |
| Billing risk | Free plan, no card for static (unconfirmed); Workers Free returns 429 instead of billing | Card required for the API; Hosting egress uncappable |
| Phase 1 effort | **None** (already wired) | ~2-3 h agent + owner setup |
| Phase 2 effort | Worker port: split `db.ts`, `worker.ts`, Hyperdrive, migrations in CI; 10 ms CPU limit to measure | Dockerfile + rewrite; **server code unchanged**; no CPU limit |
| Credentials | One long-lived Cloudflare API token (90-day rotation) | **Keyless** (WIF) for both site and API |
| Firebase Auth fit | Needs a `/__/auth` proxy for redirect sign-in on a custom domain | Native (same project, same domain) |
| Cold start | ~0 | 1-3 s after idle (est.) |
| Exit | Fly.io runs `yarn start` | Same container runs on Fly, Render, or any VM |

**Verdict**: Cloudflare stays the cheapest and safest for the **static** site at every scale. The Google path's advantages (alignment with Firebase Auth, keyless deploys, the API running unchanged) matter most in **Phase 2**. A mixed answer keeps both: Cloudflare static now (zero work), and when sign-in opens, either the Worker port (hosting-options.md) or the original D1 plan (Worker `/api/*` proxy → Cloud Run, option E) if the owner prefers running the Node server unchanged on GCP. Going all-Firebase (option B) is reasonable only if the owner values one vendor and keyless deploys over ~$16/month at 10k MAU and an uncapped egress risk.

## 9. Unconfirmed items

Spark transfer wording (360 MB/day vs 10 GB/month) and the length of the grace period; the number of preview channels per site; firebase-tools deploys with WIF/ADC (community-documented); whether a spend cap on App Hosting also caps a plain Cloud Run service; whether the free tier offsets min-instance idle time; Cloud Run egress and Artifact Registry overage prices; Neon resume time, AWS-to-GCP latency, and what Neon Free does when CU-hours run out; e2-micro IPv4 billing; Cloud Run cold start for this server (only module load time was measured locally); whether an unlinked billing account drops a Firebase project back to Spark quotas; a card for Cloudflare Free.

## Sources

* [FB1] Firebase pricing (Hosting 10 GB storage, 360 MB/day, $0.026/GB, $0.15/GB; App Hosting 10 GiB egress from 2025-08-01; Functions free tier; Firestore free quotas; Auth 50k MAU; "No-cost usage on Blaze plan is calculated daily"; page metadata 2026-09-02): https://firebase.google.com/pricing
* [FB2] Hosting usage, quotas and pricing (2 GB per file; Spark over-quota behaviour; last updated 2026-10-07): https://firebase.google.com/docs/hosting/usage-quotas-pricing
* [FB3] Test and preview deploys (GitHub Action; pinned functions in previews; 2026-10-07): https://firebase.google.com/docs/hosting/test-preview-deploy
* [FB4] Manage Hosting resources (preview expiry 7 days default, 30 max; release retention; 2026-10-07): https://firebase.google.com/docs/hosting/manage-hosting-resources
* [FB5] Hosting custom domains: https://firebase.google.com/docs/hosting/custom-domain
* [FB6] action-hosting-deploy README (`firebaseServiceAccount` required): https://github.com/FirebaseExtended/action-hosting-deploy
* [FB7] Hosting + Cloud Run (rewrite `run` block, `pinTag`, 60-s timeout, 1,000 tags per service; 2026-10-07): https://firebase.google.com/docs/hosting/cloud-run
* [FB8] Hosting cache behaviour (`__session` cookie only; `Authorization` and `Cookie` in `Vary`): https://firebase.google.com/docs/hosting/manage-cache
* [FB9] Spend caps (Preview; eligible services; enforcement delay; 2026-10-06): https://firebase.google.com/docs/projects/billing/spend-caps
* [FB10] App Hosting frameworks and tooling (2026-10-07): https://firebase.google.com/docs/app-hosting/frameworks-tooling · https://firebase.blog/posts/2025/06/app-hosting-frameworks
* [FB11] Avoid surprise bills (2026-10-06): https://firebase.google.com/docs/projects/billing/avoid-surprise-bills · budget alerts: https://firebase.google.com/docs/projects/billing/budget-alerts
* [FB12] Redirect sign-in best practices (2026-10-07): https://firebase.google.com/docs/auth/web/redirect-best-practices
* [FB13] Auth limits (Spark 3,000 DAU Tier 1; 100 accounts/h per IP; 2026-10-07): https://firebase.google.com/docs/auth/limits
* [GC1] Google Cloud free tier (Cloud Run, functions, Artifact Registry 0.5 GB, Cloud Build 2,500 min, Secret Manager 6 versions, Firestore, e2-micro, Logging 50 GiB; billing account required; 2026-10-07): https://docs.cloud.google.com/free/docs/free-cloud-features
* [GC2] Cloud Run pricing (request-based $0.000024/vCPU-s, $0.0000025/GiB-s, idle min instance $0.0000025, $0.40 per million; read 2026-10-10): https://cloud.google.com/run/pricing
* [GC3] Cloud SQL pricing (db-f1-micro $0.0105/h, db-g1-small $0.035/h, SSD $0.000232877/GiB-h, idle IPv4 $0.01/h, no SLA for shared core; read 2026-10-10): https://cloud.google.com/sql/pricing
* [GC4] Startup CPU boost (Node up to 30% faster): https://cloud.google.com/blog/products/serverless/announcing-startup-cpu-boost-for-cloud-run--cloud-functions
* [GC5] Firestore pricing (free tier; $0.03/100k reads, $0.09/100k writes; minimum one read per query; read 2026-10-10): https://cloud.google.com/firestore/pricing
* [GC6] Cloud Run Cloud Storage volume mounts (no file locking, last writer wins; 2026-10-07): https://docs.cloud.google.com/run/docs/configuring/services/cloud-storage-volume-mounts
* [GC7] Cloud Storage FUSE overview ("shouldn't be used as the backend for storing a database"; 2026-10-07): https://docs.cloud.google.com/storage/docs/cloud-storage-fuse/overview
* [GC8] Filestore pricing / service tiers (Basic HDD 1 TiB minimum, $0.16/GiB-month): https://cloud.google.com/filestore/pricing
* [GC9] Disable billing with budget notifications (2026-10-07): https://docs.cloud.google.com/billing/docs/how-to/disable-billing-with-notifications
* [GH2] Firebase deploys with Workload Identity Federation (third party, 2026-02): https://oneuptime.com/blog/post/2026-02-17-how-to-fix-firebase-deploy-failures-caused-by-workload-identity-federation-issues/markdown
* [HN1] Hono on Cloud Run: https://hono.dev/docs/getting-started/google-cloud-run
* [HN2] Hono on Firebase Functions gen2 (community, 2025-03): https://zenn.dev/takanari_dev/articles/2025-03-29-firebase-functions-gen2-with-hono · https://zenn.dev/mkis/articles/98e845de8b2b1b
* [NE1] Neon pricing (Free: 1 GB, 100 CU-hours, 5 GB egress, 5-min suspend, no card; Launch $0.106/CU-hour, $0.35/GB-month, no minimum): https://neon.com/pricing
* [NE2] Neon regions (AWS only for new projects; Azure deprecated 2026-08-27): https://neon.com/docs/introduction/regions
* [SB1] Supabase pricing (Free pauses after 1 week): https://supabase.com/pricing
* Repo: `server/src/{main,app,auth,config,db,migrations,web}.ts`, `.github/workflows/ci.yml`, `wrangler.jsonc`, `public/_headers`, `src/account/authService.ts` (`signInWithPopup`), `docs/research/{hosting-options,platform-plan,backend-sync-telemetry,accounts-auth,delivery-cicd}.md`, `proj-mgmt/human-todo/02-05`.

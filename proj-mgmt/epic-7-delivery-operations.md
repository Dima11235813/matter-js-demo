# Epic 7: Delivery & Operations (CI/CD, Hosting, Environments, Observability)

## 📋 Overview
Take the game from a local dev server to a public site with checked PRs, preview deploys, production releases, monitoring, and rollback, within the workspace security standards: secrets in GCP Secret Manager, short-lived credentials via OIDC, installs with scripts ignored, and a documented audit baseline. Driven by [docs/research/delivery-cicd.md](../docs/research/delivery-cicd.md) and [platform-plan.md](../docs/research/platform-plan.md).

### Decisions (2026-09-25; D1 hosting = **Cloudflare Workers + Cloud Run**, decided by the user; the rest in platform-plan.md §5)
* **Hosting**: Cloudflare Workers static assets ($0 at 100k MAU; 25 MiB per-file cap), with PR previews from preview aliases. A Worker route proxies `/api/*` to Cloud Run when the backend lands, keeping the API on the same origin. Fallback: Firebase Hosting + Cloud Run (decision D1).
* **CI**: GitHub Actions (free on the public repo). e2e runs against a production-like build with the dev handle turned on by an explicit build flag; the production build is checked to contain no dev handle.
* **Credentials**: GitHub OIDC → GCP Workload Identity Federation, with no JSON keys. The Cloudflare deploy token (Cloudflare has no OIDC yet) lives in Secret Manager: scoped to Workers, 90-day expiry, fetched at job time.
* **Never deploy from the Drive-synced tree**: deploys and source-map uploads happen only in CI.

---

## 🛠️ Features, Stories & Tasks

### Feature 7.1: CI on Pull Requests (Stage A, $0)
* **Story 7.1.1**: *As the developer, I want every PR checked automatically, so nothing regresses silently.*
  * [x] **Task 7.1.1.1** (2026-09-25, not yet run on GitHub): `.github/workflows/ci.yml`, `verify` job. Actions are pinned to commit SHAs (checkout v7.0.1, setup-node v7.0.0, cache v6.1.0, upload-artifact v7.0.1, download-artifact v8.0.1). A frozen install with scripts ignored was verified outside Drive: 18 s, and esbuild runs from its optional platform package. Found while wiring it: the research sketch's `require('@huggingface/transformers/package.json')` fails under that package's `exports`, so the cache key reads the file directly. Audit: report-only `yarn audit --level high`, with no new dependency. Plan:
    * `yarn install --frozen-lockfile --ignore-scripts` (none of the six packages with install scripts needs them);
    * restore the model and vocabulary caches (keyed by *every* input the build script reads, including `src/utils/Dictionary/*` and `src/mitDict.txt`), or build on a miss;
    * typecheck, unit tests, both builds, guards;
    * a report-only `audit-ci`.
  * [x] **Task 7.1.1.2** (2026-09-25): `e2e` job, downloading the e2e bundle artifact. Locally in CI mode (`CI=1 E2E_SERVER=preview`) against the minified bundle with the profanity filter on: 20/20. Plan: Playwright against `vite preview` of a `--mode e2e` build (`VITE_E2E_HANDLE=on`); upload the report on failure. `playwright.config.ts` switches its web server by env var. **Watch for flakes**: on 2026-09-25 one full local run of 20 had a single failure that three reruns didn't reproduce. CI keeps `retries: 1` plus the failure report, so the next occurrence names the test.
  * [x] **Task 7.1.1.3** (2026-09-25): Guards, verified locally: the production `dist/` has no `__lexical` (the devtools module is tree-shaken because both gate conditions are build-time constants), the e2e bundle has it, and no file is over 24 MiB. Plan:
    * `__lexical` must not appear in `dist/`;
    * no file in `dist/` may exceed 24 MiB;
    * `vocab.bin` must be present.
  * [x] **Task 7.1.1.4** (2026-09-25): The `describe.skipIf` guards also check `REQUIRE_VOCAB`, and an explicit test fails with a clear message if the vocabulary is missing. With `REQUIRE_VOCAB=1` locally: 249 tests, none skipped.
  * [x] **Task 7.1.1.5** (2026-09-25): Devtools gate `DEV || MODE === "e2e"` (a build mode instead of a `.env.e2e` file, which the SEC-03 ignore rules would block); scripts `build:e2e` and `preview:e2e`; `playwright.config.ts` switches its web server on `E2E_SERVER=preview`. `.gitignore` gets `/dist-e2e`, `/.wrangler`, and the SEC-03 patterns it was missing (`.env.*` except `.env.example`, `secrets/`, `credentials*.json`, `*.pem`, `*.key`, `.mcp.json`).
  * [ ] **Task 7.1.1.6**: A ruleset on `master` requiring `verify` and `e2e`; no force pushes; 0 required approvals (solo developer; the checks are the gate).
  * [ ] **Task 7.1.1.7**: `.gitattributes` (`* text=auto eol=lf`, binaries marked) so the CRLF churn stops and Linux CI and Windows agree on hashes. **This renormalizes line endings across the repo in one commit: coordinate it and verify with `git diff --stat`.**
  * [~] **Task 7.1.1.8**: Dependabot (npm + github-actions, grouped weekly) ✅ `.github/dependabot.yml`. ⬜ CodeQL default setup and secret scanning with push protection are repository settings on GitHub (owner's action).
* **Exit criteria**: a green PR run; cold and warm vocabulary-build timings; total CI minutes; the unit-test count in CI equals the local count (no skips).

### Feature 7.1b: Branch Model & Deploy-on-Merge (decided by the owner 2026-09-26)
* [x] **Task 7.1b.1**: `feature/*` → PR → `develop` (tested locally) → PR → `main`, and a push to `main` deploys. CI runs on every PR and on pushes to `develop` and `main`.
* [x] **Task 7.1b.2**: `deploy-production` job: runs only on pushes to `main` with `vars.DEPLOY_ENABLED == 'true'`; needs `verify` + `e2e` and deploys the exact `dist` artifact they tested; GitHub OIDC → GCP Workload Identity Federation → Secret Manager `cloudflare-deploy-token` → `wrangler deploy --message <sha>`; smoke test (page + `vocab.bin`). Actions pinned (google-github-actions/auth v3.0.0, get-secretmanager-secrets v3.0.0). `wrangler` 4.141.0 as a dev dependency; `wrangler.jsonc` (static assets, SPA fallback); `public/_headers` (immutable `/assets/*`, `no-cache` `/vocab/*`, `nosniff`, `Referrer-Policy`); `public/.assetsignore` (`*.map`). `wrangler deploy --dry-run` reads the 17 built assets.
* [ ] **Task 7.1b.3** (owner): the human steps in [docs/setup/accounts-and-deploy.md](../docs/setup/accounts-and-deploy.md): default branch `main`, rulesets, CodeQL and secret scanning, the `production` environment, GCP WIF + Secret Manager, the Cloudflare account + token, repository variables, then `DEPLOY_ENABLED=true`.

### Feature 7.2: Production & Previews (Stage B, ~$1–2/month)
* [ ] **Task 7.2.1**: Cloudflare account, `wrangler.jsonc` (assets, SPA fallback), `public/_headers`:
  * `immutable` for `/assets/*`;
  * `no-cache` for `vocab.json`;
  * `nosniff`, `Referrer-Policy`, and CSP report-only for everything.

  Also `.assetsignore` (`*.map`) and a custom domain (decision D4).
* [ ] **Task 7.2.2**: GCP project: a Workload Identity pool and provider limited to this repo; two service accounts (preview reads only the Cloudflare token; prod is bound to the `production` environment); Secret Manager holds `cloudflare-deploy-token` and `sentry-release-token` (both added to the workspace secrets inventory, with approval).
* [ ] **Task 7.2.3**: `deploy-preview` (same-repo PRs only; never `pull_request_target` with PR code) and `deploy-production` (`master`) jobs, with smoke tests (`curl` the page and the vocabulary headers) and a rollback runbook (`wrangler rollback`) in `docs/`.
* [ ] **Task 7.2.4**: Vocabulary as an immutable release artifact keyed by its input hash (a GitHub Release asset or a bucket), so cache evictions or runner differences can't silently change its version. **Content-hashed `vocab-<version>.bin`**, referenced from the manifest, so it can be cached as `immutable`.
* [ ] **Task 7.2.5**: Decide on the unused 22.5 MiB ONNX runtime wasm file that Vite emits (transformers.js loads its own from jsdelivr): exclude it, or self-host it together with the model (decision D9).
* [ ] **Task 7.2.6**: Deploy skew: handle `vite:preloadError` by reloading once, so old tabs survive a deploy.
* **Exit criteria**: a preview URL posted on a PR; production `curl -I` shows the expected cache headers; first-visit transfer (expected ~7.8 MB) and repeat-visit transfer (expected under 100 KB) measured in a browser; a Lighthouse / Web Vitals baseline.

### Feature 7.3: Observability (Stage B)
* [~] **Task 7.3.1** (DSN gate ✅ 2026-09-25: the hard-coded DSN is removed; Sentry initializes only when `VITE_SENTRY_DSN` is set, with `environment` = build mode, so dev never reports. ⬜ The rest): Sentry `@sentry/browser` 5 → current major: initialise only when a DSN is configured (per environment; dev never reports); `environment` and `release` = git SHA; hidden source maps uploaded from CI and kept out of the deploy; a low trace rate with spans for "vocab loaded" and "engine ready". Issue a fresh DSN key with allowed domains and a rate limit. **Settles Epic 4 · Task 4.5.2.**
* [ ] **Task 7.3.2**: UptimeRobot (the page and `vocab.bin`); Cloudflare Web Analytics (MAU and Core Web Vitals, which validates the cost model); a nightly UI-only Playwright smoke test against production.
* [ ] **Task 7.3.3**: Alerts: Sentry issues and spikes; uptime; Actions failures; GCP budget alerts ($10 / $25 / $50); Cloudflare usage notifications.

### Feature 7.4: Staging, Backend Deploys & Migrations (Stage C/D)
* [ ] **Task 7.4.1**: `master` deploys to staging automatically; production is a manual promote of **the same version**, gated by the `production` environment approval (publishing stays human-gated).
* [ ] **Task 7.4.2**: The Cloud Run `api` service deployed from CI via WIF; the Worker's `/api/*` route proxies to it; secrets from Secret Manager (see [Epic 3 · Feature 3.6](epic-3-enterprise-architecture.md)).
* [ ] **Task 7.4.3**: A database per environment (a branch per PR if using Neon); migrations run before the code deploy, forward-only and compatible with the previous release; a snapshot before each production migration.
* [ ] **Task 7.4.4**: Backend observability: structured JSON logs with a request id; a Cloud Logging exclusion or 30-day retention on the ingest route (client IPs); a Sentry backend project.

### Feature 7.5: Security & Dependency Hygiene (ongoing)
* [ ] **Task 7.5.1**: Triage the `yarn audit` baseline (37 High, mostly build- and dev-time: sharp, adm-zip, lodash) into an `audit-ci` allowlist with a reason and a date for each (DEP-02), then make the audit gate blocking.
* [ ] **Task 7.5.2**: Vite 4.5 (out of support) → current; this clears part of the audit baseline (see [Epic 4](epic-4-modernization.md)).

**Cost**: Stage A $0; Stage B ~$1–2/month; with backend and database ~$6–50/month at 10k MAU and ~$50–100 at 100k (database and Sentry dominate).

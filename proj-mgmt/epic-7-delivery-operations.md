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
  * [ ] **Task 7.1.1.1**: `.github/workflows/ci.yml`, `verify` job:
    * `yarn install --frozen-lockfile --ignore-scripts` (none of the six packages with install scripts needs them);
    * restore the model and vocabulary caches (keyed by *every* input the build script reads, including `src/utils/Dictionary/*` and `src/mitDict.txt`), or build on a miss;
    * typecheck, unit tests, both builds, guards;
    * a report-only `audit-ci`.
  * [ ] **Task 7.1.1.2**: `e2e` job: Playwright against `vite preview` of a `--mode e2e` build (`VITE_E2E_HANDLE=on`); upload the report on failure. `playwright.config.ts` switches its web server by env var.
  * [ ] **Task 7.1.1.3**: Guards:
    * `__lexical` must not appear in `dist/`;
    * no file in `dist/` may exceed 24 MiB;
    * `vocab.bin` must be present.
  * [ ] **Task 7.1.1.4**: Vocabulary-dependent unit tests fail instead of skipping when `REQUIRE_VOCAB=1` (today 5 files skip silently without `public/vocab`).
  * [ ] **Task 7.1.1.5**: Devtools gate: `import.meta.env.DEV || import.meta.env.VITE_E2E_HANDLE === 'on'`; `.env.e2e`; `.gitignore` gets `dist-e2e/` and `.wrangler/`.
  * [ ] **Task 7.1.1.6**: A ruleset on `master` requiring `verify` and `e2e`; no force pushes; 0 required approvals (solo developer; the checks are the gate).
  * [ ] **Task 7.1.1.7**: `.gitattributes` (`* text=auto eol=lf`, binaries marked) so the CRLF churn stops and Linux CI and Windows agree on hashes. **This renormalizes line endings across the repo in one commit: coordinate it and verify with `git diff --stat`.**
  * [ ] **Task 7.1.1.8**: Dependabot (npm + github-actions, grouped weekly), CodeQL default setup, secret scanning with push protection.
* **Exit criteria**: a green PR run; cold and warm vocabulary-build timings; total CI minutes; the unit-test count in CI equals the local count (no skips).

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
* [ ] **Task 7.3.1**: Sentry `@sentry/browser` 5 → current major: initialise only when a DSN is configured (per environment; dev never reports); `environment` and `release` = git SHA; hidden source maps uploaded from CI and kept out of the deploy; a low trace rate with spans for "vocab loaded" and "engine ready". Issue a fresh DSN key with allowed domains and a rate limit. **Settles Epic 4 · Task 4.5.2.**
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

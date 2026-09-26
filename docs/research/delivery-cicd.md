# Delivery research: hosting, environments, CI/CD and operations for Lexical Fountain

> **Provenance**: researched 2026-09-25 by a delegated research agent (web search plus official pricing and docs pages; no code was run). Prices marked **(verify)** were not read from an official page, and even the rest came through an automated page reader, so re-check every price before spending money. The combined recommendation and the decisions it needs are in [platform-plan.md](platform-plan.md).

> **Since this report**: the play log added one unit-test file and one e2e test (231 unit, 17 e2e as of `cf10128`).

Status: research report, decision-ready · 2026-09-25 · repo `Dima11235813/matter-js-demo` (public, default branch `master`)

---

## 1. Question

How should Lexical Fountain be built, tested, hosted, and operated so that:

- every PR is checked automatically (typecheck, about 230 unit tests, the vocab build, a production build, and Playwright e2e) and gets a preview URL;
- production serves an 8 MB `vocab.bin` and hashed bundles with long-lived caching at 10k to 100k MAU for little or no money;
- a later backend (API plus Postgres, possibly serverless) and auth can be added same-origin, with staging and a database per environment;
- the pipeline meets the workspace standards: secrets live in a vault (GCP Secret Manager), credentials are short-lived via OIDC, lockfiles are committed, installs ignore scripts, npm audit is clean of High/Critical or has documented exceptions, and nothing is deleted.

### What the repo looks like today (measured 2026-09-25)

| Fact | Value | Why it matters |
| :--- | :--- | :--- |
| Toolchain | Yarn 1.22 (classic), Node 22, Vite 4.5.14 (current is 8.3), TypeScript 7 | `yarn install --frozen-lockfile --ignore-scripts`; Vite 4 is out of support |
| Built assets (`dist/`) | `index-*.js` 1.79 MB (br 0.41 MB), `SpaceWorld-*.js` 0.56 MB (br 0.12), `transformers.web-*.js` 0.57 MB (br 0.14), **`ort-wasm-simd-threaded.asyncify-*.wasm` 23.57 MB = 22.5 MiB** (br 3.3 MB) | The wasm file is within 2.5 MiB of Cloudflare's 25 MiB per-file cap |
| Vocabulary | `vocab.bin` 7.76 MB (br 7.12 MB: int8 vectors barely compress), `vocab.json` 0.20 MB (br 0.07) | About 7.8 MB of compressed transfer per cold first visit; this sets the bandwidth cost |
| Runtime third parties | transformers.js loads the ORT `.mjs` and `.wasm` from **cdn.jsdelivr.net** by default (`backends/onnx.js` sets `wasmPaths` to jsdelivr), and the MiniLM weights (about 23 MB) from **huggingface.co** | The 22.5 MiB wasm that Vite emits into `dist/` is currently dead weight. It still counts toward per-file limits and needs CSP entries |
| Vocab build inputs | `scripts/build-vocab.mjs` reads `data/vocab/*`, **and also** `src/utils/Dictionary/{googleMostCommonDict.js,combinationOfAllDict.js,scribdDict.js,Dict3.ts,corporaExplitives.js}` and `src/mitDict.txt`, plus the model and runtime versions | A cache key over only `data/vocab/*` and the script would go stale when these change |
| Vocab model cache (Node) | `node_modules/@huggingface/transformers/.cache/Xenova/...` | Cache this path in CI so a vocab rebuild does not re-download the model |
| Unit tests that need the vocab | `expression`, `keywords`, `relationPairs`, `spaceFidelity`, `vocabQuality` use `describe.skipIf(!present)` | **In CI these tests silently skip unless the vocab is restored first** |
| Dev-only handle | `if (import.meta.env.DEV) installDevtools()` in `src/index.tsx` sets `window.__lexical`; `tests/semanticPlayground.spec.ts` depends on it | `vite build` always has `DEV=false`, so e2e cannot run against any build without an explicit flag |
| Playwright | `webServer: yarn start` (dev server, port 3000), 1 worker, 10 s start timeout | Needs a mode that serves a built bundle |
| Packages with install scripts | esbuild 0.18 (postinstall), onnxruntime-node 1.24 (postinstall), sharp 0.34 (install), @parcel/watcher (install), protobufjs (postinstall), core-js-pure (postinstall) | See section 4.2: none of them appears to be needed |
| `yarn audit` | 81 findings in 571 packages: 3 Low, 41 Moderate, **37 High** (for example sharp/libvips, lodash, path-to-regexp, adm-zip) | DEP-02 fails today, so a blocking audit gate needs a triaged baseline first |
| Sentry | `@sentry/browser` **^5.15**, hardcoded DSN, initialised in every mode | Dev sessions already rate-limited the production project (Epic 4, Task 4.5.2). The source-map tooling needs SDK 7.47 or later |
| CI / hosting | none (no `.github/`, no `.gitattributes`) | Greenfield |

---

## 2. Hosting compared

Assumptions for the cost columns: each MAU does about 1.5 cold loads of about 7.8 MB (bundles plus vocab, brotli), and repeat visits revalidate or hit the browser cache. That gives **about 12 MB per MAU: about 120 GB/month at 10k MAU and about 1.2 TB/month at 100k MAU**. The MiniLM weights and the ORT wasm come from HF and jsdelivr today, so they are not billed to us. Self-hosting them would add up to about 26 MB per player who adds a new word. Prices are hosting-only and in USD per month. Unverified figures are flagged (verify).

| Host | Previews per PR | Custom domain + TLS | Headers and caching control | Per-file limit (8 MB vocab, 22.5 MiB wasm) | @10k MAU (~120 GB) | @100k MAU (~1.2 TB) | Future backend pairing | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Cloudflare Workers (static assets)** | Yes: `wrangler versions upload --preview-alias pr-N` gives `pr-N-<worker>.<sub>.workers.dev`. Workers Builds can also post PR comments. Can be gated by Cloudflare Access | Yes (Custom Domains; zone on Cloudflare DNS) | `_headers` file (100 rules); default `public, max-age=0, must-revalidate` + ETag; `immutable` supported | **25 MiB** per file; 20k files (Free) | **$0**: static asset requests are "free and unlimited" | **$0** | **Best**: same Worker handles `/api/*` via `run_worker_first`; D1/KV/R2, Hyperdrive to Postgres (free tier 100k queries/day), or proxy to Cloud Run | Cloudflare's investment is going to Workers. No OIDC for deploys (API token) |
| Cloudflare Pages | Yes (automatic per branch/PR) | Yes | `_headers` (100 rules), `_redirects` | 25 MiB; 20k files; 500 builds/mo (Free) | $0 | $0 | Pages Functions (a subset of Workers) | Still supported, but new features ship to Workers. Pick Workers for a new project |
| Netlify | Yes (Deploy Previews) | Yes | `_headers` / `netlify.toml` | No documented per-file cap for static files (verify) | Free = 300 credits ≈ 15 GB, **not enough**. Pro $20 with 3,000 credits: 120 GB × 20 = 2,400 plus deploys (15 credits each) plus requests, **about $20–30** (verify) | ≈ 24,000 credits, **about $150–170** (verify) | Functions; `/api/*` proxy rewrites to any origin | Credit pricing: 20 credits/GB (≈$0.13/GB); personal access token, no OIDC |
| Vercel | Yes (best-in-class preview UX) | Yes | `vercel.json` headers/rewrites | 100 MB upload (Hobby CLI) | Hobby covers 100 GB but is **non-commercial only**. Pro **$20** (verify) includes Flat Rate CDN 1 TB / 1M requests | Pro $20 + $20 tier (10M requests / 50 TB), **about $40** (verify) | Functions; rewrites to external origins | Hobby cannot connect to repos owned by an org; deploys from CI need a `VERCEL_TOKEN` |
| Firebase Hosting | Yes: preview channels via `FirebaseExtended/action-hosting-deploy`, which comments on the PR; channels expire | Yes | `firebase.json` headers | 2 GB per file | Blaze: 10 GB free, then $0.15/GB, **about $16** | **about $180** | **Good**: `rewrites` send `/api/**` to Cloud Run on the same origin (but preview channels point at the *live* Cloud Run service) | All-GCP, **fully keyless** via Workload Identity Federation |
| GitHub Pages | No (one site per repo) | Yes | **No custom headers** (fixed `max-age=600`) | 100 MB file; 1 GB site | $0 but past the 100 GB soft limit | Past the soft limit | None (cross-origin API + CORS only) | "Not for online business"; keyless deploy via `actions/deploy-pages` (OIDC). **Rejected**: no cache control, no previews |
| GCP Cloud Storage + Cloud CDN (global LB) | DIY (prefix per PR) | Yes (managed certs on LB) | Full (object metadata) | 5 TiB | LB forwarding rule ≈ $18 + $0.08/GiB egress ≈ **$28** (verify) | ≈ $18 + $89 + lookups ≈ **$110** (verify) | LB URL map routes `/api/*` to Cloud Run (serverless NEG), same origin | Keyless WIF; most setup work; fixed LB cost even at zero traffic |
| GCP Cloud Run (nginx container) | Revision tags (`--tag pr-12`) give per-PR URLs | Yes (domain mapping or LB) | Full | Response limits apply; no CDN without LB | ≈ $0.12/GiB egress + CPU ≈ **$15** (verify) | ≈ **$140+** (verify) | Same service or sibling service | Wrong tool for 8 MB static files; cold starts |

Sources for limits and prices: Cloudflare Pages limits, Workers limits, Workers static-asset billing, Workers pricing, Netlify pricing, Vercel limits and fair-use pages, Firebase Hosting pricing, GitHub Pages limits, Cloud CDN price summaries (see Sources).

**Hosting verdict:** use **Cloudflare Workers with static assets**. It costs $0 at 100k MAU and the vocab file is under the limits. Previews come from preview aliases, cache headers go in a `_headers` file, and a backend can be added in the same Worker on the same origin, or proxied to Cloud Run if the backend research lands on GCP. **Runner-up: Firebase Hosting + Cloud Run**, chosen only if a single-vendor, fully keyless GCP setup matters more than about $16–180 a month in bandwidth.

### Caching plan (any host)

| Path | Header | Note |
| :--- | :--- | :--- |
| `/assets/*` (Vite content-hashed) | `Cache-Control: public, max-age=31536000, immutable` | Safe: filenames change with content |
| `/index.html`, `/` | default `max-age=0, must-revalidate` (ETag) | Always revalidate the entry point |
| `/vocab/vocab.json` | `no-cache` (ETag revalidation) | Small; carries `version` |
| `/vocab/vocab.bin` | **today:** `max-age=0, must-revalidate` (ETag gives cheap 304s). **after the rename:** `immutable` | **The filename is not content-hashed.** Marking it `immutable` today would pin stale vectors against a new manifest (the app's size check would throw). Roadmap item: have the build emit `vocab-<version>.bin` and reference it from the manifest. Alternatively, inject the version at build time through Vite `define`, so `vocab.json` and `.bin` can still be fetched in parallel |

Also add `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a **`Content-Security-Policy-Report-Only`** first. The policy must allow `cdn.jsdelivr.net` (ORT mjs/wasm), `huggingface.co` plus its LFS/Xet redirect hosts (verify the exact hosts in a browser network log), Google Fonts, Sentry ingest, and `'wasm-unsafe-eval'`. transformers.js also uses `new Function`, so test whether `'unsafe-eval'` is required.

---

## 3. Environments and config

### 3.1 Environment matrix

| Environment | How it's built | Where | `window.__lexical` | Profanity | Sentry | Data (later) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Local dev** | `vite` (DEV=true) | `localhost:3000` | on | unfiltered (preview with `VITE_PROFANITY_FILTER=on`) | **off** (no DSN) | local Postgres (Docker) or a personal Neon branch |
| **CI e2e build** | `vite build --mode e2e --outDir dist-e2e` with `.env.e2e`: `VITE_E2E_HANDLE=on` | `vite preview` on the runner | on (flag) | **filtered** (DEV=false, same as prod) | off | ephemeral DB branch (Phase 2) |
| **PR preview** | production build (`vite build`) | `pr-<n>-lexical.<sub>.workers.dev` (optionally behind Cloudflare Access) | **off** | filtered | `environment=preview` (or off) | per-PR DB branch (Phase 2) |
| **Staging** (Phase 2) | same artifact as prod | `staging.<domain>` | off | filtered | `environment=staging` | `staging` DB branch |
| **Production** | `vite build` | `<domain>` | off | filtered | `environment=production`, release = git SHA | main DB |

Before Phase 2 there is no backend, so **staging is unnecessary**: PR previews plus `master` deploying to production is enough. Staging arrives together with the database and migrations.

### 3.2 How config flows

- **Build time (`VITE_*`, `import.meta.env.*`)**: values are inlined and public. Use them only for things that must be decided at build time: `MODE`, `DEV`, `VITE_E2E_HANDLE`, `VITE_SENTRY_RELEASE` (git SHA), and the vocab version. Vite exposes only `VITE_*` to client code, so a non-prefixed secret cannot leak into the bundle by accident. **Nothing secret ever goes in a `VITE_*` variable.**
- **Runtime (per deploy, no rebuild)**: things that differ between preview, staging, and prod, such as the Sentry environment, feature flags, and a future API base, should come from **`/config.json` served by the Worker** (wrangler `vars` per environment) or be derived from `location.hostname`. That lets you **build once and promote the same artifact** from staging to production in Phase 2. Prefer a same-origin `/api`, so the API URL needs no config at all.
- **Feature flags**: start with a typed `src/config/flags.ts` that merges build-time defaults, runtime `/config.json`, and a dev-only `localStorage` override. Adopt a hosted flag service only if you need targeting or percentage rollouts (Workers gradual deployments already cover percentage rollout of a whole version).
- **Keeping dev-only handles out of production**:
  1. Change the gate to `if (import.meta.env.DEV || import.meta.env.VITE_E2E_HANDLE === 'on') installDevtools();`. In a normal production build both sides are compile-time constants (`false` and `undefined === 'on'`), so the dynamic `devtools` code is tree-shaken.
  2. **CI guard:** after the production build, `! grep -rl "__lexical" dist/`. This fails the pipeline if the handle ever ships.
  3. A CI guard that no file in `dist/` exceeds 24 MiB (headroom under Cloudflare's 25 MiB).
- **Secrets per environment**: GitHub Environments `preview` and `production` (Phase 2 adds `staging`), with deploy credentials fetched at job time (section 5). `.env` files stay local caches (SEC-05); add `.wrangler/` and `dist-e2e/` to `.gitignore`.
- **Database per environment (Phase 2, backend research pending)**: Neon branching maps cleanly onto these environments: one branch per PR (Free plan: **10 branches per project**, so close PR branches when the PR closes), plus `staging` and `main`. Reach it from Workers via Hyperdrive (included in Workers plans) or from Cloud Run directly. Store the connection strings in GCP Secret Manager and push them into Worker secrets or Hyperdrive config at deploy time. Removing a PR's DB branch is a cloud-resource cleanup, not a file delete, but make it an explicit, logged workflow step.

---

## 4. CI/CD pipeline

### 4.1 Shape

```
PR opened/updated ──► verify (install → vocab restore/build → typecheck → unit → audit[report] → builds + guards)
                          └─► e2e (Playwright vs vite preview of dist-e2e)
                                   └─► deploy-preview (same-repo PRs only) → smoke test → PR comment
push to master ─────► verify → e2e → deploy-production (environment: production) → Sentry release → smoke test
Phase 2: master → staging; production = manual promote (workflow_dispatch or tag) with environment approval
weekly/nightly: synthetic prod check · CodeQL · Dependabot
```

### 4.2 Installs with scripts ignored

`yarn install --frozen-lockfile --ignore-scripts` (Yarn classic; the flag only affects this install, so `pre*` hooks of `yarn run` still work). Review of the six packages with install scripts:

| Package | What its script does | Needed? |
| :--- | :--- | :--- |
| esbuild 0.18 | Swaps the JS shim for the native binary (optimisation) | **No**: the binary comes from the `@esbuild/linux-x64` optional dependency. Never combine with `--ignore-optional` |
| onnxruntime-node 1.24 (vocab build) | Downloads **CUDA** EP binaries only; CPU binaries ship in `bin/napi-v6/linux` | **No** |
| sharp 0.34 (transitive via transformers) | Checks the prebuilt `@img/sharp-*` package, else builds from source | **No** (and unused by this app) |
| @parcel/watcher (via sass) | Prebuilt optional deps | **No** (watch mode only) |
| protobufjs, core-js-pure | Version check / banner | **No** |

Future adds to check: `wrangler`/`workerd` and `@sentry/cli` both ship platform binaries. Recent versions use optional deps, but confirm with a CI run. If a package ever does need its script, run that one script explicitly as a named workflow step (for example `node node_modules/<pkg>/install.js`), or adopt an allowlist tool such as `@lavamoat/allow-scripts` (verify Yarn 1 support). Never re-enable scripts globally. Playwright browsers install with `npx playwright install --with-deps chromium`, which is an explicit command, not a lifecycle script.

### 4.3 Vocab build and caching

- **Key**: hash every input the script reads, plus the runtime versions:
  `hashFiles('scripts/build-vocab.mjs','data/vocab/**','src/utils/Dictionary/googleMostCommonDict.js','src/utils/Dictionary/combinationOfAllDict.js','src/utils/Dictionary/scribdDict.js','src/utils/Dictionary/Dict3.ts','src/utils/Dictionary/corporaExplitives.js','src/mitDict.txt')` + `transformers` version + `onnxruntime-node` version.
- **Also cache the model** at `node_modules/@huggingface/transformers/.cache`, keyed by model plus transformers version.
- **Determinism risk:** `vocab.json.version` hashes the vector bytes, and saved analogies record which version produced them. GitHub's cache **evicts entries not used for 7 days** (10 GB per repo cap). A rebuild on a different runner CPU could produce slightly different floats, and therefore a new version, with no input change. **Phase 1 recommendation: treat the vocab as an immutable release artifact.** On `master`, if no asset exists for the input hash, build it and upload it as a GitHub Release asset `vocab-<inputhash>` (or to an R2/GCS bucket). Every job downloads it by hash. The Actions cache then becomes only an accelerator.
- Make vocab-dependent tests **fail instead of skip** in CI, for example `describe.skipIf(!present && !process.env.REQUIRE_VOCAB)`, with `REQUIRE_VOCAB=1` set in the workflow.

### 4.4 e2e: dev build or test build?

**Run CI e2e against a production-like "e2e" build** (`vite build --mode e2e`, served by `vite preview --port 3000 --strictPort`), with the handle enabled by the explicit build flag.

- This exercises what users run: minified chunks, lazy three.js, `BASE_URL`, filtered profanity, and asset paths. It also avoids Vite's dep-optimizer reload, which CLAUDE.md already documents as a flake source.
- The production artifact is built from the same commit without the flag, and the `__lexical` grep guard proves the handle is absent.
- Keep dev-server e2e for local iteration: `playwright.config.ts` can switch `webServer.command` on an env var and raise the 10 s timeout for CI.
- After a preview deploy, run a small **UI-only smoke test** (no handle) against the preview URL, and `curl -I` the vocab and asset headers.
- Open item: if any e2e path adds an out-of-vocabulary word, the test downloads the model from Hugging Face during CI (slow and flaky). Mock it with Playwright `page.route` or keep e2e inside the vocabulary.

### 4.5 YAML sketch

`.github/workflows/ci.yml`. This is a sketch: pin every action to a full commit SHA, and let Dependabot bump them. The majors named here were current on 2026-09-25: checkout v7, setup-node v7, cache v6, google-github-actions/auth v3, get-secretmanager-secrets v3.

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [master]
  workflow_dispatch:

permissions:
  contents: read            # least privilege by default; jobs widen explicitly

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

env:
  NODE_VERSION: '22'
  REQUIRE_VOCAB: '1'        # vocab-dependent unit tests fail instead of skipping

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@<sha>        # v7
      - uses: actions/setup-node@<sha>      # v7
        with: { node-version: '${{ env.NODE_VERSION }}', cache: yarn }

      - name: Install (frozen lockfile, no install scripts)
        run: yarn install --frozen-lockfile --ignore-scripts --non-interactive

      - name: Vocab cache key
        id: vk
        run: |
          echo "rt=tf$(node -p "require('@huggingface/transformers/package.json').version")-ort$(node -p "require('onnxruntime-node/package.json').version")" >> "$GITHUB_OUTPUT"

      - name: Restore model cache
        uses: actions/cache@<sha>           # v6
        with:
          path: node_modules/@huggingface/transformers/.cache
          key: hf-model-all-MiniLM-L6-v2-q8-${{ steps.vk.outputs.rt }}

      - name: Restore vocab
        id: vocab
        uses: actions/cache@<sha>
        with:
          path: public/vocab
          key: vocab-${{ steps.vk.outputs.rt }}-${{ hashFiles('scripts/build-vocab.mjs', 'data/vocab/**', 'src/utils/Dictionary/googleMostCommonDict.js', 'src/utils/Dictionary/combinationOfAllDict.js', 'src/utils/Dictionary/scribdDict.js', 'src/utils/Dictionary/Dict3.ts', 'src/utils/Dictionary/corporaExplitives.js', 'src/mitDict.txt') }}
        # Phase 1: replace with "download release asset vocab-<hash>, else build + upload on master".

      - name: Build vocab (cache miss only; several minutes)
        if: steps.vocab.outputs.cache-hit != 'true'
        run: yarn vocab:build

      - run: npx tsc --noEmit -p .
      - run: yarn test:unit

      - name: Dependency audit (report-only until the High baseline is triaged)
        run: yarn audit-ci --config audit-ci.jsonc   # audit-ci pinned as a devDependency; allowlist = documented exceptions
        continue-on-error: true                       # flip to blocking once the baseline is clean (DEP-02)

      - name: Production build
        run: yarn vite build
        env:
          VITE_SENTRY_RELEASE: ${{ github.sha }}
      - name: E2E build (dev handle enabled, never deployed)
        run: yarn vite build --mode e2e --outDir dist-e2e

      - name: Guards
        run: |
          if grep -rl "__lexical" dist/; then echo "::error::dev handle leaked into production build"; exit 1; fi
          big=$(find dist -type f -size +24M); if [ -n "$big" ]; then echo "::error::file(s) over 24 MiB: $big"; exit 1; fi
          test -s dist/vocab/vocab.bin

      - uses: actions/upload-artifact@<sha>
        with: { name: dist, path: dist, retention-days: 7 }
      - uses: actions/upload-artifact@<sha>
        with: { name: dist-e2e, path: dist-e2e, retention-days: 3 }

  e2e:
    needs: verify
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@<sha>
      - uses: actions/setup-node@<sha>
        with: { node-version: '${{ env.NODE_VERSION }}', cache: yarn }
      - run: yarn install --frozen-lockfile --ignore-scripts --non-interactive
      - run: npx playwright install --with-deps chromium
      - uses: actions/download-artifact@<sha>
        with: { name: dist-e2e, path: dist-e2e }
      - name: Playwright against the built e2e bundle
        run: yarn test:e2e
        env:
          E2E_SERVER: preview   # playwright.config: webServer = `vite preview --outDir dist-e2e --port 3000 --strictPort`
      - if: failure()
        uses: actions/upload-artifact@<sha>
        with: { name: playwright-report, path: [playwright-report, test-results], retention-days: 7 }

  deploy-preview:
    # never for fork PRs (no secrets there); never use pull_request_target with PR code
    if: github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository
    needs: [verify, e2e]
    runs-on: ubuntu-latest
    environment:
      name: preview
      url: ${{ steps.up.outputs.url }}
    permissions: { contents: read, id-token: write, pull-requests: write }
    steps:
      - uses: actions/checkout@<sha>
      - uses: actions/setup-node@<sha>
        with: { node-version: '${{ env.NODE_VERSION }}', cache: yarn }
      - run: yarn install --frozen-lockfile --ignore-scripts --non-interactive   # wrangler pinned as devDependency
      - uses: actions/download-artifact@<sha>
        with: { name: dist, path: dist }
      - uses: google-github-actions/auth@<sha>          # v3 — OIDC → Workload Identity Federation, no JSON key
        with:
          workload_identity_provider: ${{ vars.GCP_WIF_PROVIDER }}
          service_account: ${{ vars.GCP_DEPLOY_SA_PREVIEW }}
      - id: secrets
        uses: google-github-actions/get-secretmanager-secrets@<sha>   # v3 — values are masked in logs
        with:
          secrets: |-
            cf:${{ vars.GCP_PROJECT }}/cloudflare-deploy-token
      - id: up
        name: Upload preview version
        env:
          CLOUDFLARE_API_TOKEN: ${{ steps.secrets.outputs.cf }}
          CLOUDFLARE_ACCOUNT_ID: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          yarn wrangler versions upload --preview-alias "pr-${{ github.event.number }}" --message "${{ github.sha }}"
          echo "url=https://pr-${{ github.event.number }}-lexical.${{ vars.CF_WORKERS_SUBDOMAIN }}.workers.dev" >> "$GITHUB_OUTPUT"
      - name: Smoke test preview
        run: |
          curl -fsS "${{ steps.up.outputs.url }}/" | grep -q '<div id="root">'
          curl -fsSI "${{ steps.up.outputs.url }}/vocab/vocab.bin" | grep -iq 'content-length'
      # optional: actions/github-script to post/update a PR comment with the URL

  deploy-production:
    if: github.event_name == 'push' && github.ref == 'refs/heads/master'
    needs: [verify, e2e]
    runs-on: ubuntu-latest
    environment: { name: production, url: https://<domain> }
    concurrency: { group: production, cancel-in-progress: false }
    permissions: { contents: read, id-token: write }
    steps:
      - uses: actions/checkout@<sha>
      - uses: actions/setup-node@<sha>
        with: { node-version: '${{ env.NODE_VERSION }}', cache: yarn }
      - run: yarn install --frozen-lockfile --ignore-scripts --non-interactive
      - uses: actions/download-artifact@<sha>
        with: { name: dist, path: dist }
      - uses: google-github-actions/auth@<sha>
        with:
          workload_identity_provider: ${{ vars.GCP_WIF_PROVIDER }}
          service_account: ${{ vars.GCP_DEPLOY_SA_PROD }}   # WIF binding restricted to environment:production
      - id: secrets
        uses: google-github-actions/get-secretmanager-secrets@<sha>
        with:
          secrets: |-
            cf:${{ vars.GCP_PROJECT }}/cloudflare-deploy-token
            sentry:${{ vars.GCP_PROJECT }}/sentry-release-token
      - name: Sentry release + source maps (maps are built "hidden" and excluded from deploy via .assetsignore)
        env:
          SENTRY_AUTH_TOKEN: ${{ steps.secrets.outputs.sentry }}
          SENTRY_ORG: ${{ vars.SENTRY_ORG }}
          SENTRY_PROJECT: ${{ vars.SENTRY_PROJECT }}
        run: |
          yarn sentry-cli sourcemaps inject dist
          yarn sentry-cli sourcemaps upload --release "${{ github.sha }}" dist
      - name: Deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ steps.secrets.outputs.cf }}
          CLOUDFLARE_ACCOUNT_ID: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}
        run: yarn wrangler deploy --message "${{ github.sha }}"
      - name: Smoke test production
        run: |
          curl -fsS https://<domain>/ | grep -q '<div id="root">'
          curl -fsSI https://<domain>/vocab/vocab.bin | grep -iq 'content-length'
      # rollback: `wrangler rollback <version-id>` (manual, documented in the runbook)
```

Supporting files (sketches):

```jsonc
// wrangler.jsonc — Phase 1 is assets-only; Phase 2 adds "main" and run_worker_first for /api/*
{
  "name": "lexical",
  "compatibility_date": "2026-09-25",
  "assets": {
    "directory": "./dist/",
    "not_found_handling": "single-page-application"
    // Phase 2: "main": "./worker/index.ts", "binding": "ASSETS", "run_worker_first": ["/api/*"]
  }
}
```

```text
# public/_headers  (copied into dist/)
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/vocab/vocab.json
  Cache-Control: no-cache
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy-Report-Only: <see section 2>

# public/.assetsignore
*.map
```

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm          # works with yarn.lock v1
    directory: /
    schedule: { interval: weekly }
    groups:
      minor-and-patch: { update-types: [minor, patch] }
    open-pull-requests-limit: 5
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly }
```

### 4.6 Branch protection

The repo is public, so rulesets are free. Ruleset on `master`: require a PR; require the `verify` and `e2e` status checks; block force pushes and deletion; require linear history (optional). Set required approvals to 0, because a solo dev cannot approve their own PR; the checks are the gate. Keep admin bypass for emergencies only and log each use in the epic. The `production` environment allows only `master`. In Phase 2 the `production` environment gets **required reviewer = you** with "prevent self-review" off. That turns a production promote into a deliberate click, which matches PERM-03 ("publishing live stays human-gated").

Add a `.gitattributes` (`* text=auto eol=lf`, binaries marked `binary`) so the CRLF churn noted in CLAUDE.md stops and CI (Linux) and local (Windows) agree on file hashes, including the vocab input hash.

---

## 5. Secrets and identity

| Credential | Needed by | Recommendation |
| :--- | :--- | :--- |
| GCP access | Deploy jobs (to read Secret Manager); Phase 2 Cloud Run/Cloud SQL deploys | **GitHub OIDC → GCP Workload Identity Federation** via `google-github-actions/auth` (`id-token: write`). No JSON keys. Provider attribute condition: `assertion.repository == 'Dima11235813/matter-js-demo'`. Use **two service accounts**: a *preview* SA that can read only `cloudflare-deploy-token`, and a *prod* SA bound to `principal://…/subject/repo:Dima11235813/matter-js-demo:environment:production`, which can read the prod secrets |
| Cloudflare API token | `wrangler` deploys | **Cloudflare has no OIDC for Wrangler deploys yet** (open feature request, `cloudflare/wrangler-action#402`). Use an **account-scoped token** limited to *Workers Scripts: Edit* on the one account (set up custom domains once by hand), with a **TTL/`expires_on`** of about 90 days. Store it as the source of truth in **GCP Secret Manager** and fetch it through WIF at job time. It then never sits in GitHub, rotation happens in one place, and access is audit-logged. Record it in `secrets-inventory.md` (SEC-04). Simpler interim: a GitHub *environment* secret restricted to `master` |
| Zero-token alternative | — | **Cloudflare Workers Builds** (Cloudflare's own Git integration) builds and deploys `master` and per-branch previews with PR comments, so no token lives in CI. Trade-offs: it rebuilds rather than deploying the tested artifact, the vocab must be downloadable (release asset), and the Sentry token moves into Cloudflare's build env. Reasonable if you want *no* deploy credential at all |
| Netlify / Vercel tokens (if chosen instead) | CLI deploys | Personal access tokens (no deploy OIDC; verify). Same Secret Manager pattern; set an expiry |
| Sentry auth token | Source-map upload / release creation | **Organization auth token** (release/source-map scopes only), prod job only, stored in Secret Manager. No OIDC exchange verified for Sentry uploads. **Never** in `VITE_*` or `Sentry.init` |
| Sentry DSN | Browser SDK | **Not a secret** (Sentry: DSNs only allow *submitting* events). Still move it to runtime/per-env config, turn on **allowed domains** and a **per-key rate limit**, and consider issuing a fresh key, because the current one has been in a public repo and dev traffic has hit it |
| Phase 2 DB URLs, auth secrets | API runtime | Secret Manager is the source of truth, pushed at deploy into Worker secrets or Hyperdrive config, or mounted as Cloud Run secrets. One secret per environment |

Hard rules for the workflow: `permissions: contents: read` at the top, widened per job; deploy jobs never run for fork PRs; no `pull_request_target` that checks out PR code; secrets never passed as CLI arguments (SEC-08), only as env vars.

---

## 6. Observability and operations

- **Sentry**
  - Upgrade `@sentry/browser` 5.x to the current major (**11.0.0** on npm, 2026-09-25; the source-map tooling needs 7.47 or later).
  - Initialise **only when a DSN is configured**. The DSN comes from production/preview config only, so dev never reports. This settles Epic 4, Task 4.5.2.
  - Set `environment` (production/preview/staging) and `release = git SHA`.
  - Build source maps as `sourcemap: 'hidden'`, upload them via `sentry-cli` or `@sentry/vite-plugin`, and keep `.map` files **out of the deploy with `.assetsignore`**. Avoid the plugin's `filesToDeleteAfterUpload` in any context that runs inside the Drive-synced tree.
  - `browserTracingIntegration` at a low `tracesSampleRate` (about 0.05) records **Web Vitals** plus custom spans for "vocab loaded" and "engine ready".
  - Developer plan is free: 1 user, 5k errors, 5M spans, 1 uptime monitor. Team costs $26/mo (annual) if quotas bite.
- **Traffic / MAU**: Cloudflare Web Analytics is free and includes Core Web Vitals (needs a CSP entry for `static.cloudflareinsights.com`). You need this to validate the cost model above.
- **Uptime**: Sentry's free uptime monitor on `/`, plus **UptimeRobot free** (50 monitors, 5-minute interval; commercial use allowed again per its 2026 help center) checking `/vocab/vocab.bin`. Add a nightly scheduled GitHub Action that runs a UI-only Playwright smoke test against production (free on a public repo) to catch "page loads but engine never becomes ready".
- **Backend logs (Phase 2)**: structured JSON logs with a request id. Workers Logs / Observability (or Logpush) if the API runs on Workers; Cloud Logging if on Cloud Run. Backend errors go to the same Sentry org as a separate project.
- **Alerting**: Sentry issue alerts and spike alerts by email; UptimeRobot email; GitHub Actions failure notifications; **billing alerts** (GCP budget alert, Cloudflare usage notifications).
- **Rollbacks**: `wrangler rollback <version-id>` or the dashboard restores a previous Worker version together with its asset manifest. Old versions stay listed. Phase 2 DB rollbacks follow the expand/contract migration rule: migrations are forward-only and backward-compatible for one release, and a Neon branch snapshot is taken before each prod migration.
- **Deploy skew**: after a deploy, a tab still running the old `index.html` may lazily request a now-missing `SpaceWorld-<hash>.js`. With SPA fallback that request returns `index.html` (200, HTML), so the dynamic import fails. Handle Vite's `vite:preloadError` event by reloading once.
- **Dependency and security scanning** (all free on public repos): Dependabot security plus grouped version updates (npm and github-actions); **CodeQL default setup** for JS/TS; **secret scanning with push protection**; `audit-ci` (Yarn 1 supported) with an allowlist file of GHSA ids, each with a reason and a date (DEP-02). It runs report-only until the 37-High baseline is triaged; most findings are build-time or dev-only (sharp, adm-zip, lodash), and upgrading Vite 4 to 8 should clear a batch. Renovate is the alternative if Dependabot's grouping proves too noisy.

---

## 7. Recommendation, cost and phased plan

**Recommendation:**

- **Hosting**: Cloudflare Workers with static assets for the SPA, with PR previews from preview aliases.
- **CI**: GitHub Actions, with the vocab as a versioned artifact.
- **e2e**: runs against a flag-enabled production-like build.
- **Credentials**: GCP Secret Manager holds deploy tokens, and CI reaches it through OIDC/WIF.
- **Monitoring**: Sentry (upgraded, production-gated, with releases and source maps) plus free uptime and analytics.
- **Backend**: added later in the same Worker on the same origin (`/api/*`), or proxied to Cloud Run if the backend research picks GCP.
- **Fallback**: if single-vendor GCP with fully keyless deploys becomes a hard requirement, switch hosting to Firebase Hosting + Cloud Run.

### Phase 0: CI on PRs (about 1–2 sessions, $0)

1. Add `.github/workflows/ci.yml` (the `verify` and `e2e` jobs), `.gitattributes`, `dependabot.yml`, and `audit-ci.jsonc` with a triaged allowlist. Enable CodeQL default setup and secret scanning.
2. Code changes: the devtools gate (`VITE_E2E_HANDLE`), `.env.e2e`, a `playwright.config.ts` switch to `vite preview`, `REQUIRE_VOCAB` for the vocab tests, `.gitignore` entries (`dist-e2e/`, `.wrangler/`), and the Sentry DSN-presence gate.
3. Ruleset on `master` requiring `verify` and `e2e`.
4. **Measured exit criteria** (recorded in the epic): a green PR run, cold and warm vocab timings, total CI minutes, and an unmodified `yarn test:unit` count equal to the local count (no skipped vocab tests).

### Phase 1: production + previews (about 2–3 sessions, about $1–2/mo)

1. Cloudflare account, `wrangler.jsonc`, `public/_headers`, `.assetsignore`, and a custom domain (zone on Cloudflare DNS; registration about $10–15/yr (verify)).
2. GCP project, WIF pool/provider, and the two SAs; Secret Manager holding `cloudflare-deploy-token` and `sentry-release-token` (a few cents/month (verify)). Add both secrets to `secrets-inventory.md`.
3. `deploy-preview` and `deploy-production` jobs, smoke tests, and a rollback runbook in `docs/`.
4. Sentry upgrade to the current major, per-environment config, releases and source maps, allowed domains and rate limit. Add the UptimeRobot monitor and Cloudflare Web Analytics.
5. The vocab as an immutable release artifact keyed by input hash. **Roadmap:** a content-hashed `vocab-<version>.bin` so it can be marked `immutable`.
6. Decide what to do with the unused 22.5 MiB ORT wasm in `dist/`: exclude it, or self-host it deliberately with `wasmPaths`.
7. **Measured exit criteria**: preview URL posted on a PR; production `curl -I` shows the expected cache headers; Lighthouse/Web Vitals baseline on production; first-visit transfer (expected about 7.8 MB) and repeat-visit transfer (expected <100 KB with 304s) measured in the browser.

### Phase 2: staging, backend deploys, DB migrations (after the backend/auth research; about $5–50/mo)

1. The Worker gets `main` plus `run_worker_first: ["/api/*"]` (or proxies to Cloud Run). Add a `staging.<domain>` environment: `master` deploys to staging automatically, and production is a manual promote of **the same version** (`wrangler versions deploy <id>`) through the `production` environment approval.
2. Postgres (Neon suggested): a branch per PR created and closed by the workflow (Free plan has 10 branches), plus `staging` and `main`. Hyperdrive from Workers (included in the Workers plan).
3. A migrations job (tool chosen with the backend: drizzle-kit, node-pg-migrate, or similar) runs **before** the code deploy, with expand/contract discipline and a snapshot before each prod run.
4. Auth secrets and DB URLs live in Secret Manager and are pushed to Worker secrets at deploy. Add a Sentry backend project and structured logs.

### Estimated monthly cost

| Item | Phase 0 | Phase 1 | Phase 2 @10k MAU | Phase 2 @100k MAU |
| :--- | :--- | :--- | :--- | :--- |
| GitHub (public repo: Actions, rulesets, CodeQL, Dependabot) | $0 | $0 | $0 | $0 |
| Cloudflare Workers static hosting + previews | — | $0 | $5 (Workers Paid, for API headroom) | $5 + API usage beyond 10M req (≈$0.30/M) |
| Domain | — | ≈$1 (verify) | ≈$1 | ≈$1 |
| GCP Secret Manager / WIF | — | <$1 (verify) | <$1 | <$1 |
| Sentry | $0 | $0 (Developer) | $0–26 | $26+ (Team) (verify) |
| Uptime / analytics | — | $0 | $0 | $0 |
| Postgres (Neon or similar) | — | — | $0–19 (verify) | $19–70 (verify) |
| **Total** | **$0** | **≈$1–2** | **≈$6–50** | **≈$50–100** |

For comparison, the same static traffic on Firebase Hosting costs about $16 / $180, on Netlify about $25 / $165, and on Vercel Pro about $20 / $40 (verify all).

---

## 8. Risks and open questions

### Risks

1. **Long-lived Cloudflare token** (no deploy OIDC). *Mitigation:* narrow scope, 90-day TTL, stored in Secret Manager and read via WIF, prod-only binding; or Workers Builds with no token at all. Revisit when `wrangler-action` gains OIDC.
2. **25 MiB per-file cap**: the ORT wasm Vite emits is 22.5 MiB. An `onnxruntime-web` upgrade could break deploys. *Mitigation:* the CI size guard, plus deciding whether to emit or self-host the wasm at all.
3. **Runtime dependence on jsdelivr and Hugging Face** for the ORT runtime and model weights: availability, CSP breadth, and third-party requests revealing player IPs. *Option:* self-host both on Workers assets or R2. The q8 model at about 22 MiB fits under the cap; the extra bandwidth is still $0 on Cloudflare.
4. **Vocab non-determinism across runners or cache evictions** creates a new `version` and orphans saved analogies. *Mitigation:* the vocab as an immutable artifact keyed by input hash.
5. **Silent test skips** when the vocab is missing. *Mitigation:* `REQUIRE_VOCAB`.
6. **Stale-cache or deploy-skew bugs**: the `vocab.bin` name is not hashed, and old tabs can request missing lazy chunks. *Mitigation:* the headers plan above and `vite:preloadError` handling.
7. **Audit debt and old majors**: 37 High advisories, Vite 4 (out of support), and Sentry SDK 5 block a strict DEP-02 gate. Plan the Vite 8 and Sentry 11 upgrades as Epic 4 items.
8. **Public previews** get indexed or shared. *Mitigation:* `X-Robots-Tag: noindex` on previews (how to scope a `_headers` rule to preview hostnames on Workers needs checking; verify), or Cloudflare Access on version URLs.
9. **Vendor concentration** if DNS, hosting, and API all run on Cloudflare. It is acceptable at this scale, and the SPA stays portable (plain static `dist/`).
10. **Drive-synced workspace**: never run `wrangler deploy` or the Sentry upload from the local Drive folder. Deploys happen only in CI, and `.wrangler/` stays gitignored.

### Open questions for the product owner

1. Will the game ever be commercial (ads, payments, paid tiers)? That rules out Vercel Hobby and GitHub Pages, but does not affect Cloudflare.
2. Domain name, and whether previews should be public or behind Cloudflare Access.
3. Where does the backend land (Workers + Hyperdrive vs Cloud Run + Cloud SQL/Neon)? Hosting works either way; it decides whether Phase 2 deploys are mostly `wrangler` or `gcloud`.
4. Should the model and ORT wasm be self-hosted (privacy and reliability) or kept on third-party CDNs (zero bandwidth)?
5. Should preview deploys report to Sentry (environment `preview`) or stay silent?
6. Does any e2e path trigger an out-of-vocabulary encode (a network call to HF in CI)? If yes, mock it.
7. Is multi-threaded WASM wanted? It needs COOP/COEP (cross-origin isolation), which complicates loading from third-party CDNs. Single-word encodes probably do not need it.

---

## 9. Sources

Hosting and limits
- Cloudflare Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Cloudflare Workers limits (static assets 25 MiB, file counts): https://developers.cloudflare.com/workers/platform/limits/
- Workers static assets billing ("free and unlimited"): https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- Workers pricing ($5 minimum, 10M requests): https://developers.cloudflare.com/workers/platform/pricing/
- Workers static asset headers / `_headers`: https://developers.cloudflare.com/workers/static-assets/headers/
- Workers SPA routing, `run_worker_first`: https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
- Workers version/preview URLs and aliases: https://developers.cloudflare.com/workers/configuration/previews/
- Workers Builds (PR preview comments): https://developers.cloudflare.com/workers/ci-cd/builds/
- Migrate from Pages to Workers: https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/
- Pages vs Workers in 2026 (secondary): https://cogley.jp/articles/cloudflare-pages-to-workers-migration , https://bejamas.com/stack/hosting/cloudflare
- Cloudflare updated ToS (large files on Cloudflare-hosted services): https://blog.cloudflare.com/updated-tos
- Hyperdrive free plan: https://developers.cloudflare.com/changelog/2025-04-08-hyperdrive-free-plan/
- Netlify pricing (credits): https://www.netlify.com/pricing/
- Vercel limits: https://vercel.com/docs/limits ; fair use / Hobby non-commercial: https://vercel.com/docs/limits/fair-use-guidelines ; Flat Rate CDN: https://vercel.com/docs/pricing/flat-rate-cdn
- Firebase Hosting quotas and pricing: https://firebase.google.com/docs/hosting/usage-quotas-pricing ; GitHub integration / preview channels: https://firebase.google.com/docs/hosting/github-integration ; rewrites to Cloud Run and preview-channel caveat: https://github.com/FirebaseExtended/action-hosting-deploy/issues/127
- GitHub Pages limits: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits ; no custom cache headers: https://github.com/orgs/community/discussions/11884
- Cloud CDN pricing (secondary summaries; verify on the official page): https://cloud.google.com/cdn/pricing , https://egresscost.com/gcp/cloud-cdn-pricing/

CI/CD, identity, secrets
- google-github-actions/auth (Direct WIF, attribute conditions): https://github.com/google-github-actions/auth
- get-secretmanager-secrets: https://github.com/google-github-actions/get-secretmanager-secrets
- Wrangler OIDC feature request (not available): https://github.com/cloudflare/wrangler-action/issues/402 , https://github.com/cloudflare/workers-sdk/discussions/11434
- Cloudflare token TTL / restrictions: https://developers.cloudflare.com/fundamentals/api/how-to/restrict-tokens/
- esbuild works with `--ignore-scripts` (optional deps): https://esbuild.github.io/getting-started/ , https://github.com/evanw/esbuild/pull/1621
- Vite env variables and modes: https://vite.dev/guide/env-and-mode
- actions/checkout, setup-node, cache releases: https://github.com/actions/checkout/releases , https://github.com/actions/setup-node/releases , https://github.com/actions/cache/releases
- Rulesets / protected branches availability: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
- Neon branching with GitHub Actions: https://neon.com/docs/guides/branching-github-actions ; branch limits in practice: https://github.com/Tristan578/project-forge/issues/10015

Observability
- Sentry DSN is public: https://docs.sentry.io/concepts/key-terms/dsn-explainer.md , https://sentry.zendesk.com/hc/en-us/articles/26741783759899-My-DSN-key-is-publicly-visible-is-this-a-security-vulnerability
- Sentry Vite source maps: https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/vite/
- Sentry pricing: https://sentry.io/pricing/
- UptimeRobot free plan (commercial use): https://help.uptimerobot.com/en/articles/11604710-who-should-use-uptimerobot-s-free-plan , https://uptimerobot.com/pricing/
- npm registry (current versions: @sentry/browser 11.0.0, vite 8.3.1, wrangler 4.141.0 needing Node >= 22): https://registry.npmjs.org/@sentry/browser/latest , https://registry.npmjs.org/vite/latest , https://registry.npmjs.org/wrangler/latest

Local evidence (read-only, 2026-09-25): `package.json`, `vite.config.ts`, `playwright.config.ts`, `src/index.tsx`, `src/devtools.ts`, `src/embeddings/profanity.ts`, `scripts/build-vocab.mjs`, `tests/*.test.ts` (vocab skip guards), `dist/` sizes (gzip/brotli measured), `node_modules/@huggingface/transformers/src/backends/onnx.js` (jsdelivr `wasmPaths` default), `node_modules/onnxruntime-node/script/install.js` (CUDA-only download), `yarn audit --summary`.

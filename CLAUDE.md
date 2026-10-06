# Lexical Fountain (matter-js-demo)

Word-embedding playground: Matter.js + p5 (2D) and three.js (3D) physics where screen distance mirrors meaning. Workspace rules in `D:\GDrive\AGENTS.md` also apply (never delete files; Google Drive sync).

## Where things live

- `src/embeddings/` vector math, index, analogy solver, calibration, profanity policy
- `src/physics/` pure layout/physics models (orbital forces and target models, 3D simulation, molecules, metrics, PCA)
- `src/space/` three.js 3D view; `src/matterJsComp/` 2D Matter/p5 world, dashboard, menu glue
- `src/persistence/` IndexedDB (sync-ready records); `src/services/` use cases; `src/stores/` MobX
- `proj-mgmt/` epics and roadmap (source of truth for plans); `docs/research/` reports + reproducible experiments that drive plans
- `scripts/build-vocab.mjs` builds `public/vocab/`, which is **committed** (SiteGround builds within 300 s and embedding takes ~5 min). After changing its inputs (`data/vocab/**`, the dictionaries, the script), run `yarn vocab:build` and commit `public/vocab`; CI tests the committed files
- Monorepo (Yarn 1 workspaces; the web app stays at the root because files are never moved on Drive): `packages/shared` (`@lexical/shared`: zod DTOs, merge rules, keys, counters; TypeScript source, no build step) and `server/` (`@lexical/server`: Hono API, PGlite locally / Postgres in production). Define a contract once in `@lexical/shared`; `src/persistence/counters.ts` and `keys.ts` only re-export it

## Commands

- Type-check: `npx tsc --noEmit -p .` · Unit tests: `yarn test:unit` · Build: `yarn build`
- End-to-end: `yarn test:e2e` (Playwright, reuses the dev server on port 3000, runs serially; new specs use the `window.__lexical` handle for setup, including `focusedWords()`, and the real UI for the feature under test). CI mode, against the built bundle: `yarn build:e2e` then `CI=1 E2E_SERVER=preview yarn test:e2e` (ports 3000 and 8787 must be free). Playwright also starts the API (`yarn start:server`, in-memory PGlite, dev sign-in tokens) for the sync test; dev-token sign-in from the page is `window.__lexical.account.devSignIn(subject)`
- CI: `.github/workflows/ci.yml` (verify: frozen install with scripts ignored, cached vocabulary, typecheck, unit tests with `REQUIRE_VOCAB=1`, production and e2e builds, guards; e2e: Playwright against the e2e bundle). The dev handle exists only in dev and `--mode e2e`; the guard fails the build if `__lexical` reaches `dist/`
- Sentry initializes only when a build sets `VITE_SENTRY_DSN` (dev and e2e never report)
- Research experiments (kept out of the unit suite): `yarn research:cross-dim` runs all of them; run one with `npx vitest run --config docs/research/experiments/vitest.research.config.ts <name>`
- Rebuild vocabulary: `yarn vocab:build`
- Local sign-in without Google: the local API has dev sign-in on by default (only without `DATABASE_URL` and not in production); dev builds show **test personas** in the account panel, or run `window.__lexical.account.devSignIn("name")`. Each account/persona has its own local database (`lexical-fountain@<uid>`); switching reloads.
- API server: `yarn dev:server` (watch mode) or `yarn start:server` (port 8787; Vite proxies `/api`, `vite preview` too; config in `server/.env.local`, see `server/.env.example`). Server typecheck: `npx tsc --noEmit -p server`. Shared and server tests run in `yarn test:unit` (PGlite in memory)
- Scripts: `yarn dev` = Vite dev server; `yarn start` = the **production** server (`server/src/main.ts` serves `dist/` plus `/api` on `PORT`; SiteGround runs it); `yarn build` = `vite build` only (type-checking is CI's job).
- Deployment (2026-10-05): SiteGround Node.js hosting deploys every push to `main` (install, `yarn build`, `yarn start`); settings and env vars in `proj-mgmt/human-todo/12-siteground-node-hosting.md`. The Cloudflare job stays gated off. Check a deploy locally with `yarn build && NODE_ENV=production PORT=8790 yarn start`.
- Dev server: `npx vite --port 3000 --strictPort --open false`; add `--host 0.0.0.0` so the owner can play-test from another device (they often follow from the Claude mobile app), and run `yarn start:server` alongside for sign-in. At each milestone, share the network URL (`http://<LAN IPv4 from ipconfig>:3000/`), never `localhost`.
- Dev handle in the browser console: `window.__lexical` (`wordBoxes()`, `layoutFidelity()`, `semanticEngine`, `stores`, `deps`)

## Working agreements

- Branches: work on `feature/*`, PR into `develop` (the owner tests locally), PR `develop` into `main`; a push to `main` deploys to production (CI job `deploy-production`, enabled by the `DEPLOY_ENABLED` repository variable). Never commit straight to `main` or `develop` once the rulesets are on.
- Accounts, secrets, and env variable names: `docs/setup/accounts-and-deploy.md` (human steps), `.env.example`, `server/.env.example`.
- Owner actions (accounts, `.env.local` values, console settings, reviews, decisions) go in `proj-mgmt/human-todo/` as numbered items with steps, what they unblock, and a "done when"; detailed account steps stay in `docs/setup/accounts-and-deploy.md` (single source) and the items link to it.
- Early stage (owner, 2026-09-27): the agent may merge its own feature branches into `develop` and `main` (fast-forward when possible) after tests pass; once the rulesets are on, merges go through PRs.

- Work in small, testable milestones; each ends with tests plus a measured number from the running app, recorded in the epic.
- Complex features start with research in `docs/research/` (question, experiments, findings, decision), then a proj-mgmt plan, then an MVP. Measure before claiming; a metric that disagrees with a screenshot means the metric is incomplete.
- Ideas the user raises mid-task go into proj-mgmt as `(roadmap)` items immediately, even when not built now.
- Profanity: local dev is unfiltered by default (`VITE_PROFANITY_FILTER=on` previews); production always filters.

## Lessons learned (environment and harness)

- The repo is on Google Drive: folder locks make git fail mid-operation ("Permission denied"). Retry `git add` on lock errors. Never split or verify commits with `git stash --include-untracked`, `git restore --source=<commit> -- .`, or `git checkout -- .`; a partial tree as `--source` deletes every tracked file it lacks. Stage files explicitly; verify a commit by `git archive <sha>` into a scratch folder outside Drive with `node_modules` junctions for the root **and each workspace** (`server/node_modules`: it holds Node 22 types, while the root has Node 18 types).
- Files written with LF show as modified after git rewrites them with CRLF (`core.autocrlf=true`); `git diff` empty means line endings only.
- An occluded browser window throttles `requestAnimationFrame` to ~1 fps and silently freezes physics: bring the page to front (Playwright `page.bringToFront()`) and reject measurements below 50 fps.
- Vite reloads the page the first time a lazily imported dependency is optimized; list every lazily imported dependency in `optimizeDeps.include` (three.js, zod/mini, firebase/app, firebase/auth). An unlisted one made the sync e2e test take 1.8 min and flake. The first test run after a `vite.config.ts` change can still hit one reload: rerun before investigating.
- Lazy-loading something an event handler needs: never drop the events that arrive while it loads. Physics events like `collisionStart` fire once per contact (resting letters never collide again), so start the load when the mode opens and replay queued events (the lazy dictionary silently broke letter merging, Epic 4 · Task 4.5.8). Every lazy split needs an e2e test of the feature's result, not only of the chunk loading.
- Measure the bundle before shrinking it: build with `--sourcemap hidden` into the scratchpad and attribute bytes per package via the source map. The guess (zod) was 94 KB; the real weight was p5 at 1,040 KB.
- Stopping an `npx vite` background task leaves the Vite node process holding port 3000: find the PID on the port and stop it before restarting.
- q8 ONNX models quantize activations per batch: embed vocabulary words one at a time so build-time vectors match the browser's single-word encodes.
- Matter.js clears forces after every step: apply custom forces in `Events.on(engine, "beforeUpdate")`, not in the p5 draw loop; start the engine with `Runner.run` and stop it with `Runner.stop` on teardown.
- In 384-d embedding space unrelated words are all ~sqrt(2) apart: raw distances make layouts a sphere. Use board-relative targets (see `docs/research/embedding-shape.md`).
- Keep Playwright at one worker: parallel pages (three.js, 8 MB vocabulary, per-frame physics) time out on navigation against the dev server.
- Game out scoring rules before building them: simulate populations (known-good plays, typical plays, exploit strategies, nonsense) and check that no strategy beats real play (see `docs/research/analogy-scoring.md`).
- Test excludes live in `vite.config.ts` (`test.exclude`), never as CLI globs in package.json scripts: on Linux CI, `sh` expanded an unquoted `--exclude **/*.spec.ts` into file names and Vitest ran a Playwright spec (the first CI run failed that way; it passed on Windows).
- Browser checks in 3D: labels move while the camera eases, so read `wordBoxes()` right before each click, hover first (`mouse.move`, short wait), then `mouse.down`/`up`; confirm with `stores.menuStore.selectedWordTexts` instead of assuming the click landed.
- Editing source during a browser check can make Vite fully reload the page (fresh random board, profile dimension restored): re-check the board state (`wordTexts()`) before measuring after any edit.
- 3D camera scale: with `setViewOffset` at full frame size, one world unit is one pixel at `pixelMatchedDistance(fullHeight, FOV)`; use the full height, not the area below the dashboard.
- Patch scripts: create them with the Write tool (never a shell heredoc or `python -` stdin: quotes, `\r\n`, and `\s` escapes get mangled, which broke a regex, an apostrophe, and a whole script in one session); prefer the Edit tool for small edits. Use `.claude/tools/patchlib.py` (`edit`, `append`): the repo mixes LF and CRLF files, and Windows Python defaults to cp1252, so every read and write must be UTF-8 with the file's own line endings (a default-encoding patch once wrote `·` as an invalid byte; check with `iconv -f utf-8 -t utf-8 <file>`).
- `yarn build` can fail once right after "built" when Google Drive holds a lock on `dist/`; rerun before investigating.
- Yarn 1 workspaces on this machine: `yarn workspace <pkg> add …` fails silently (prints only its usage help). Edit the workspace's `package.json` and run `yarn install --ignore-scripts` instead. Run workspace binaries through root scripts (`yarn dev:server`): `npx tsx` inside `server/` resolves a broken path through the workspace symlink.
- Regression reports ("feature X is lost"): reproduce on a fresh page first, then diff the feature's code against the last known-good commit (`git diff <old> HEAD -- <files>`) to separate the regression from original behaviour before changing anything (letters mode: only the lazy dictionary had changed; the hard-impact rule was original).
- Every user-facing mode keeps an e2e test of its outcome through the real UI (letters merge into a word, Discovery spawns an answer, Guess grades four picks, words carry across modes). Performance and refactor work must keep them green; the letters game broke because its only tests took screenshots.
- When a count or limit rule changes (3 picks → 4), grep the stores and UI for the old literal: `MenuStore.toggleWordSelection` silently capped selections at 3, and only the real-click e2e test found it.
- Boards carry across mode switches (Feature 2.14): an e2e test must record the board it starts from instead of assuming a fresh one (switching Discovery → Guess brings 20 words along).
- Phone layout: the owner play-tests on a phone, so check a 375 px viewport (`tests/gameplay.spec.ts`: no horizontal scroll, mode buttons not covered via `elementFromPoint`). `toBeVisible` passes for covered elements; only a hit test proves a button can be tapped.
- CI failures: the Playwright `github` reporter turns failures into check-run annotations; read them through the public API (`/check-runs/<id>/annotations`) when `gh` is not signed in.
- 2D e2e clicks: the dashboard covers part of the canvas and swallows clicks. Choose targets whose `document.elementFromPoint` is the `CANVAS`, and confirm each click through the store instead of assuming it landed.
- This machine runs low on memory: Claude Code can stop idle background servers, a production build took 10 minutes, and cold `page.goto` on the dev server sometimes exceeds 30 s. Stop scratch servers (`vite preview`) after use and rerun a `page.goto` timeout once before investigating.
- The local API's PGlite store (OS temp dir) can be corrupted by a killed process: sync then fails with Postgres `58P01` ("could not open file") in the server log. Run the dev API with `PGLITE_DATA_DIR=memory://` (as Playwright does); when an e2e sync test fails, check whether a reused server on port 8787 is the cause.
- Chain `git add`, `git commit`, and `git push` with `&&` in **one** command line. A push on the next line ran after `git add` failed on a Drive lock and moved `main` (which deploys) to the previous commit.
- A stale `.git/index.lock` (empty, old, no `git.exe` running; left by a killed process) blocks every git command. Move it to the scratchpad instead of deleting it (never-delete rule), after confirming no git process is running.
- Browser probes outside the test suite: put a Playwright script in the scratchpad and import `file:///D:/GDrive/Dev/matter-js-demo/node_modules/playwright/index.mjs`; drive the app through `window.__lexical` and measure the user's scenario (fresh page, their kind of drop) before tuning a constant.
- Before writing a file with the Write tool, check whether it already exists (`git ls-files`, `ls`): Write replaces it whole. A tracked `.env.example` was overwritten once and had to be merged back from git.

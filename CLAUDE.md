# Lexical Fountain (matter-js-demo)

Word-embedding playground: Matter.js + p5 (2D) and three.js (3D) physics where screen distance mirrors meaning. Workspace rules in `D:\GDrive\AGENTS.md` also apply (never delete files; Google Drive sync).

## Where things live

- `src/embeddings/` vector math, index, analogy solver, calibration, profanity policy
- `src/physics/` pure layout/physics models (orbital forces and target models, 3D simulation, molecules, metrics, PCA)
- `src/space/` three.js 3D view; `src/matterJsComp/` 2D Matter/p5 world, dashboard, menu glue
- `src/persistence/` IndexedDB (sync-ready records); `src/services/` use cases; `src/stores/` MobX
- `proj-mgmt/` epics and roadmap (source of truth for plans); `docs/research/` reports + reproducible experiments that drive plans
- `scripts/build-vocab.mjs` builds `public/vocab/` (gitignored; `yarn start`/`yarn build` build it if missing)

## Commands

- Type-check: `npx tsc --noEmit -p .` · Unit tests: `yarn test:unit` · Build: `yarn build`
- End-to-end: `yarn test:e2e` (Playwright, reuses the dev server on port 3000, runs serially; new specs use the `window.__lexical` handle for setup, including `focusedWords()`, and the real UI for the feature under test). CI mode, against the built bundle: `yarn build:e2e` then `CI=1 E2E_SERVER=preview yarn test:e2e` (port 3000 must be free)
- CI: `.github/workflows/ci.yml` (verify: frozen install with scripts ignored, cached vocabulary, typecheck, unit tests with `REQUIRE_VOCAB=1`, production and e2e builds, guards; e2e: Playwright against the e2e bundle). The dev handle exists only in dev and `--mode e2e`; the guard fails the build if `__lexical` reaches `dist/`
- Sentry initializes only when a build sets `VITE_SENTRY_DSN` (dev and e2e never report)
- Research experiments (kept out of the unit suite): `yarn research:cross-dim` runs all of them; run one with `npx vitest run --config docs/research/experiments/vitest.research.config.ts <name>`
- Rebuild vocabulary: `yarn vocab:build`
- Dev server: `npx vite --port 3000 --strictPort --open false`
- Dev handle in the browser console: `window.__lexical` (`wordBoxes()`, `layoutFidelity()`, `semanticEngine`, `stores`, `deps`)

## Working agreements

- Branches: work on `feature/*`, PR into `develop` (the owner tests locally), PR `develop` into `main`; a push to `main` deploys to production (CI job `deploy-production`, enabled by the `DEPLOY_ENABLED` repository variable). Never commit straight to `main` or `develop` once the rulesets are on.
- Accounts, secrets, and env variable names: `docs/setup/accounts-and-deploy.md` (human steps), `.env.example`, `server/.env.example`.

- Work in small, testable milestones; each ends with tests plus a measured number from the running app, recorded in the epic.
- Complex features start with research in `docs/research/` (question, experiments, findings, decision), then a proj-mgmt plan, then an MVP. Measure before claiming; a metric that disagrees with a screenshot means the metric is incomplete.
- Ideas the user raises mid-task go into proj-mgmt as `(roadmap)` items immediately, even when not built now.
- Profanity: local dev is unfiltered by default (`VITE_PROFANITY_FILTER=on` previews); production always filters.

## Lessons learned (environment and harness)

- The repo is on Google Drive: folder locks make git fail mid-operation ("Permission denied"). Retry `git add` on lock errors. Never split or verify commits with `git stash --include-untracked`, `git restore --source=<commit> -- .`, or `git checkout -- .`; a partial tree as `--source` deletes every tracked file it lacks. Stage files explicitly; verify a commit by `git archive <sha>` into a scratch folder outside Drive with a `node_modules` junction.
- Files written with LF show as modified after git rewrites them with CRLF (`core.autocrlf=true`); `git diff` empty means line endings only.
- An occluded browser window throttles `requestAnimationFrame` to ~1 fps and silently freezes physics: bring the page to front (Playwright `page.bringToFront()`) and reject measurements below 50 fps.
- Vite reloads the page the first time a lazily imported dependency is optimized; list such deps (three.js) in `optimizeDeps.include`.
- Stopping an `npx vite` background task leaves the Vite node process holding port 3000: find the PID on the port and stop it before restarting.
- q8 ONNX models quantize activations per batch: embed vocabulary words one at a time so build-time vectors match the browser's single-word encodes.
- Matter.js clears forces after every step: apply custom forces in `Events.on(engine, "beforeUpdate")`, not in the p5 draw loop; start the engine with `Runner.run` and stop it with `Runner.stop` on teardown.
- In 384-d embedding space unrelated words are all ~sqrt(2) apart: raw distances make layouts a sphere. Use board-relative targets (see `docs/research/embedding-shape.md`).
- Keep Playwright at one worker: parallel pages (three.js, 8 MB vocabulary, per-frame physics) time out on navigation against the dev server.
- Game out scoring rules before building them: simulate populations (known-good plays, typical plays, exploit strategies, nonsense) and check that no strategy beats real play (see `docs/research/analogy-scoring.md`).
- Run unit tests with `yarn test:unit`, not bare `vitest run`: bare vitest also picks up the Playwright spec `tests/gameplay.spec.ts` and reports a failed suite.
- Browser checks in 3D: labels move while the camera eases, so read `wordBoxes()` right before each click, hover first (`mouse.move`, short wait), then `mouse.down`/`up`; confirm with `stores.menuStore.selectedWordTexts` instead of assuming the click landed.
- Editing source during a browser check can make Vite fully reload the page (fresh random board, profile dimension restored): re-check the board state (`wordTexts()`) before measuring after any edit.
- 3D camera scale: with `setViewOffset` at full frame size, one world unit is one pixel at `pixelMatchedDistance(fullHeight, FOV)`; use the full height, not the area below the dashboard.
- Patch scripts: create them with the Write tool (never a shell heredoc or `python -` stdin: quotes, `\r\n`, and `\s` escapes get mangled, which broke a regex, an apostrophe, and a whole script in one session); prefer the Edit tool for small edits. The repo mixes LF and CRLF files, so an exact-match patch must normalize line endings on read and restore them on write.
- `yarn build` can fail once right after "built" when Google Drive holds a lock on `dist/`; rerun before investigating.
- Before writing a file with the Write tool, check whether it already exists (`git ls-files`, `ls`): Write replaces it whole. A tracked `.env.example` was overwritten once and had to be merged back from git.

# Epic 4: Modernization & Dependency Upgrades

## 📋 Overview
Replace outdated build processes (like Create React App scripts) with a ultra-fast build tool chain (Vite), update the core libraries (React 18+, MobX 6, Matter-js, p5) to their latest stable configurations, and enable strict TypeScript compile rules.

---

## 🛠️ Features, Stories & Tasks

### Feature 4.1: CRA to Vite Migration
* **Description**: Migrate the project's tooling from Webpack-based `react-scripts` to Vite for sub-second hot module reloading (HMR) and optimized build outputs.
* **User Stories**:
  * **Story 4.1.1**: *As a developer, I want my development server to boot up instantly and reload changes in milliseconds, so my dev loop is highly productive.*
    * [x] **Task 4.1.1.1**: Remove `react-scripts` from `package.json`. — ✅ (commit 9f23dab, before 2026-09-22).
    * [x] **Task 4.1.1.2**: Install `vite`, `@vitejs/plugin-react`, and standard Vite plugins. — ✅ Vite 4 + `@vitejs/plugin-react`.
    * [x] **Task 4.1.1.3**: Relocate `index.html` from `/public` to the project root and update script source paths to link to `/src/index.tsx`. — ✅ `index.html` at the repo root.
    * [~] **Task 4.1.1.4**: Create a valid `vite.config.ts` handling build aliases and proxy rules for the local backend server. — partial: `vite.config.ts` exists (three.js in `optimizeDeps.include`); no backend proxy yet (no backend).
    * [x] **Task 4.1.1.5**: Update scripts in `package.json` to use `vite` commands (`dev`, `build`, `preview`). — ✅ `start`/`build`/`preview` use Vite; plus `vocab:build`, `test:unit`, `test:e2e`, `research:cross-dim`.

### Feature 4.2: Dependency Package Upgrades
* **Description**: Upgrade React, Matter-js, p5, and state management packages to resolve security audits and leverage modern browser APIs.
* **User Stories**:
  * **Story 4.2.1**: *As a developer, I want to use React 18 Concurrent Rendering features and the new `createRoot` API, ensuring we build on modern React patterns.*
    * [x] **Task 4.2.1.1**: Upgrade `react` and `react-dom` to `^18.x.x` or `^19.x.x`. — ✅ React 18.2.
    * [x] **Task 4.2.1.2**: Update entry point `src/index.tsx` to use `createRoot` instead of the deprecated `ReactDOM.render`. — ✅ `createRoot` in `src/index.tsx`.
  * **Story 4.2.2**: *As a developer, I want latest type bindings for Matter.js and p5, avoiding random ts-ignore comments for missing or mismatched types.*
    * [x] **Task 4.2.2.1**: Upgrade `matter-js` and `@types/matter-js`. — ✅ matter-js 0.19 (engine now started with `Runner.run` and stopped on teardown, 2026-09-23).
    * [x] **Task 4.2.2.2**: Upgrade `p5` and `@types/p5`. — ✅ p5 1.6.
    * [x] **Task 4.2.2.3**: Audit and eliminate generic `any` casting or `tsconfig` ignore rules across custom shapes factory wrappers. — ✅ no `any` in the physics/shape code; strict mode on.

### Feature 4.3: UI System & Aesthetics Refresh
* **Description**: Migrate from deprecated `@material-ui/core` (MUI v4) to the latest `@mui/material` (MUI v5) or implement custom styled-components with a neon dark-mode theme to support rich aesthetics.
* **User Stories**:
  * **Story 4.3.1**: *As a player, I want a dark-mode theme with glassmorphism UI cards, clean typography, and glowing borders so the game looks professional and premium.*
    * [x] **Task 4.3.1.1**: Set up custom vanilla CSS tokens (variables) in `src/index.css` for primary, secondary, and accent colors. — ✅ done as theme tokens (2026-09-23): `src/theme/palette.ts` writes CSS variables per theme (dark/light), every text/surface pair WCAG-AA tested.
    * [x] **Task 4.3.1.2**: Design responsive glassmorphism styles for HUD overlays, score panels, and level selector panels. — ✅ glass dashboard HUD, movable and collapsible.
    * [x] **Task 4.3.1.3**: Configure modern typography (e.g., Outfit or Space Grotesk Google Fonts) to replace standard browser sans-serif. — ✅ Outfit (Google Fonts).

### Feature 4.4: Strict TypeScript Compiler Guidelines
* **Description**: Strengthen TS rules to prevent silent compilation defects and promote strict contract enforcement.
* **User Stories**:
  * **Story 4.4.1**: *As a developer, I want the TypeScript compiler to catch missing parameters and implicit `any` assignments, making my refactoring safe.*
    * [x] **Task 4.4.1.1**: Update `tsconfig.json` to enable strict flag configurations: — ✅ `strict: true`.
      * `strict: true`
      * `noImplicitAny: true`
      * `strictNullChecks: true`
      * `noUnusedLocals: true`
      * `noUnusedParameters: true`
    * [x] **Task 4.4.1.2**: Resolve compilation errors arising from the strict flags activation throughout the physics, collision, and rendering services. — ✅ `tsc --noEmit` clean.

### Feature 4.5: Follow-ups found 2026-09-22/23 (roadmap)
* [ ] **Task 4.5.1**: Upgrade Material UI v4 → v5+ (v4 `Tooltip`/`MenuItem` use the deprecated `findDOMNode`, two dev-console warnings under StrictMode).
* [x] **Task 4.5.2** (2026-09-25, via Epic 7 · Task 7.3.1): Sentry now initializes only when a build sets `VITE_SENTRY_DSN`. Originally: initialise Sentry only in production builds; dev errors currently reach the production Sentry project (it rate-limited during a dev session). **Planned in [Epic 7 · Task 7.3.1](epic-7-delivery-operations.md)** (2026-09-25): initialise only when a DSN is configured, upgrade 5 → current major, releases and source maps, fresh key with allowed domains.
* [~] **Task 4.5.3** (new coverage ✅ 2026-09-24/25: `tests/semanticPlayground.spec.ts` via the dev handle, runs serially, 17/17; ⬜ the legacy `gameplay.spec.ts` still writes to a hard-coded path): Fix the Playwright e2e suite: `tests/gameplay.spec.ts` writes screenshots to a hard-coded `~/.gemini/...` path and predates the sandbox/timed/3D modes; add e2e coverage using the `window.__lexical` dev handle.
* [ ] **Task 4.5.4**: Remove the Babel `decorators-legacy` plugin from `vite.config.ts` (no decorators remain).
* [ ] **Task 4.5.5** (found by the delivery research, 2026-09-25): Vite 4.5 → current major (4.x is out of support; part of the 37-High `yarn audit` baseline), with `@vitejs/plugin-react` and the Sass modern API (the build prints legacy-JS-API deprecation warnings).
* [x] **Task 4.5.6** (2026-09-27, owner request: "bundle minimization"): Measured with source maps (bytes attributed per package). Main chunk **1,880 KB → 469 KB** (−75%); first-load JS for the 2D game 1,880 → ~1,623 KB (−14%):
  * `@lexical/shared` schemas moved to `zod/mini`: 94 → 28 KB. The server's error handler now checks the core `$ZodError`.
  * Sentry loads only when a DSN is configured: −54 KB, in its own chunk.
  * The letters-mode dictionary loads on the first letter collision: −134 KB, and no more lookup building on every world. ⚠ This dropped the contacts made while it loaded, so the first letters never merged; fixed in Task 4.5.8.
  * The 2D world (p5 + matter-js) is code-split like the 3D world: 1,154 KB chunk; the menu and dashboard render first.

  Guards: the CI budget fails the build if any `index-*.js` exceeds 600 KB; an e2e test checks that the dictionary isn't loaded at startup and loads on letter collisions. All 272 unit tests and 22 e2e tests pass.
* [ ] **Task 4.5.7** (roadmap): Replace p5 (1,040 KB, not tree-shakable in 1.x) with a thin Canvas2D renderer for the word boxes, threads, and overlays. It is the largest remaining chunk: the 2D world would go from ~1.15 MB to ~120 KB. Measure first-render time before and after.
* [x] **Task 4.5.8** (2026-10-03, owner report: "the original version … where you drop letters and the letters combine … is lost"): Regression from Task 4.5.6. The lazy dictionary was requested on the first letter collision, and that collision (and every other one before the dictionary arrived) was dropped. Letters resting on each other never collide again, so the first letters stayed apart. Merge rules, dictionary, and box physics are unchanged since the original game (diffed against `52c4db3`).
  * Fix (`CollisionHandler`): letters mode fetches the dictionary when it opens (still outside the main bundle), and contacts that arrive before it loads are kept and merged once it does.
  * Measured on fresh pages, drop T, H, E from high on the screen: before, 1 of 3 trials merged anything, and the first contact never did (production-mode bundle); after, 5 of 5 trials merged (all three into "the" in 1 of 5). The remaining misses are the original strength band: an impact deeper than 10 units never merges (`seperationThresholdUpperBound`, unchanged).
  * Guard: e2e test "letters mode: dropped letters combine into words on a fresh page (T + H + E → "the")", 5/5 repeats; the laziness test now checks that the dictionary loads when letters mode opens.
* [x] **Task 4.5.9** (2026-10-03, owner: "letters may not combine … we need to lessen that and I'll try it"): Merge-strength upper bound 10 → 40 (`seperationThresholdUpperBound`). Measured (dev server, fresh pages): letters dropped from high onto each other overlap 10–27 units; T/H/E high drops spelling "the": 1 of 5 at 10 → 5 of 6 at 40. Sprinkling 40 letters at random: 14–17 boxes remain at every bound (10, 25, 40, 1000), so no runaway chain merges; contact overlap p50 ≈ 1.5, p90 ≈ 11. ⬜ Owner play-test.
* [ ] **Task 4.5.10** (roadmap, found while measuring 4.5.9): Sprinkled letters mostly form fragments and abbreviations ("std", "eos", "nm", "pf", "aa"): the merge rule accepts any substring of any word in `combinationOfAllDict` (which includes abbreviations). Consider a cleaner word list for letters mode and scoring only vocabulary words ≥ 3 letters, so the words carried into Discovery (Feature 2.14) are real.

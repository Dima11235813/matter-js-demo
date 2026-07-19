# Epic 4: Modernization & Dependency Upgrades

## 📋 Overview
Replace outdated build processes (like Create React App scripts) with a ultra-fast build tool chain (Vite), update the core libraries (React 18+, MobX 6, Matter-js, p5) to their latest stable configurations, and enable strict TypeScript compile rules.

---

## 🛠️ Features, Stories & Tasks

### Feature 4.1: CRA to Vite Migration
* **Description**: Migrate the project's tooling from Webpack-based `react-scripts` to Vite for sub-second hot module reloading (HMR) and optimized build outputs.
* **User Stories**:
  * **Story 4.1.1**: *As a developer, I want my development server to boot up instantly and reload changes in milliseconds, so my dev loop is highly productive.*
    * [ ] **Task 4.1.1.1**: Remove `react-scripts` from `package.json`.
    * [ ] **Task 4.1.1.2**: Install `vite`, `@vitejs/plugin-react`, and standard Vite plugins.
    * [ ] **Task 4.1.1.3**: Relocate `index.html` from `/public` to the project root and update script source paths to link to `/src/index.tsx`.
    * [ ] **Task 4.1.1.4**: Create a valid `vite.config.ts` handling build aliases and proxy rules for the local backend server.
    * [ ] **Task 4.1.1.5**: Update scripts in `package.json` to use `vite` commands (`dev`, `build`, `preview`).

### Feature 4.2: Dependency Package Upgrades
* **Description**: Upgrade React, Matter-js, p5, and state management packages to resolve security audits and leverage modern browser APIs.
* **User Stories**:
  * **Story 4.2.1**: *As a developer, I want to use React 18 Concurrent Rendering features and the new `createRoot` API, ensuring we build on modern React patterns.*
    * [ ] **Task 4.2.1.1**: Upgrade `react` and `react-dom` to `^18.x.x` or `^19.x.x`.
    * [ ] **Task 4.2.1.2**: Update entry point `src/index.tsx` to use `createRoot` instead of the deprecated `ReactDOM.render`.
  * **Story 4.2.2**: *As a developer, I want latest type bindings for Matter.js and p5, avoiding random ts-ignore comments for missing or mismatched types.*
    * [ ] **Task 4.2.2.1**: Upgrade `matter-js` and `@types/matter-js`.
    * [ ] **Task 4.2.2.2**: Upgrade `p5` and `@types/p5`.
    * [ ] **Task 4.2.2.3**: Audit and eliminate generic `any` casting or `tsconfig` ignore rules across custom shapes factory wrappers.

### Feature 4.3: UI System & Aesthetics Refresh
* **Description**: Migrate from deprecated `@material-ui/core` (MUI v4) to the latest `@mui/material` (MUI v5) or implement custom styled-components with a neon dark-mode theme to support rich aesthetics.
* **User Stories**:
  * **Story 4.3.1**: *As a player, I want a dark-mode theme with glassmorphism UI cards, clean typography, and glowing borders so the game looks professional and premium.*
    * [ ] **Task 4.3.1.1**: Set up custom vanilla CSS tokens (variables) in `src/index.css` for primary, secondary, and accent colors.
    * [ ] **Task 4.3.1.2**: Design responsive glassmorphism styles for HUD overlays, score panels, and level selector panels.
    * [ ] **Task 4.3.1.3**: Configure modern typography (e.g., Outfit or Space Grotesk Google Fonts) to replace standard browser sans-serif.

### Feature 4.4: Strict TypeScript Compiler Guidelines
* **Description**: Strengthen TS rules to prevent silent compilation defects and promote strict contract enforcement.
* **User Stories**:
  * **Story 4.4.1**: *As a developer, I want the TypeScript compiler to catch missing parameters and implicit `any` assignments, making my refactoring safe.*
    * [ ] **Task 4.4.1.1**: Update `tsconfig.json` to enable strict flag configurations:
      * `strict: true`
      * `noImplicitAny: true`
      * `strictNullChecks: true`
      * `noUnusedLocals: true`
      * `noUnusedParameters: true`
    * [ ] **Task 4.4.1.2**: Resolve compilation errors arising from the strict flags activation throughout the physics, collision, and rendering services.

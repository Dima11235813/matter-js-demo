# 12. SiteGround Node.js hosting: settings and environment variables ☐

**Why**: the site is deployed from GitHub to SiteGround's Node.js hosting (owner decision, 2026-10-05). Every push to `main` deploys. SiteGround installs, runs `yarn build`, then starts the app with `yarn start`. That is now one Node server on SiteGround's `PORT`, serving the built game (`dist/`) and the API (`/api/v1`) from the same address, so nothing assumes localhost.

**Where**: Site Tools → `dmitril.sg-host.com` → Node.js → **Deployment Options**.

**Build configuration**
* ☐ **Branch**: `main` (already set).
* ☐ **Node version**: 24 (already set).
* ☐ **Package manager**: yarn (already set).
* ☐ **Build command**: `yarn build` (already set). It builds in ~10 s locally: the vocabulary is committed, so it is no longer embedded on the server (that took ~5 minutes and the limit is 300 s).
* ☐ **Output directory**: change `public` → **`dist`**. `public/` is the source of static files; `dist/` is the built game. The server serves `dist/` itself either way, but SiteGround should point at the real build.
* ☐ **Framework preset**: leave **React** unless a deploy fails at the start step. If SiteGround offers **Node.js** or **Express.js**, that matches better (we run our own server). Tell the agent what the next log says.

**Environment variables** (Add New Environment Variables). None are required for the game to run.

| Key | Value | When |
|---|---|---|
| `PGLITE_DATA_DIR` | a folder **outside** the deploy folder, e.g. `/home/customer/www/dmitril.sg-host.com/lexical-data` | before turning on sign-in. Without it, accounts and sync use an in-memory database that resets on every restart (the log says so) |
| `FIREBASE_PROJECT_ID` | from item 2 | to turn on Google sign-in (server side) |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | from item 2 (public identifiers, not secrets) | the same time; they are read at build time, so redeploy after adding them |
| `DATABASE_URL` | a SiteGround PostgreSQL database (Site Tools → databases) | later, instead of `PGLITE_DATA_DIR`, when real players sync |

* ☐ **Never set** `DEV_AUTH_SECRET` here: the server refuses to start with it in production (it would let anyone mint sign-in tokens).
* ☐ Firebase (item 2): add `dmitril.sg-host.com` under Authentication → Settings → **Authorized domains**, and allow it on the browser key's referrers.

**Done when**: a push to `main` deploys and the deploy log ends with a line like `Lexical on port …: API /api/v1 + web app (…/dist)`. https://dmitril.sg-host.com/ then shows the game ("20,001 words" in the dashboard), and https://dmitril.sg-host.com/api/v1/health returns `{"ok":true,…,"devAuth":false}`.

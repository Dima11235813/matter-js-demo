# 2. Firebase: Google sign-in ☐

**Why**: real Google sign-in. Until then, local play and all tests use **test personas** (no Google needed).

**Steps**: [docs/setup/accounts-and-deploy.md §1](../../docs/setup/accounts-and-deploy.md), items 1.1–1.6. In short:
* ☐ Create the Firebase project `lexical-fountain` (Analytics off). Note the **project ID**.
* ☐ Authentication → Sign-in method → **Google → Enable**.
* ☐ Authorized domains: `localhost` (default) + `lexical-fountain.<subdomain>.workers.dev` (after item 4).
* ☐ Register the web app `lexical-web` and copy the config into files that are **never committed**:

| Put this… | …into this file | as |
|---|---|---|
| `apiKey` | `D:\GDrive\Dev\matter-js-demo\.env.local` | `VITE_FIREBASE_API_KEY=` |
| `authDomain` | same | `VITE_FIREBASE_AUTH_DOMAIN=` |
| `projectId` | same | `VITE_FIREBASE_PROJECT_ID=` |
| `appId` | same | `VITE_FIREBASE_APP_ID=` |
| `projectId` | `D:\GDrive\Dev\matter-js-demo\server\.env.local` | `FIREBASE_PROJECT_ID=` |

  (Create each file by copying its `.env.example` next to it. These values are public identifiers, not secrets.)
* ☐ Restrict the browser key to `http://localhost:3000/*` and the workers.dev URL (APIs & Services → Credentials).
* ☐ Budget alert $50/month with alerts at $10/$25/$50 (Billing).

**Done when**: `yarn dev:server` + `yarn start` → menu (shield icon) → **Sign in with Google** appears. Then do item 6.

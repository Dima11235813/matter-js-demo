# 5. GitHub Actions variables → first deploy ☐

**Why**: the deploy job reads these; `DEPLOY_ENABLED` switches it on.

**Needs**: items 1–4.

**Steps**: github.com/Dima11235813/matter-js-demo → Settings → Secrets and variables → Actions → **Variables** tab (these are variables, not secrets: none is a credential). Table and sources: [docs/setup/accounts-and-deploy.md §4](../../docs/setup/accounts-and-deploy.md).

| Variable | Value |
|---|---|
| `GCP_PROJECT_ID` | your project ID |
| `GCP_WIF_PROVIDER` | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/github-actions` |
| `GCP_DEPLOY_SA` | `lexical-deploy@<PROJECT_ID>.iam.gserviceaccount.com` |
| `CLOUDFLARE_ACCOUNT_ID` | from item 4 |
| `CF_WORKERS_SUBDOMAIN` | from item 4 |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | same values as in `.env.local` (item 2) |
| `VITE_SENTRY_DSN` | optional; leave unset for no error reporting |
| `DEPLOY_ENABLED` | `true`, **last** |

**Done when**: the next merge into `main` runs `deploy-production` green and the smoke test passes; the site loads at `https://lexical-fountain.<subdomain>.workers.dev`.

**Note**: sign-in and sync on the public site also need the API server deployed (Cloud Run + database, increment 4, not built yet). Until then the public site works fully as a local-first game.

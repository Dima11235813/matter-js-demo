# Setup: Accounts, Secrets, and Deploys (human steps)

The owner does these once, by hand, in the web consoles. The code side is already in the repo. Each step says **where** to click, **what to name** things, and **which variable** the value goes into.

**Status legend**: ☐ to do · the stage from [platform-plan.md](../research/platform-plan.md) that needs it.

**Never** put a secret in a file inside `D:\GDrive` (it syncs to Google Drive). Secrets go in GCP Secret Manager. The only local files are `.env.local` (root) and `server/.env.local`; both are gitignored, and they hold public config plus local-only values.

---

## 0. Branch model (GitHub) — needed now

```
feature/*  ──PR──►  develop  (you test locally)  ──PR──►  main  (merge = deploy to production)
```

☐ **0.1 Default branch**: github.com/Dima11235813/matter-js-demo → **Settings → General → Default branch** → switch to `main` (the agent pushed `main` and `develop`). The old `master` stays as-is: nothing is deleted.
☐ **0.2 Rulesets**: **Settings → Rules → Rulesets → New branch ruleset**:
  * Name `protect-main-develop`; Enforcement **Active**; Target branches `main` and `develop`.
  * Rules:
    * ✔ Restrict deletions;
    * ✔ Require a pull request before merging (required approvals **0**: you're the only developer, and the checks are the gate);
    * ✔ Require status checks to pass: `verify`, `e2e` (they appear after the first CI run);
    * ✔ Block force pushes.
☐ **0.3 Code security**: **Settings → Code security** → CodeQL analysis **Set up → Default**; Secret scanning **Enable**; Push protection **Enable**.
☐ **0.4 Production environment**: **Settings → Environments → New environment** `production`:
  * Deployment branches: **Selected branches** → `main`;
  * (optional) Required reviewers: you. Every production deploy then waits for your click.

---

## 1. Google: Firebase project and Google sign-in — needed for Google login (Stage D)

☐ **1.1 Create the project**: console.firebase.google.com → **Add project**.
  * Name `lexical-fountain`; Firebase shows the project ID, for example `lexical-fountain-1a2b3`. **Write it down.**
  * Google Analytics: **off** (not needed; less data collected).

  This also creates a Google Cloud project with the same ID.
☐ **1.2 Turn on Google sign-in**: **Build → Authentication → Get started → Sign-in method → Google → Enable**. Set a support email; Save.
☐ **1.3 Authorized domains**: **Authentication → Settings → Authorized domains**:
  * `localhost` is there by default;
  * add `lexical-fountain.<your-subdomain>.workers.dev` (from step 3.2);
  * later, your custom domain.
☐ **1.4 Register the web app**: **Project settings (gear) → General → Your apps → Web (`</>`)**: nickname `lexical-web`, no Hosting. Firebase shows a `firebaseConfig` block. Copy four values into the **root `.env.local`** (create it from `.env.example`):

| firebaseConfig field | Variable |
|---|---|
| `apiKey` | `VITE_FIREBASE_API_KEY` |
| `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `VITE_FIREBASE_PROJECT_ID` |
| `appId` | `VITE_FIREBASE_APP_ID` |

  Also put the project ID in **`server/.env.local`** as `FIREBASE_PROJECT_ID`: the server checks every sign-in token against it.

  These four values are **public identifiers, not secrets** (they ship in the web page). Still, restrict the key:

☐ **1.5 Restrict the browser key**: console.cloud.google.com → your project → **APIs & Services → Credentials → Browser key (auto created by Firebase)** → Application restrictions **Websites**: `http://localhost:3000/*`, `https://lexical-fountain.<your-subdomain>.workers.dev/*`, and later your domain.
☐ **1.6 Budget alerts** (Google Cloud billing): **Billing → Budgets & alerts → Create budget**: `lexical-fountain`, amount $50/month, alerts at 20% / 50% / 100% ($10 / $25 / $50). Firebase Auth's Google sign-in is free up to 50k monthly users; billing only matters once the server runs on Cloud Run (step 2).

## 2. Google Cloud: keyless CI deploys and Secret Manager — needed for deploy-on-merge (Stage B)

CI proves its identity to Google with GitHub's short-lived OIDC token (Workload Identity Federation). **No key file is ever created or downloaded.**

☐ **2.1 Install the gcloud CLI** (cloud.google.com/sdk), then run `gcloud auth login` and `gcloud config set project <PROJECT_ID>`.
☐ **2.2 Run these commands** in a terminal **outside** `D:\GDrive`. Replace `<PROJECT_ID>`; the number comes from `gcloud projects describe <PROJECT_ID> --format="value(projectNumber)"`.

```sh
PROJECT_ID=<PROJECT_ID>
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
REPO=Dima11235813/matter-js-demo

gcloud services enable iamcredentials.googleapis.com secretmanager.googleapis.com sts.googleapis.com

# Identity pool + GitHub provider, limited to this one repository
gcloud iam workload-identity-pools create github --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc github-actions \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.environment=assertion.environment" \
  --attribute-condition="assertion.repository=='$REPO'"

# The deploy identity, usable only from the production environment on main
gcloud iam service-accounts create lexical-deploy --display-name="Lexical Fountain deploy (CI)"
gcloud iam service-accounts add-iam-policy-binding lexical-deploy@$PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principal://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/subject/repo:$REPO:environment:production"
```

☐ **2.3 GitHub variables** from these values: see the table in step 4.

## 3. Cloudflare: hosting — needed for deploy-on-merge (Stage B)

☐ **3.1 Account**: dash.cloudflare.com → sign up. The **Account ID** is on the right of **Workers & Pages → Overview** (or in any zone's overview). It goes into the GitHub variable `CLOUDFLARE_ACCOUNT_ID`.
☐ **3.2 workers.dev subdomain**: **Workers & Pages → Overview → Subdomain** → choose one, e.g. `dima`. The site will then be `https://lexical-fountain.dima.workers.dev` (the Worker name `lexical-fountain` comes from `wrangler.jsonc`). Add that host to Firebase (1.3) and the key restriction (1.5).
☐ **3.3 Deploy token**: **My Profile → API Tokens → Create Token → template "Edit Cloudflare Workers"**:
  * Account Resources: **Include → your account only**;
  * Zone Resources: **All zones from an account → your account** (or none, if you have no domain yet);
  * **TTL**: an end date 90 days out.

  Copy the token **once**, then store it in Secret Manager (it is never pasted anywhere else):

```sh
# Paste the token when prompted; it goes through stdin, so it never shows up in shell history (standard SEC-08).
read -rs CF_TOKEN && printf %s "$CF_TOKEN" | gcloud secrets create cloudflare-deploy-token --replication-policy=automatic --data-file=- && unset CF_TOKEN
gcloud secrets add-iam-policy-binding cloudflare-deploy-token \
  --member="serviceAccount:lexical-deploy@$PROJECT_ID.iam.gserviceaccount.com" --role=roles/secretmanager.secretAccessor
```

  Rotate it every 90 days: create a new token, then `gcloud secrets versions add cloudflare-deploy-token --data-file=-` the same way.
☐ **3.4 Workspace inventory**: add `cloudflare-deploy-token` (blast radius: can deploy and replace the Worker; rotation every 90 days) to `D:\GDrive\proj-mgmt\inventory\secrets-inventory.md` (standard SEC-04).

## 4. GitHub Actions variables — needed for deploy-on-merge

**Settings → Secrets and variables → Actions → Variables** (these are *variables*, not secrets: none of them is a credential):

| Variable | Value | From |
|---|---|---|
| `GCP_PROJECT_ID` | `<PROJECT_ID>` | 1.1 |
| `GCP_WIF_PROVIDER` | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/github-actions` | 2.2 |
| `GCP_DEPLOY_SA` | `lexical-deploy@<PROJECT_ID>.iam.gserviceaccount.com` | 2.2 |
| `CLOUDFLARE_ACCOUNT_ID` | the account ID | 3.1 |
| `CF_WORKERS_SUBDOMAIN` | e.g. `dima` | 3.2 |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | as in 1.4 | 1.4 |
| `VITE_SENTRY_DSN` | optional; leave unset to keep Sentry off | Sentry project |
| `DEPLOY_ENABLED` | `true`, **last**, once everything above exists | — |

Until `DEPLOY_ENABLED` is `true`, the deploy job is skipped and CI still checks every PR.

## 5. Local development

```sh
cp .env.example .env.local                   # then fill the VITE_FIREBASE_* values (1.4)
cp server/.env.example server/.env.local     # then fill FIREBASE_PROJECT_ID (1.4)
yarn install
yarn dev:server    # API on http://localhost:8787 (in-process Postgres; no Docker needed)
yarn start         # game on http://localhost:3000; /api is proxied to the server
```

Without the Firebase values the game works exactly as before, with no sign-in button: accounts are optional by design.

## 6. Later stages (not needed yet)

* **Cloud Run + database** (server in production, Stage C/D): Artifact Registry, Cloud SQL `us-central1`, IAM database login, and the Worker's `/api/*` route. Added here when the server is ready to deploy.
* **Turnstile** (bot protection for research uploads, Stage C): `VITE_TURNSTILE_SITE_KEY` (public), `turnstile-secret` in Secret Manager.
* **Custom domain**: add it in Cloudflare, Firebase authorized domains, and the key restriction.

# 4. Cloudflare: hosting ☐

**Why**: the public site ($0 hosting at any scale); merges to `main` deploy here.

**Needs**: item 3 (the token is stored in Secret Manager).

**Steps**: [docs/setup/accounts-and-deploy.md §3](../../docs/setup/accounts-and-deploy.md):
* ☐ Create the Cloudflare account; copy the **Account ID** (Workers & Pages → Overview) → item 5 variable `CLOUDFLARE_ACCOUNT_ID`.
* ☐ Choose a **workers.dev subdomain** (e.g. `dima`) → item 5 variable `CF_WORKERS_SUBDOMAIN`. The site will be `https://lexical-fountain.<subdomain>.workers.dev`; add it to Firebase authorized domains and the key restriction (item 2).
* ☐ Create an API token from the template **Edit Cloudflare Workers**, limited to your account, **expiring in 90 days**. Store it **only** in Secret Manager as `cloudflare-deploy-token` with the §3.3 command (pasted at a prompt, never on the command line), and grant the `lexical-deploy` service account access.
* ☐ Put a calendar reminder to rotate it before it expires (§3.3 has the rotation command).

**Done when**: `gcloud secrets versions list cloudflare-deploy-token` shows one enabled version.

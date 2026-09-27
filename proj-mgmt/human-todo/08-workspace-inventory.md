# 8. Workspace inventory ☐

**Why**: workspace standard SEC-04 ("an unlisted secret is an unmanaged secret") and the technology-asset register. These are cross-project files, so agents don't edit them without the owner.

**Steps** (or tell the agent "go ahead and update the workspace inventory"):
* ☐ `D:\GDrive\proj-mgmt\inventory\technology-assets.md`: add **Lexical Fountain** (`Dev/matter-js-demo`): React + Vite web app, Hono API (Cloud Run later), Postgres, Firebase Auth, Cloudflare hosting; owner: you; risk tier: public web app with accounts.
* ☐ `D:\GDrive\proj-mgmt\inventory\secrets-inventory.md`: add, as each is created:
  * `cloudflare-deploy-token` (Secret Manager; can deploy and replace the Worker; rotate every 90 days);
  * later: `sentry-release-token`, `turnstile-secret`, ingest HMAC key, export HMAC key, and database credentials (none if IAM login is used).
* ☐ Note: the old Sentry DSN in git history is not a secret (a DSN only allows sending events); issue a fresh key with allowed domains when Sentry is set up.

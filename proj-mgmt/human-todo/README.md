# Human To-Do (owner actions)

Things only the owner can do: creating accounts, pasting values into `.env.local` files, console settings, reviews, and decisions. Agents add items here; the owner ticks them off (☐ → ☑) and deletes nothing (Drive rule: mark done instead).

**Order matters**: each item says what it unblocks. Detailed click-by-click steps for accounts live in one place, [docs/setup/accounts-and-deploy.md](../../docs/setup/accounts-and-deploy.md), so they can't drift; the items below point to its sections.

| # | Item | Unblocks | Est. | Status |
|---|---|---|---|---|
| 1 | [GitHub: default branch `main`, rulesets, CodeQL + secret scanning, `production` environment](01-github-settings.md) | protected `develop`/`main`, deploys | 15 min | ☐ |
| 2 | [Firebase: project, Google sign-in, web config → `.env.local` values](02-firebase-google-signin.md) | real Google sign-in (local and production) | 20 min | ☐ |
| 3 | [Google Cloud: keyless CI deploys (Workload Identity) + Secret Manager](03-gcp-keyless-deploys.md) | deploy-on-merge | 20 min | ☐ |
| 4 | [Cloudflare: account, subdomain, deploy token → Secret Manager](04-cloudflare-hosting.md) | deploy-on-merge, the public site | 15 min | ☐ |
| 5 | [GitHub Actions variables, then `DEPLOY_ENABLED=true`](05-github-variables.md) | the first production deploy | 10 min | ☐ |
| 6 | [Verify Google sign-in, account switching, and sync with real accounts](06-verify-sign-in-and-sync.md) | Epic 6 · Tasks 6.4.1.1, 6.7.5 | 20 min | ☐ |
| 7 | [Privacy notice: fill placeholders and review](07-privacy-notice.md) | research telemetry (Stage C) | 30 min | ☐ |
| 8 | [Workspace inventory: add this project and its secrets](08-workspace-inventory.md) | standards SEC-04 compliance | 10 min | ☐ |
| 9 | [Open product decisions](09-decisions.md) | Stage B/C planning | — | ☐ |
| 10 | [Housekeeping: old `master` branch, git stash, skill copy](10-housekeeping.md) | tidy repo | 5 min | ☐ |
| 11 | [Approve workspace rule additions (AGENTS.md)](11-approve-workspace-rules.md) | the same habits in every project and agent | 5 min | ☐ |
| 12 | [SiteGround: superseded 2026-10-09 — pause its auto-deploy](12-siteground-node-hosting.md) | pushes to `main` stop deploying to SiteGround | 2 min | ☐ |

After finishing an item, tell the agent (or tick it here); the agent then continues the work it unblocks (e.g. after 5: watch the first deploy; after 2: an end-to-end Google sign-in check).

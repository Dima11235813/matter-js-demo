# 1. GitHub settings ☐

**Why**: protects `develop` and `main` (CI must pass before a merge) and sets up the production deploy gate.

**Steps**: [docs/setup/accounts-and-deploy.md §0](../../docs/setup/accounts-and-deploy.md), items 0.1–0.4:
* ☐ 0.1 Default branch → `main` (Settings → General).
* ☐ 0.2 Ruleset `protect-main-develop` on `main` and `develop`: restrict deletions, require a PR (0 approvals), require the status checks `verify` and `e2e`, block force pushes.
* ☐ 0.3 CodeQL default setup, secret scanning, push protection (Settings → Code security).
* ☐ 0.4 Environment `production` limited to `main` (optionally: you as required reviewer).

**Done when**: a PR into `develop` shows the required `verify` and `e2e` checks.

**Note**: while the ruleset isn't on, the agent merges by fast-forwarding `develop`/`main` (allowed by the owner, 2026-09-27, for this early stage). Once it's on, merges go through PRs; `gh auth login` (run `! gh auth login` in the Claude session) lets the agent open and merge them.

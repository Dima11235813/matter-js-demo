# 11. Approve workspace rule additions (AGENTS.md) ☐

**Why**: lessons from the 2026-10-03/04 session apply beyond this project. `D:\GDrive\AGENTS.md` is workspace governance, so the agent only proposes changes; you decide. Project-only lessons are already in [CLAUDE.md](../../CLAUDE.md).

**Proposed additions** to "🔒 Governance & Constraints" (copy what you approve, or tell the agent "apply item 11" and name the numbers):

4. **Text encoding:** Read and write text files as UTF-8 explicitly. On Windows, Python and PowerShell default to the ANSI code page and corrupt non-ASCII characters (a `·` became an invalid byte).
5. **Lock files:** A stale lock (for example `.git/index.lock`) is moved aside to a scratch folder, never deleted, and only after confirming that no process holds it.
6. **Regression protection:** Every user-facing feature keeps an automated test of its outcome, not only a screenshot. Refactors and performance work keep those tests green.
7. **Remote play-testing:** When a milestone is ready to try, share the dev server's network address (LAN IP), not `localhost`. The owner often follows sessions from a phone.

**Harness feedback** (2026-10-10, for whoever maintains `D:\GDrive\proj-mgmt\inventory\scripts\preflight-resources.ps1`):

8. **Preflight exit code:** the "Real-time AV engines" row is a standing machine setting, but it counts as a breach, so the script exits 1 on every run and "non-zero = wait" can never pass. Report it as a warning (or fix the AV setup: three real-time engines inspect every file touch), so agents can trust the exit code. Until then this project reads the individual rows (repo `CLAUDE.md` § Lessons).
9. **Watchers:** the ≤ 2 watchers ceiling on `D:` is shared by all projects: four other projects' dev servers (Maze Lab 41920, gov-data-buddy 41801, mirror-chess 41961, one unlabelled Vite) kept this project's e2e check waiting on 2026-10-10 (the preflight was watched for 30 min without a pass). Consider a rule for stopping idle long-running servers, or a per-project share.

**More proposals from 2026-10-11 → 10-23** (workspace-wide; the project already follows them, in `CLAUDE.md` § Session routine):

10. **Stopped tasks leave children:** stopping an agent's background task kills only its shell, and the Node process keeps running: a dev server keeps its port, and an experiment kept computing and would have overwritten its results. After any stop, list the project's processes by command line and stop the leftovers by PID.
11. **Dependencies off `D:`:** this project keeps `node_modules` on `C:\dev-deps\<project>\` behind junctions. `D:` and Google Drive then see three links instead of about a gigabyte of small files, each scanned three times by antivirus. The `C:` folder must mirror the repo layout, because Node resolves packages through folders named `node_modules`. A candidate pattern for other projects (details in this repo's `CLAUDE.md`). Unknown: whether Google Drive skips junctions; it has not uploaded anything visible so far.
12. **Test without a watcher when the ceiling is full:** build once and serve the bundle (`vite preview`) for end-to-end tests and phone play-tests, instead of starting a dev server that would add a watcher.

**Question for you:** around 2026-10-16, this repo's `node_modules` disappeared along with about 770,000 other non-durable files (the tree census on 10-17). Was that a deliberate sweep? If so, item 11 may be the way you want projects to hold dependencies; if not, the census's runbook has the recovery steps. The same census run flagged `Dev/parallax-prism` (98.65% of durable files gone), which is worth a look if you haven't already.

**Unblocks**: the same habits in other projects and other agents (Antigravity, Codex).

**Done when**: you've approved or declined each rule, and the approved ones are in `AGENTS.md`.

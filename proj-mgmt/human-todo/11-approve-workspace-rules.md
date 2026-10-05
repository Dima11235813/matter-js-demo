# 11. Approve workspace rule additions (AGENTS.md) ☐

**Why**: lessons from the 2026-10-03/04 session apply beyond this project. `D:\GDrive\AGENTS.md` is workspace governance, so the agent only proposes changes; you decide. Project-only lessons are already in [CLAUDE.md](../../CLAUDE.md).

**Proposed additions** to "🔒 Governance & Constraints" (copy what you approve, or tell the agent "apply item 11" and name the numbers):

4. **Text encoding:** Read and write text files as UTF-8 explicitly. On Windows, Python and PowerShell default to the ANSI code page and corrupt non-ASCII characters (a `·` became an invalid byte).
5. **Lock files:** A stale lock (for example `.git/index.lock`) is moved aside to a scratch folder, never deleted, and only after confirming that no process holds it.
6. **Regression protection:** Every user-facing feature keeps an automated test of its outcome, not only a screenshot. Refactors and performance work keep those tests green.
7. **Remote play-testing:** When a milestone is ready to try, share the dev server's network address (LAN IP), not `localhost`. The owner often follows sessions from a phone.

**Unblocks**: the same habits in other projects and other agents (Antigravity, Codex).

**Done when**: you've approved or declined each rule, and the approved ones are in `AGENTS.md`.

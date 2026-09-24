---
name: consolidate-session
description: Reconcile a work session before clearing it. Makes sure everything a future session needs is persisted - proj-mgmt epics/features/stories/tasks reflect what actually shipped (with evidence), roadmap ideas raised mid-session are captured as roadmap items, research findings live in docs/research, harness lessons are added to CLAUDE.md, user preferences and direction are in memory, and work is committed. Use when the user says "consolidate", "wrap up", "reconcile the session", "before we clear", or invokes /consolidate-session.
---

# Consolidate Session

Goal: after this runs, the session can be cleared with nothing of value lost. A fresh session should be able to continue from the repo, `proj-mgmt/`, `docs/research/`, `CLAUDE.md`, and memory alone.

Work through the steps in order. Prefer evidence over recollection: check files, tests, and `git log` rather than trusting the conversation.

## 1. Inventory the session

Build a private checklist from the whole conversation (not just the last few turns):

- **Shipped**: features, fixes, refactors, with the files and commits that prove them.
- **Decisions**: choices the user made or approved (defaults, naming, architecture, UX rules), including reversals. The latest decision wins.
- **Measurements**: numbers that justified decisions (fidelity, fps, test counts, experiment results).
- **User ideas and feedback**: every "roadmap this", "we should also…", "I imagine…", and play-test feedback, especially ones raised mid-turn while other work was running. These are the easiest to lose.
- **Open items**: known limitations, deferred tasks, unanswered questions, anything promised but not done.
- **Lessons**: mistakes, surprises, environment quirks, and workflows that worked, from both the user's corrections and your own errors.
- **Working-tree state**: `git status`, uncommitted work, stashes, running background processes (dev servers).

## 2. Reconcile proj-mgmt

For every epic in `proj-mgmt/` (not only the one worked on):

- Tick tasks that are done: `[x]`, with a short evidence note (file, commit, test, or metric). Use `[~]` for partially done and say what remains.
- If something shipped **differently** than planned, keep the task, tick it, and note how it was actually done (for example "done client-side instead of via backend"), or mark it superseded and point to the replacement.
- Add every user idea from step 1 as a feature/story/task in the most relevant epic, marked `(roadmap)`, with a description, design notes if discussed, and exit criteria if any were stated.
- Record results under the feature that produced them (the numbers, the date, links to research).
- Update `proj-mgmt/roadmap.md`: epic summaries, a dated status snapshot, and what is next.
- Keep the existing house style (Feature / Story / Task numbering, checkbox lists).

## 3. Reconcile research artifacts

If the session produced research (experiments, measurements, comparisons):

- Each investigation has a report in `docs/research/` with question, method, findings (tables), decisions, limitations, and references, plus reproducible experiments under `docs/research/experiments/`.
- Reports link to the proj-mgmt items they drive, and those items link back.
- `docs/research/README.md` indexes every report.
- Evidence screenshots worth keeping are copied into `docs/research/img/` (the Playwright output folder is gitignored).

## 4. Consolidate harness lessons into CLAUDE.md

Add durable, actionable lessons to the project `CLAUDE.md` (create it if missing): commands, verification steps, environment pitfalls, and rules that would have prevented this session's mistakes. Rules:

- One line per lesson, phrased as what to do (or never do) and why.
- Merge with existing entries; do not duplicate.
- Only things a future session can act on. Skip one-off details.
- Do not edit workspace-level governance files (for example a parent `AGENTS.md`) without asking.

## 5. Update memory

Follow the memory rules in the system prompt. In short:

- Save user preferences and working style (`feedback`), product direction and goals not derivable from the repo (`project`), and pointers to external resources (`reference`).
- Do not duplicate what the repo already records (code, `CLAUDE.md`, proj-mgmt, research docs): point to it instead.
- Update existing memory files rather than adding near-duplicates; remove memories that are now wrong.
- Keep `MEMORY.md` a one-line-per-memory index.

## 6. Verify and commit

- Run the project's checks (for this repo: `npx tsc --noEmit -p .`, `yarn test:unit`, `yarn build`, and `yarn research:cross-dim` if research changed).
- Commit in logical groups if the user has authorized commits for this session; otherwise list exactly what is uncommitted and ask.
- **Git safety**: stage files explicitly and commit. Never use `git stash --include-untracked`, `git restore --source=<commit> -- .`, `git checkout -- .`, or other bulk working-tree rewrites to split or verify commits. To verify a commit in isolation, export it with `git archive <sha>` into a scratch folder outside the synced drive and run the checks there.
- Stop background processes you started (for example a dev server) or tell the user they are still running.

## 7. Report readiness

Give the user a short report:

- What was consolidated where (proj-mgmt items updated, research docs, CLAUDE.md lessons, memory files), with links.
- Commits made (hashes) and anything left uncommitted.
- Anything you could not persist or are unsure about, as explicit questions.
- A clear statement that the session is ready to clear, or what must happen first.

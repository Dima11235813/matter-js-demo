# 10. Housekeeping ☐

* ☐ **Old `master` branch** on GitHub: `main` replaced it (same history plus everything since). After item 1 (default branch `main`), either archive it by renaming it `master-archived` or leave it. Nothing is deleted without you.
* ☐ **Local git stash `stash@{0}`** (from the 2026-09-23 git incident): everything in it has long been committed. Drop it with `git stash drop stash@{0}` when you're comfortable, or keep it.
* ☐ **`/consolidate-session` skill**: project-only today (`.claude/skills/`). Copy it to `~/.claude/skills/` if you want it in every project.
* ☐ **`gh auth login`**: lets the agent open and merge pull requests and read CI logs (today it can only read public run results). It blocked diagnosing a flaky e2e failure on `8f1e9cb` (2026-10-04): the annotations only say "exit code 1".
* ☐ **Old Dependabot branches** on GitHub (22 `dependabot/npm_and_yarn/*` branches from before this work): stale; close or ignore.

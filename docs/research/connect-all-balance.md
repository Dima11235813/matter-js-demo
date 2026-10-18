# Connect-All Puzzles: Rules, Par, and Balance

**Status**: rule set and generator decided 2026-10-04; beam-search par and a template per band 2026-10-11 (§6) · **Drives**: [Epic 2 · Feature 2.10](../../proj-mgmt/epic-2-gamification.md) · **Reproduce**: `CONNECT_PUZZLES=100 npx vitest run --config docs/research/experiments/vitest.research.config.ts connectAllBalance` (~3 min; writes [`results/connect-all-balance.json`](experiments/results/connect-all-balance.json))

## 1. Question

The owner's idea is a board of loose words where you add words until every word has at least two connections, with rules balanced so that no single strategy dominates. Which rules and which puzzles make that a game: solvable, spread across difficulty, and not beaten by a cheap trick such as playing generic "hub" words that link to everything?

## 2. Method

* **Rules** (`src/game/connectAll.ts`):
  * two words connect when their similarity is at or above the calibrated p99 link (0.230), the same threshold as the threads drawn in hint mode;
  * a word is connected at degree ≥ 2, and the puzzle is solved when every word is (added words included);
  * moves are vocabulary words (the 7,948 most frequent plain words), and a move can't share a stem with a board word.
* **Par**: a greedy solver plays the word that lifts the most under-connected words while linking at least twice itself. Par = its move count, capped at 15.
* **Bots**:
  * solver (the reference);
  * hub (the word with the most links, ignoring which words need them);
  * nearest (the most similar word to the loosest board word);
  * random (any of the 3,000 most frequent legal words).
* **Rule sets**:
  * base;
  * hubStrict (words in the top 500 need p99 + 0.08);
  * bannedTop300 (the 300 most frequent words can't be played);
  * cap2 (an added word keeps only its 2 strongest links);
  * hubStrictCap3.
* **Puzzles**: 100 per rule set, seeded.

## 3. Findings

**Random boards are the wrong puzzles.** In a 10-word pilot, par was about 12 on every board (all "hard"), and the hub, nearest and random bots never solved one in 15 moves. In this embedding, random words are almost all unrelated, so each one needs its own two bridges.

**Templates fix it.** A board is now built from `pairs` related pairs (a word plus a close neighbour at p99 + 0.02 … 0.65, so both start dangling) and `loose` unrelated words. Five templates are used: 3+0, 3+1, 2+2, 3+2, 2+4.

| Rule set | Solvable | Bands easy / medium / hard (par ≤ 3 / 4–6 / ≥ 7) | Mean par | Solver | Hub | Nearest | Random |
|---|---|---|---|---|---|---|---|
| **base** | **84/100** | **21 / 49 / 14** | 4.85 | 100%, +0 | **1%** | 100%, **+3.9** | **0%** |
| hubStrict | 74 | 21 / 37 / 16 | 4.96 | 100%, +0 | 0% | 96%, +4.5 | 0% |
| bannedTop300 | 84 | 21 / 48 / 15 | 4.86 | 100%, +0 | 0% | 100%, +4.0 | 0% |
| cap2 | 67 | 20 / 19 / 28 | 6.43 | 100%, +0 | 0% | 82%, +3.8 | 0% |
| hubStrictCap3 | 74 | 16 / 33 / 25 | 5.89 | 100%, +0 | 0% | 97%, +3.5 | 0% |

(Bot cells: share of solvable puzzles solved, then the mean number of moves over par. An unsolved run counts as 20 moves.)

* **The feared hub strategy doesn't exist here.** At the p99 threshold, frequent words rarely link to anything (hub bot: 0–1%). Every anti-hub lever only removes solvable puzzles (hubStrict, cap2) or changes nothing (bannedTop300).
* **Thinking beats patching.** The nearest-neighbour bot solves everything but needs about 4 extra moves; to match par you must find words that bridge two needy words at once. Random play never solves a puzzle.
* **Difficulty spreads across bands**, from the templates rather than from the rules.

## 4. Decision

* **Base rules**: p99 link, degree ≥ 2, no anti-hub levers, and no stems shared with board words.
* **Template generator** with seeded puzzles. Par comes from the greedy solver, and the band from par.
* Next is the puzzle mode UI (Task 2.10.5): HUD ratio, loose words highlighted, moves vs par, win state, and the next puzzle.

## 5. Limitations

* Par is greedy, not optimal; a beam search could lower it (Task 2.10.2 follow-up). The solver currently is the par, so "+0" is by construction.
* 100 puzzles give 14 in the hard band. The plan's "≥ 50 per band" needs about 400 puzzles or more hard templates (for example 2 pairs + 5 loose).
* The bots aren't people; the real test is the owner finding a puzzle fun (play-test after the UI).
* *(Both limitations above were addressed on 2026-10-11, §6.)*

## 6. Beam-search par and a template per band (2026-10-11)

**Question.** Can a beam search tighten par, and which templates give at least 50 puzzles per band in 200 (the exit criterion)? Greedy par puts many puzzles one move too high, and only 14 of 100 puzzles were hard.

**Method.**
* **`solveBeam`** (`src/game/connectAll.ts`):
  * It keeps the 4 boards with the fewest missing connections at each move, and tries each board's 4 best moves (greedy's ranking).
  * The first solved board is par. Greedy's solution is the fallback, so par is never longer than greedy's.
* **Candidate pool:** a move must lift a word that has fewer than two connections, so the search only scores vocabulary words linked to such a word (`SimColumns.linked`). It's a pure speed-up: the unit test and all 440 experiment puzzles give identical results.
* **Experiments:**
  * per-template stats over 40 seeds × 11 templates ([`connectAllPar.experiment.ts`](experiments/connectAllPar.experiment.ts), [results](experiments/results/connect-all-par.json));
  * then the balance harness on 200 puzzles with the chosen mix and beam par (`CONNECT_RULES=base CONNECT_PUZZLES=200`, [results](experiments/results/connect-all-balance-base-200.json)).

**Findings: par and speed.**

| Template | Solvable (greedy / beam) | Mean par (greedy → beam) | Beam shorter | Bands by beam par (E/M/H) | ms: greedy / beam / beam + pool |
|---|---|---|---|---|---|
| 3+0 | 39 / 39 | 2.85 → 2.85 | 0 | 39 / 0 / 0 | 46 / 75 / 54 |
| 3+1 | 37 / 39 | 4.43 → 4.38 | 2 | 2 / 37 / 0 | 88 / 188 / 104 |
| 2+2 | 32 / 33 | 4.72 → 4.63 | 2 | 0 / 33 / 0 | 81 / 182 / 97 |
| 3+2 | 32 / 36 | 5.81 → 5.69 | 4 | 0 / 28 / 8 | 116 / 277 / 132 |
| 2+4 | 28 / 31 | 7.04 → 6.93 | 3 | 0 / 10 / 21 | 135 / 352 / 149 |
| 2+5 | 34 / 35 | 8.09 → 8.00 | 3 | 0 / 0 / 35 | 165 / 437 / 173 |
| 3+4 | 37 / 37 | 8.08 → 7.92 | 6 | 0 / 4 / 33 | 179 / 464 / 185 |
| 1+6 | 29 / 32 | 8.38 → 8.24 | 4 | 0 / 1 / 31 | 155 / 432 / 166 |
| 1+4, 0+5, 0+6 | 21–27 / 24–31 | 6.0–7.6 | 3–4 | mixed medium/hard | ≈ 100–130 pooled |

(40 seeds each; node, desktop.)

* **Beam trims par by one move** on up to 6 of 40 puzzles per template (mean −0.05 to −0.16).
* **Beam solves 1–4 more puzzles per template** than greedy, so fewer seeds are skipped.
* **With the pool, beam costs about what greedy did.**
* **Bands follow the template:** 3+0 is always easy; 3+1 and 2+2 are medium; 2+5, 3+4 and 1+6 are hard.

**Findings: the chosen mix** (3+0, 3+1, 2+5, 3+0, 2+2, 3+4, interleaved) on 200 puzzles:

| | Value |
|---|---|
| Solvable | 185 / 200 |
| Bands (easy / medium / hard) | **70 / 63 / 52** |
| Mean par | 5.01 |
| Greedy bot | 96% solved, **+0.58** moves over beam par (par is now tighter than the old solver plays) |
| Nearest-neighbour bot | 85%, +4.8 |
| Hub bot | 1% |
| Random bot | 0% |

**Deal time in the browser** (e2e bundle, "Next puzzle" until the new puzzle is dealt, 12 puzzles):

| CPU | Time |
|---|---|
| Desktop | 46–134 ms |
| 4× throttled (phone-like) | 168–1,125 ms; the slowest are hard puzzles |

**Decision.**
* Par is now beam search with the candidate pool.
* The templates are the six-template mix above.
* Puzzle numbers deal different boards from before 2026-10-11 (the mix changed). Saved bests are keyed by the board's words, so an old result never counts for a new board.

**Limitations.**
* **Beam isn't optimal either:** width 4, branch 4. A wider beam was not tried.
* **Slow on phones:** on a slow phone, dealing a hard puzzle can stall the page for about a second. Roadmap: compute the next puzzle ahead of time, in idle time or a worker (Epic 2 · Task 2.10.6). *Resolved 2026-10-18: puzzles are made in a Web Worker, the next one ahead of time. At 4× throttle, deals take 12–56 ms (was 174–987 ms), with no main-thread task over 50 ms (was up to 1,015 ms).*
* **The exit criterion "no strategy beats the others by more than 20%"** was written for strategies that compete. Here the cheap ones lose badly (hub 1%, random 0%), which is the balance the plan wanted.

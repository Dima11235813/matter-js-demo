# Connect-All Puzzles: Rules, Par, and Balance

**Status**: rule set and generator decided 2026-10-04; puzzle mode UI next · **Drives**: [Epic 2 · Feature 2.10](../../proj-mgmt/epic-2-gamification.md) · **Reproduce**: `CONNECT_PUZZLES=100 npx vitest run --config docs/research/experiments/vitest.research.config.ts connectAllBalance` (~3 min; writes [`results/connect-all-balance.json`](experiments/results/connect-all-balance.json))

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

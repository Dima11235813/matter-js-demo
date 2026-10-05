# Color Hint Mode: Hues That Mirror Meaning

**Status**: decided and shipped 2026-10-04 · **Drives**: [Epic 5 · Feature 5.17](../../proj-mgmt/epic-5-3d-semantic-space.md) · **Reproduce**: `npx vitest run --config docs/research/experiments/vitest.research.config.ts semanticColors` (writes [`results/semantic-colors.json`](experiments/results/semantic-colors.json))

## 1. Question

The owner asked for a color hint mode: similar concepts get similar colors, so color gives a second hint about relationships on top of distance, in 2D and 3D. Which mapping from a board's embeddings to hue does this best? The plan's exit criteria are:

* color distance vs similarity: Spearman ≤ −0.5 on the families board;
* groups ≥ 60° of hue apart on boards with ≤ 6 groups;
* existing words change by less than ΔE 10 when a word is added;
* every label stays ≥ 4.5:1.

## 2. Method

Four boards from the real vocabulary:

* `families15`: pets, royalty, sea, medical, music;
* `dense24`: the same families, larger;
* two random 30-word boards.

Groups come from the game's own `similarityGroups` at the default threshold (0.183). For every word pair, the experiment compares color distance (OKLab ΔE ×100) with cosine similarity.

| Mapping | Idea |
|---|---|
| random | today's random box colors (baseline) |
| pcaAngle | hue = angle of the word in the board's top-2 PCA plane |
| groupFirst (first design) | groups ordered around the wheel by a similarity tour, evenly spaced; members vary lightness |
| **projection + separated groups (shipped)** | PCA-angle hues, group hue = circular mean of members, multi-word groups pushed apart to ≥ min(60°, 360°/G), members within ±12° of the group hue, singletons muted |

## 3. Findings

| Mapping · board | Spearman (ΔE vs sim) | Min hue gap between groups | Max shift when a word joins (ΔE) | Min contrast |
|---|---|---|---|---|
| random · families15 | 0.00 | 2.5° | 25.2 | 7.9 |
| pcaAngle · families15 | **−0.70** | 21° | 2.3 | 8.0 |
| groupFirst · families15 | −0.39 | 56.5° | 17.8 | 5.8 |
| **shipped · families15** | **−0.67** | **60°** | **0.5** | 6.4 |
| pcaAngle · dense24 | −0.60 | 5.7° | 4.7 | 7.9 |
| **shipped · dense24** | **−0.58** | 57.9° | 8.7 | 6.3 |
| pcaAngle · random30a / b | −0.47 / −0.49 | 15° / 18° | 1.1 / 22.6 | 7.9 |
| shipped · random30a / b | −0.18 / −0.19 | 58.8° / 47.5° | 0.6 / 14.7 | 6.3 |

* **PCA angle alone** mirrors meaning well (−0.70), but groups blur into each other (6–21° apart), so it fails as a group hint.
* **Even group spacing** (the first design) separates groups but throws away how related the groups are, which leaves a weak Spearman (−0.39).
* **The shipped hybrid** keeps the projection's ordering and enforces the gap. It meets every criterion on the families board and comes close on dense24 (the 57.9° is measured on member hues, which sit up to ±12° off the group hue; group hues themselves are 60° apart).
* **Random boards** carry little meaning by construction: most words are singletons and are muted. One random board shifts by 14.7 when the new word reorganizes the groups.
* Screenshots, families board:
  * [2D, off](img/color-hints-off-2d.png)
  * [2D, on](img/color-hints-on-2d.png)
  * [3D, on](img/color-hints-on-3d.png)

  With hints on, each family has its own hue (medical orange, pets magenta, royalty olive, sea blue, music teal).

## 4. Decision

* Ship the hybrid: pure `semanticColors` (`src/theme/semanticColors.ts`), with the projection by power iteration on the double-centred similarity matrix. It needs no linear-algebra dependency and is deterministic.
* One painter (`src/services/colorHints.ts`) serves both worlds. It recomputes only when the board's words or molecules change, and keeps the previous hues, so 2D ↔ 3D and new words don't repaint the board.
* Molecule members share a hue.
* The 🎨 menu button turns it on or off. It is a per-device preference, independent of hint mode, dimension, and view (Discovery and Guess).

## 5. Limitations and follow-ups

* 2D molecule halos keep their own palette; matching them to the group hue is still open (Task 5.17.3 follow-up).
* When an added word reorganizes groups, existing words can shift by more than ΔE 10 (random30b: 14.7). Easing color changes over ~500 ms would hide it.
* The colors haven't been checked under color-vision deficiencies yet. Lightness steps within groups help, but this needs a proper check.

# Analogy Scoring: Rewarding Answers That Connect to the Third Word

**Status**: research complete, rule proposed (not built), plan in [Epic 2 · Feature 2.11](../../proj-mgmt/epic-2-gamification.md) · **Date**: 2026-09-24 · **Reproduce**: `npx vitest run --config docs/research/experiments/vitest.research.config.ts analogyScoring` (data: [`experiments/results/analogy-scoring.json`](experiments/results/analogy-scoring.json))

## 1. Question

Proposed rule for the scoring (timed) game: when a player plays *a : b :: c*, the answer *d* earns points if it **connects to the third word** (the analogy worked), and loses points if it **connects to the first or second word** (it fell back onto the question). Does the rule reward real analogies, and can it be gamed? In game-design terms: under this rule, is there a dominant strategy that beats actually finding analogies?

## 2. Method

Plays come from six populations. Each is solved with the game's solver (3CosAdd with the stem filter) on the shipped vocabulary (MiniLM, 20,001 words):

| Population | n | What it models |
|---|---|---|
| canonical | 30 | known-good analogies (gender, capitals, comparatives, young animals, part–whole, verb tense, …) |
| dealtPair | 187 | the typical timed-game play: *a, b* are a dealt related pair, *c* comes from another pair (20 dealt boards) |
| dealtAny | 107 | any three words from a dealt board |
| exploitSynonym | 150 | a strategy: *a, b* near-synonyms (b = a's nearest word), *c* anything |
| exploitNearB | 150 | a strategy: *c* is *b*'s nearest word |
| random | 150 | three unrelated common words |

"Connects" means the hint layout's link: similarity ≥ calibrated p99 (0.23). Measured per play: similarities of *d* to *a, b, c*; the **offset cosine** cos(b − a, d − c), which checks whether the same relation carries over; and **trivial**, meaning *d* is simply *c*'s nearest word, so the question transferred nothing.

## 3. Findings

### 3.1 The literal rule is inverted

| Population | Literal rule: reward / penalty | Today's points (mean) | Trivial answers |
|---|---|---|---|
| canonical | **23% / 77%** | 59 | 37% |
| dealtPair | **97% / 2%** | 52 | 73% |
| exploitSynonym | **95% / 5%** | 49 | 66% |
| exploitNearB | 1% / 99% | 55 | 54% |
| random | 47% / 53% | 42 | 31% |

* **Real analogies are penalized.** A correct answer is naturally close to *b*, because it shares b's relation: queen–king 0.53, mother–father 0.60, worse–better 0.60, while queen–woman is only 0.22. So "connects to the first or second word" is the *normal* case for a good analogy, not a failure.
* **Empty plays are rewarded.** When *a* and *b* are near-synonyms, b − a ≈ 0 and the answer is just *c*'s nearest neighbour, which of course connects to *c*. That is a dominant strategy: pick any synonym pair and any third word, 95% reward. The dealer deals exactly such pairs, so ordinary timed-game plays are rewarded 97%, although 73% of them transfer nothing.
* **Today's scoring doesn't separate either**: points = answer similarity, 59 on average for real analogies vs 42 for random words, and 55 for the near-*b* exploit.

### 3.2 A guarded rule that keeps the core idea

The part of the proposal that holds up is that the answer should connect to the third word. Three guards make it discriminate:

* **reward** = *a* and *b* are related (sim ≥ p99) **and** *d* connects to *c* (sim ≥ p95) **and** the relation carries over (offset cosine ≥ 0.25)
* **penalty** = *d* connects to *a* or *b* (≥ p99) but **not** to *c*: the answer collapsed onto the question pair
* otherwise **no points**, with the hint "no relation carried over"

Grid over the thresholds (reward % / penalty %):

| Rule | canonical | dealtPair | dealtAny | exploitSynonym | exploitNearB | random |
|---|---|---|---|---|---|---|
| sAB ≥ p99, sDC ≥ p95, offset ≥ 0.25 (**proposed**) | **70 / 7** | 0 / 0 | 0 / 37 | 1 / 1 | 0 / 0 | 0 / 35 |
| sAB ≥ p99, sDC ≥ p95, offset ≥ 0.35 | 53 / 7 | 0 / 0 | 0 / 37 | 0 / 1 | 0 / 0 | 0 / 35 |
| sAB ≥ p99, sDC ≥ p99, offset ≥ 0.25 (the literal "connects" threshold for *c*) | 67 / 13 | 0 / 0 | 0 / 41 | 1 / 2 | 0 / 0 | 0 / 41 |

Offset cosine deciles (10/25/50/75/90%): canonical 0.09/0.31/0.39/0.43/0.54; dealtPair −0.07/−0.03/0.02/0.07/0.14; exploitSynonym −0.05/0.01/0.06/0.10/0.14; random 0.00/0.04/0.17/0.34/0.39. The offset is what separates a relation from a coincidence. The sAB guard removes the random plays whose offset is high by chance.

* Both exploits drop to ≤ 1% reward, so neither is a dominant strategy any more.
* 70% of real analogies are rewarded.
* Penalties mostly hit nonsense (random 35%, any-three-words 37%).
* The 7% of canonical plays penalized are the model's own failures: cow : calf :: sheep → calves, bird : fly :: fish → flew, horse : foal :: cow → fowl, banana : yellow :: apple → colored. A player who asks a valid question loses points because the embedding can't answer it.

### 3.3 Dealt boards contain almost no analogies

Under the guarded rule, typical timed-game plays earn 0%. The dealer deals related pairs (dog/puppy, lily/lilly), but two random pairs rarely share a relation, so there is no analogy on the board to find. A fair scoring rule therefore needs a **dealer that deals analogy quads**: two pairs that share a relation (man/king + woman/queen), mined offline, where both pairs are links and the offset cosine is ≥ 0.35.

## 4. Decision (proposed; to confirm by play-testing)

1. Replace "answer connects to *c*" with the guarded rule in §3.2. Keep the user's intent: connecting to the third word is required, and falling back onto the question pair loses points.
2. Make the penalty small and explained: "−10: *d* is closer to *a / b* than to *c*". Consider no penalty when the model's answer is also wrong by the model's own runner-ups (the penalty should punish the play, not the embedding).
3. Scale points by relation quality (offset cosine) instead of raw similarity, so better analogies score more.
4. Deal analogy quads in timed rounds, so a good play always exists; the Connect-All generator (Feature 2.10) can share the quad miner.
5. Sandbox stays unscored by this rule; it shows the verdict as a learning hint ("relation carried over ✓").

## 5. Limitations

* 30 canonical analogies, and the thresholds were chosen on the same data. Before shipping, validate on a held-out set (a subset of the Google analogy set / BATS restricted to the vocabulary).
* MiniLM is weak at analogies (it finds the expected answer in 53% of the canonical set), so many "wrong" answers are reasonable (florence, seville, classroom).
* Trivial ≠ wrong: japan → tokyo is both correct and Japan's nearest word. The proposed rule doesn't use the trivial flag; the offset does the work.
* Player behaviour is simulated by populations, not observed. Log real plays (question, answer, the three similarities, offset, verdict) to re-run this analysis on actual games.

## References

* Mikolov, Yih, Zweig (2013), *Linguistic Regularities in Continuous Space Word Representations* (3CosAdd).
* Levy, Goldberg (2014), *Linguistic Regularities in Sparse and Explicit Word Representations* (3CosMul; analogy answers sit next to the query words).
* Linzen (2016), *Issues in evaluating semantic spaces using word analogies* (many analogy "successes" are just nearest neighbours of *c*, the trivial case measured here).

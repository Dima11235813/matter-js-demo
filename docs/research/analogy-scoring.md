# Analogy Scoring: Rewarding Answers That Connect to the Third Word

**Status**: research complete; held-out validation (§5) shows vectors alone cannot score analogies fairly, so timed rounds will score against designed questions, validated by simulation in §7 (decided 2026-09-25, not built yet), plan in [Epic 2 · Feature 2.11](../../proj-mgmt/epic-2-gamification.md) · **Date**: 2026-09-24 · **Reproduce**: `npx vitest run --config docs/research/experiments/vitest.research.config.ts analogyScoring` (data: [`experiments/results/analogy-scoring.json`](experiments/results/analogy-scoring.json))

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

## 4. First proposal (superseded by the revised proposal in §5)

1. Replace "answer connects to *c*" with the guarded rule in §3.2. Keep the user's intent: connecting to the third word is required, and falling back onto the question pair loses points.
2. Make the penalty small and explained: "−10: *d* is closer to *a / b* than to *c*". Consider no penalty when the model's answer is also wrong by the model's own runner-ups (the penalty should punish the play, not the embedding).
3. Scale points by relation quality (offset cosine) instead of raw similarity, so better analogies score more.
4. Deal analogy quads in timed rounds, so a good play always exists; the Connect-All generator (Feature 2.10) can share the quad miner.
5. Sandbox stays unscored by this rule; it shows the verdict as a learning hint ("relation carried over ✓").

## 5. Held-out validation (2026-09-25)

**Data**: the Google analogy test set (Mikolov et al. 2013; `questions-words.txt` from the word2vec repository, Apache 2.0), keeping analogies whose four words are all in the vocabulary. Up to 40 per category were sampled with a fixed seed: 492 analogies in 13 categories ([`experiments/data/google-analogies-vocab.txt`](experiments/data/google-analogies-vocab.txt)). Plural verbs drop out entirely, because the vocabulary keeps singulars only. The model returns the expected answer for 59% of them.

**The proposed rule fails the gate.** It rewards 42% of held-out analogies (gate: ≥ 60%), penalizes 4%, and still rewards ≤ 1% of exploit plays. The 0.25 offset threshold was overfit to the 30 hand-picked analogies: their median offset is 0.39, the held-out median 0.25.

| Rule (reward / penalty %) | canonical | held-out | dealtPair | exploitSynonym | random |
|---|---|---|---|---|---|
| sAB ≥ p99, sDC ≥ p95, offset ≥ 0.25 | 70 / 7 | **42 / 4** | 0 / 0 | 1 / 1 | 0 / 35 |
| sAB ≥ p99, sDC ≥ p95, offset ≥ 0.20 | 70 / 7 | **51 / 4** | 1 / 0 | 4 / 1 | 0 / 35 |

By category (offset ≥ 0.25): nationality-adjective 93%, common capitals 85%, world capitals 68%, family 57%, comparative 40%, city-in-state 35%, present participle 28%, currency 25% (38% penalized: the model fails currencies), past tense 20%, adjective → adverb 18%, **opposites 0%**.

**Why a better threshold cannot fix it.** Of the correct answers the rule rejects, the offset check fails for 40%. In MiniLM the relation direction is weak next to word identity: aware : unaware :: ethical → unethical is correct, yet its offset cosine is 0.04, because *unethical* is simply *ethical*'s nearest word. 42% of held-out analogies have that shape. From the vectors, that is the same as the synonym exploit (file : document :: bike → bicycle), which is itself a true analogy (the synonym relation), only a cheap one. A tiered "insight" rule was also tested: an answer that is not among *c*'s nearest neighbours, plus the reverse analogy *c : d :: a* leading back to *b*. It does not separate the two either. The synonym exploit round-trips (synonymy is symmetric): 33% of exploit plays earn "insight" vs 42% of held-out analogies.

**Conclusion.** Vector checks can tell nonsense (0–1% rewarded) and collapse (penalty) apart from plausible analogies, but not a cheap true analogy from an insightful one. Fair scoring needs the game to control the question, not a sharper threshold.

**Revised proposal.**
1. **Verdict as a learning hint**, in the sandbox and the timed game: offset ≥ 0.20 (held-out 51% "relation carried over ✓", exploits ≤ 4%, nonsense 0%), plus the collapse warning. It teaches which analogies the embedding actually encodes, and changes no points.
2. **Scoring by designed questions**: timed rounds deal analogy quads (Google-set categories that work in this model: capitals, nationality adjectives, family, comparatives). A play scores when its answer lands on the board word that completes a dealt quad (full points), or on another board word linked to *c* (partial); a collapse costs points. Synonym pairs are not dealt, so the exploit has nothing to work with. This measures what the user proposed (the answer connects to the right word) against a known answer instead of a heuristic.
3. Validate (2) by simulation before building it: every dealt board has ≥ 2 completable quads, and random play earns < 10% of skilled play.

## 6. Limitations

* The thresholds were first chosen on 30 canonical analogies; the held-out check in §5 showed they were overfit.
* MiniLM is weak at analogies (it finds the expected answer in 53% of the canonical set), so many "wrong" answers are reasonable (florence, seville, classroom).
* Trivial ≠ wrong: japan → tokyo is both correct and Japan's nearest word. The proposed rule doesn't use the trivial flag; the offset does the work.
* The quad simulation deals 12 boards per category, and its strategies are models, not people. Play-testing decides whether full = 100 and penalty = −10 feel right.
* Player behaviour is simulated by populations, not observed. Log real plays (question, answer, the three similarities, offset, verdict) to re-run this analysis on actual games.

## 7. Designed questions, simulated (2026-09-25)

**Decision (user, 2026-09-25)**: score timed rounds against designed questions; the vector verdict becomes a learning hint.

**Setup** ([`quadBoards.experiment.ts`](experiments/quadBoards.experiment.ts), data [`experiments/results/quad-boards.json`](experiments/results/quad-boards.json)): 350 relation pairs in 13 categories ([`experiments/data/google-analogy-pairs.txt`](experiments/data/google-analogy-pairs.txt), unique pairs from the Google set with both words in the vocabulary). A board deals 10 words: 3 pairs from one category and 2 from another, with no stems shared across pairs. A **designed play** is *a → b* from one pair and *c → d* from another pair of the same category, in the same direction (either way round). 12 boards per category. Strategies:

* **skilled**: every designed play on the board;
* **pairPlusAny**: a dealt pair plus any other word as *c* (half-informed);
* **mostSimilarPair**: the two most similar words on the board as *a, b*, then every other word as *c* (the synonym exploit, adapted to dealt boards);
* **random**: any three words.

Outcomes: **full** = the answer completes a designed play; **partial** = the answer is another board word linked to *c*; **penalty** = the answer connects to *a* or *b* but not to *c*. Three solvers: the game's solver (any vocabulary word; the answer spawns), a lenient version that counts a board word in the solver's **top 3**, and a board-only solver (the answer must be a board word).

Mean points per play, pooled over categories (full 100, partial 0, penalty −10; in brackets the share of skilled play):

| Solver | skilled | pairPlusAny | mostSimilarPair | random |
|---|---|---|---|---|
| game solver | 55.8 | 10.1 (0.18) | 12.0 (0.22) | −1.4 |
| **game solver, top-3 leniency** | **68.9** | 11.5 (0.17) | 15.0 (0.22) | −1.2 |
| board-only solver | 94.6 | 17.2 (0.18) | 18.6 (0.20) | −0.7 |

A partial reward makes guessing pay: with partial 25, random play earns 14% of skilled on the board-only solver, and informed guesses earn 0.27–0.39. So partial matches earn nothing.

* **Every board is completable**: the median is 8–14 designed plays the solver completes, and ≥ 2 on 100% of boards (92% for currency and opposites).
* **Random play earns nothing**, meeting the "< 10% of skilled" gate; half-informed strategies earn about a fifth.
* **The board-only solver scores skilled play highest**, but it makes the answer a pick from the board instead of an introduced word, and random play gets lucky more often. The top-3 game solver keeps the original mechanic, where the answer is a new word that lands on the board.

Skilled points per category (top-3 leniency): world capitals 90, present participle 82, common capitals 80, family 78, past tense 75, nationality adjective 72, superlative 70, city-in-state 70, comparative 65, opposite 62, adjective → adverb 46, currency 37.

**Decision**:
1. Timed rounds deal 3 pairs from one relation category plus 2 from another.
2. Score with the game solver and top-3 leniency: when a board word that completes a designed play is among the top 3 answers, that word is the answer (it gets focus; the HUD also shows the model's first choice).
3. Points: full = 100, partial = 0, penalty (collapse onto the first pair) = −10, anything else = 0.
4. Use the categories with skilled ≥ 60: capitals (common and world), family, nationality adjectives, comparative, superlative, present participle, past tense, city-in-state, opposites. Currency and adjective → adverb are excluded.
5. The vector verdict (offset ≥ 0.20, collapse warning) is shown as a learning hint in both modes and changes no points.

## References

* Mikolov, Yih, Zweig (2013), *Linguistic Regularities in Continuous Space Word Representations* (3CosAdd).
* Levy, Goldberg (2014), *Linguistic Regularities in Sparse and Explicit Word Representations* (3CosMul; analogy answers sit next to the query words).
* Linzen (2016), *Issues in evaluating semantic spaces using word analogies* (many analogy "successes" are just nearest neighbours of *c*, the trivial case measured here).

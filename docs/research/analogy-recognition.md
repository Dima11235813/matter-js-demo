# Analogy Recognition on Real Analogies

**Status**: research done 2026-10-18; owner decision pending (§5) · **Drives**: [Epic 2 · Feature 2.17](../../proj-mgmt/epic-2-gamification.md) · **Reproduce**: `npx vitest run --config docs/research/experiments/vitest.research.config.ts analogyRecognition` (~20 min; writes [`results/analogy-recognition.json`](experiments/results/analogy-recognition.json); `ANALOGY_QUESTIONS=10` for a pilot in the OS temp folder)

## 1. Question

Owner, 2026-10-18: "make sure that our analogy recognition is optimized for actual analogies". The app recognizes analogies in two places:

* **Discovery and typed analogies.** For a : b :: c, the answer comes from the vectors: 3CosAdd over the shipped MiniLM vocabulary of 20,001 words, excluding the inputs and their stem variants (`src/embeddings/analogy.ts`).
* **Guess.** Four picks a : b :: c : d score only when they are two dealt pairs of one relation (`gradeGuess`), because earlier research found vectors alone could not score fairly ([analogy-scoring.md](analogy-scoring.md)).

How good is each on real analogies, and which change would help most?

## 2. Method

**Datasets**, both with every word in the vocabulary:

| Dataset | Categories | Pairs | What it covers |
|---|---|---|---|
| **google** | 13 | 349 | The Google analogy test set's pairs (`questions-words.txt`, Mikolov et al. 2013, Apache 2.0): capitals, currency, city–state, family, and eight grammar categories |
| **lexical** | 10 | 126 | Written for this project ([`lexical-analogy-pairs.txt`](experiments/data/lexical-analogy-pairs.txt)), the everyday relations the Google set leaves out: antonym, animal–young, part–whole, worker–tool, worker–place, animal–sound, thing–color, thing–material, hypernym (kind of), synonym |

BATS (Gladkova et al. 2016) would add 40 relations, but its distribution is CC BY-NC 4.0, so it isn't in the repo (§6).

**Answer accuracy.** A question is two different pairs of one category (a → b, c → d), up to 150 per category: 3,090 in all. Any y paired with c in the category counts as right (lion → cub and bear → cub). Questions whose right answer is one of the inputs are dropped. Rank of the best right answer among allowed candidates, scored by:
* **nearestC**: the word nearest c, no analogy at all. This is Linzen's (2016) baseline: it shows how much an "analogy" score owes to c's neighbourhood.
* **3CosAdd** (shipped): cos(d, b) − cos(d, a) + cos(d, c).
* **3CosMul** (Levy & Goldberg 2014).
* **3CosAvg** (Drozd et al. 2016): c plus the category's mean offset over its *other* pairs (leave-one-out, never the question's own two pairs). It needs to know a → b's relation, which is what a relation bank provides.

"**Hard**" questions are the ones nearestC gets wrong, so the relation really has to transfer: 997 Google and 1,187 lexical.

**Recognition.** 300 real quads (two pairs of one category) are compared with 300 each of:
* *cross-relation* quads: pairs from two categories, the look-alike that matters;
* *reversed* quads: the second pair backwards;
* random words.

Scores tried:
* **offsetCos**: cos(b − a, d − c);
* **proposes**: 1/rank of d under 3CosAdd.

Reported: ROC AUC, and the share of real analogies accepted at a threshold that rejects 95% of cross-relation quads.

## 3. Findings

### 3.1 Answers

| Method | google top 1 | google hard | google top 5 | **lexical top 1** | lexical hard | lexical top 5 |
|---|---|---|---|---|---|---|
| nearestC (no analogy) | 43% | 0% | 78% | 11% | 0% | 38% |
| **3CosAdd (shipped)** | 66% | 44% | 87% | **15%** | 8% | 39% |
| 3CosMul | 67% | 49% | 86% | 13% | 8% | 38% |
| 3CosAvg (known relation) | **73%** | **52%** | **89%** | **18%** | **9%** | **49%** |

Top-1 accuracy per category:

| google | nearestC | 3CosAdd | 3CosMul | 3CosAvg |
|---|---|---|---|---|
| capital-world | 0.75 | 0.92 | 0.88 | 0.96 |
| nationality-adjective | 0.45 | 0.95 | 0.95 | 0.98 |
| family | 0.13 | 0.69 | 0.69 | **0.92** |
| past-tense | 0.45 | 0.57 | 0.60 | 0.75 |
| opposite (un-) | 0.33 | 0.43 | 0.41 | 0.40 |
| adjective-to-adverb | 0.20 | 0.25 | 0.32 | 0.36 |
| currency | 0.00 | 0.17 | 0.18 | 0.27 |

| lexical | nearestC | 3CosAdd | 3CosMul | 3CosAvg |
|---|---|---|---|---|
| worker–place | 0.15 | 0.30 | 0.27 | 0.29 |
| part–whole | 0.23 | 0.17 | 0.13 | 0.28 |
| hypernym | 0.21 | 0.21 | 0.24 | 0.27 |
| synonym | 0.25 | 0.24 | 0.21 | 0.25 |
| animal–young | 0.16 | 0.18 | 0.11 | 0.23 |
| thing–material | 0.00 | 0.08 | 0.07 | 0.17 |
| antonym | 0.08 | 0.14 | 0.13 | 0.15 |
| thing–color | 0.00 | 0.04 | 0.02 | 0.09 |
| worker–tool | 0.00 | 0.05 | 0.05 | 0.00 |
| animal–sound | 0.00 | 0.01 | 0.01 | 0.00 |

* **On the analogies people make every day, the vectors barely do better than no analogy.** 3CosAdd gets 15% top 1 on lexical questions against nearestC's 11%, and 8% when the relation must transfer. Sounds, tools, and colors are near zero. The model's offsets carry geography, family, and grammar (Google 66%), not antonymy, part–whole, or what an animal says.
* **The formula isn't the lever.** 3CosMul moves results by about 1 point either way.
* **Knowing the relation is.** 3CosAvg, given a → b's category, adds 7 points top 1 on Google (family 0.69 → 0.92) and 10 points top 5 on lexical, where the right answer reaches the top 5 for half the questions (49%).
* **Half of Google's "accuracy" is free**: nearestC alone gets 43% (paris → france), so the shipped solver's real analogical skill on Google is 44% (hard questions), not 66%.

### 3.2 Recognition

| Score | Dataset | AUC vs cross-relation | vs reversed | vs random | Real accepted at 5% false accepts |
|---|---|---|---|---|---|
| offsetCos | google | 0.93 | 1.00 | 0.95 | 51% |
| offsetCos | lexical | **0.72** | 0.90 | 0.72 | **35%** |
| proposes | google | 0.68 | 0.83 | 0.99 | 0% |
| proposes | lexical | 0.60 | 0.71 | 0.97 | 0% |

* **The offset direction recognizes Google relations, but not lexical ones.** At a threshold that keeps false accepts to 5%, it accepts only 35% of real lexical analogies. A vector-only Guess grader would refuse most real everyday analogies, or accept many fakes.
* **Guess grading by designed pairs is right.** Vectors can't replace it. What vectors can't know, a relation bank can.

## 4. What this means for the app

* **Discovery's answers are trustworthy only for some relations.** A player who tries hot : cold :: big gets "small" only if the vectors happen to align. Usually they don't, and the app presents a wrong answer with the same confidence as a right one.
* **Guess accepts only dealt pairs.** A real analogy the player spots among the board's words still scores 0 if those pairs weren't dealt together, even when the bank knows the relation.
* **The relation bank is the asset.** Every gain above comes from knowing a → b's relation: the dealt pairs today, and potentially a bank with everyday relations.

## 5. Recommendation (owner decision)

**Knowledge-grounded recognition, vectors as the fallback:**

1. **A relation bank with everyday relations.** Add lexical categories to `data/vocab/relation-pairs.txt` from a curated list (this report's 10 categories as the start, reviewed by the owner), so the game knows the relations people actually use. Possibly later, at scale, from WordNet's antonym, hypernym, and part–whole relations (WordNet's license permits redistribution); that's a separate research step on noise and word senses.
2. **Discovery answers from the bank first:**
   * when a → b is a known pair and c has a pair in that category, answer with the bank's word (exact);
   * when only a → b is known, use 3CosAvg of the category (+7 points top 1 on Google, +10 top 5 on lexical);
   * otherwise use 3CosAdd as today, but say so honestly: "the model's guess", with offsetCos as a shown confidence.
3. **Guess accepts any bank analogy on the board**, not only dealt pairs: any two pairs of one bank category among the board's words, both forward or both reversed, same scoring. The anti-exploit rules stay: only real pairs count, so guessing still can't pay.
4. **Measure again** with this experiment, plus a new question: answers on the questions where the bank covers c (should be about 100%) and where it doesn't (the honest-label case).

## 6. Limitations

* **The lexical set is small** (126 pairs) and written by us: it shows the gap, but isn't a benchmark. BATS (40 relations, about 98k questions) would be the standard measure. It's CC BY-NC 4.0 (via [relbert/analogy_questions](https://huggingface.co/datasets/relbert/analogy_questions)), so if used, it would be downloaded at experiment time and never committed.
* **The shipped vectors only.** A model better at word analogies (static word vectors such as GloVe or fastText) would also do better on Google, but the literature finds lexical relations hard for all of them (Drozd et al. 2016), and the app's live encoder for new words needs MiniLM.
* **Ambiguous relations**: synonym, part–whole, and hypernym answers are often one of several right words. The set lists one or two, so their scores are a floor.

## References

* Mikolov, Chen, Corrado, Dean (2013). Efficient Estimation of Word Representations in Vector Space (the Google analogy test set).
* Levy, Goldberg (2014). Linguistic Regularities in Sparse and Explicit Word Representations. CoNLL (3CosMul).
* Drozd, Gladkova, Matsuoka (2016). Word Embeddings, Analogies, and Machine Learning: Beyond king − man + woman = queen. COLING. https://aclanthology.org/C16-1332 (3CosAvg, LRCos).
* Gladkova, Drozd, Matsuoka (2016). Analogy-based detection of morphological and semantic relations with word embeddings: what works and what doesn't. NAACL Student Research Workshop. https://aclanthology.org/N16-2002 (BATS).
* Linzen (2016). Issues in evaluating semantic spaces using word analogies. RepEval. https://aclanthology.org/W16-2503 (the nearest-to-c baseline).

# Letters Mode: Merge Rules That Form Real Words

**Status**: decided and shipped 2026-10-04 · **Drives**: [Epic 4 · Task 4.5.10](../../proj-mgmt/epic-4-modernization.md), [Epic 2 · Feature 2.14](../../proj-mgmt/epic-2-gamification.md) · **Reproduce**: start the dev server, then `node docs/research/experiments/browser/lettersMergeRules.probe.mjs current,vocab,vocab8k,prefix 4`

## 1. Question

Letters sprinkled across the board mostly turned into fragments and abbreviations ("std", "eos", "nm", "pf", "aa"). The owner wants letters to become words that carry into Discovery (2D/3D relationships) and then into Guess. Is the problem the dictionary or the merge rule?

## 2. Method

A Playwright probe opens letters mode on a fresh page, swaps the merge rules in the page, and clicks 40 letters at seeded random positions (letters themselves are random, weighted by English frequency). After 4 s it counts:

* **real words**: boxes of ≥ 3 letters in the vocabulary or the stopword list;
* **fragments**: boxes of ≥ 2 letters that are neither.

There were 4 trials per variant.

| Variant | Word list | Merge when the combined text… |
|---|---|---|
| current (before) | original `combinationOfAllDict` (13,773 entries, many abbreviations) | occurs anywhere inside a word |
| vocab | game vocabulary (20,001 words) + stopwords | occurs anywhere inside a word |
| vocab8k | 8,000 most frequent vocabulary words + stopwords | occurs anywhere inside a word |
| **prefix** | vocabulary + stopwords | **starts** a word (or is one) |
| prefixCurrent | original dictionary | starts a word |

## 3. Findings

| Variant | Boxes left | Real words (≥ 3) | Fragments | Build |
|---|---|---|---|---|
| current (before) | 14.0 | 1.5 | 9.3 | (134 KB chunk download) |
| vocab | 14.0 | 1.0 | 10.5 | 281 ms |
| vocab8k | 15.8 | 1.8 | 9.8 | 115 ms |
| **prefix** | 17.8 | **3.8** | 8.5 | **12 ms** |
| prefixCurrent | 18.3 | 2.5 | 10.0 | 5 ms |
| **prefix, as shipped** | 15.5 | **3.8** | **8.0** | — |

* **A cleaner dictionary alone doesn't help** (1.0–1.8 real words). The fragments come from the rule: any substring of any word merges, so word middles and endings ("nct", "lsh") stick together and never become words.
* **Prefix-only merging** builds words left to right. It **2.5×** the real words (3.8 vs 1.5) and slightly reduces fragments.
* With the vocabulary as the word list, every non-stopword it forms has an embedding, so it **carries into Discovery**.
* Prefix rules from the vocabulary build in ~12 ms, compared with downloading a 134 KB dictionary chunk.

## 4. Decision

* Letters mode builds prefix rules from the vocabulary plus stopwords (`src/game/letterRules.ts`, `semanticEngine.letterWords()`). The original dictionary stays as the fallback when the vocabulary fails to load, so the original game always works.
* Boxes that will carry into Discovery are outlined, and listed at the top-left ("Carries into Discovery: eat, tea").

## 5. Limitations

* Random letters still form mostly fragments (about 8 per 40 letters). Sprinkling is noisy by nature; picking letters from the top bar spells on purpose.
* The vocabulary includes names and foreign words ("shi", "fei", "das"), so some "real words" are not English dictionary words. They do have embeddings, and they carry.
* The profanity filter is off in local dev, so dev boards can form profanity. Production filters the word list (`policy.isAllowed`).
* `prefixCurrent` reads the original dictionary from the page's rules, which no longer exist once the vocabulary rules ship. Rerun it on a build with the fallback forced.

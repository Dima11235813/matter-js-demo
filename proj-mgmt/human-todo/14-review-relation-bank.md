# 14. Review the relation bank's everyday relations ☐

**Why**: since 2026-10-18 Discovery answers analogies from the relation bank first, and Guess deals its relations and accepts any of its analogies on the board (Epic 2 · Feature 2.17, [research](../../docs/research/analogy-recognition.md)). The agent wrote the 13 everyday relations (159 pairs). Your judgment on what counts as a "right" answer now shapes the game.

**Steps**:
1. Open [`data/vocab/relation-pairs.txt`](../../data/vocab/relation-pairs.txt). Everything after `gram7-past-tense` is new: antonyms, young animals, part → whole, tools of the trade, workplaces, animal sounds, colors, made of, kinds of things, synonyms, what it does, where it travels, season → weather.
2. Mark pairs to drop or change, and pairs to add, then tell the agent. The format is `x y` lines under a `: category` header; every word must be in the vocabulary.
3. Decide the known judgment calls:
   * **pilot → airport or cockpit?** It's the one known-good analogy still answered "wrong" (chef : kitchen :: pilot).
   * **synonyms:** keep them as a relation? Big : large :: small : little is a valid analogy, but their offsets are weak.
   * **sun → moon** sits in antonyms ("opposites in nature"), so that day : night :: sun gives moon. Is that fine?
4. Optional: allow measuring on BATS (40 relations, CC BY-NC 4.0)? It would be downloaded at test time and never committed (Epic 2 · Task 2.17.5).

**Unblocks**: Task 2.17.2's owner review; better answers for the relations you care about.

**Done when**: your changes are in the bank (the agent re-runs `analogyBankAnswers` and `guessAcceptance`, and the unit and e2e tests).

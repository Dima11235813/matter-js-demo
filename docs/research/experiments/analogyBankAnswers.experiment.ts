import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decodeVocabBinary, VocabManifest } from '../../../src/embeddings/vocabAsset';
import { VectorIndex } from '../../../src/embeddings/VectorIndex';
import { solveAnalogy } from '../../../src/embeddings/analogy';
import { parseRelationBank } from '../../../src/game/relationPairs';
import { solveWithBank } from '../../../src/game/relationAnswers';

/**
 * Before / after for Discovery's answers (docs/research/analogy-recognition.md §6, Epic 2 · Task 2.17.3): the
 * shipped bank-first solver vs 3CosAdd on the known-good analogies of analogy-scoring.md (written 2026-09-24,
 * before this work), split by where the answer came from. Overlap with the bank is reported, not hidden: for
 * pairs the bank holds, a right answer is by construction. Writes results/analogy-bank-answers.json.
 */
const ROOT = process.cwd();
const VOCAB = path.join(ROOT, 'public/vocab');
const manifest = JSON.parse(fs.readFileSync(path.join(VOCAB, 'vocab.json'), 'utf8')) as VocabManifest;
const bin = fs.readFileSync(path.join(VOCAB, 'vocab.bin'));
const index = VectorIndex.fromAsset(decodeVocabBinary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));
const bank = parseRelationBank(fs.readFileSync(path.join(ROOT, 'data/vocab/relation-pairs.txt'), 'utf8'));

// analogy-scoring.md's canonical set, verbatim (docs/research/experiments/analogyScoring.experiment.ts).
const CANONICAL: [string, string, string, string][] = [
  ['man', 'king', 'woman', 'queen'], ['man', 'father', 'woman', 'mother'], ['boy', 'girl', 'brother', 'sister'],
  ['husband', 'wife', 'uncle', 'aunt'], ['prince', 'princess', 'actor', 'actress'], ['son', 'daughter', 'nephew', 'niece'],
  ['france', 'paris', 'japan', 'tokyo'], ['france', 'paris', 'italy', 'rome'], ['germany', 'berlin', 'spain', 'madrid'],
  ['russia', 'moscow', 'england', 'london'], ['china', 'beijing', 'egypt', 'cairo'],
  ['good', 'better', 'bad', 'worse'], ['big', 'bigger', 'small', 'smaller'], ['fast', 'faster', 'slow', 'slower'],
  ['hot', 'cold', 'summer', 'winter'], ['day', 'night', 'sun', 'moon'], ['up', 'down', 'left', 'right'],
  ['dog', 'puppy', 'cat', 'kitten'], ['cow', 'calf', 'sheep', 'lamb'], ['horse', 'foal', 'cow', 'calf'],
  ['finger', 'hand', 'toe', 'foot'], ['doctor', 'hospital', 'teacher', 'school'], ['chef', 'kitchen', 'pilot', 'cockpit'],
  ['pen', 'write', 'knife', 'cut'], ['bird', 'fly', 'fish', 'swim'], ['eye', 'see', 'ear', 'hear'],
  ['banana', 'yellow', 'apple', 'red'], ['water', 'drink', 'food', 'eat'], ['walk', 'walked', 'run', 'ran'],
  ['japan', 'japanese', 'france', 'french'], ['car', 'road', 'train', 'track'], ['winter', 'snow', 'summer', 'sun'],
];

it('Discovery answers before (3CosAdd) and after (bank first) on the known-good set', () => {
  const rows = CANONICAL.filter(q => q.every(w => index.has(w))).map(([a, b, c, expected]) => {
    const before = solveAnalogy(index, a, b, c)?.answer;
    const after = solveWithBank(index, bank, a, b, c);
    return { question: `${a}:${b}::${c}`, expected, before, after: after?.answer, source: after?.source, category: after?.category, beforeRight: before === expected, afterRight: after?.answer === expected };
  });
  const bySource = Object.fromEntries((['bank', 'relation', 'model'] as const).map(s => {
    const r = rows.filter(x => x.source === s);
    return [s, { questions: r.length, beforeRight: r.filter(x => x.beforeRight).length, afterRight: r.filter(x => x.afterRight).length }];
  }));
  const result = {
    questions: rows.length,
    before: rows.filter(r => r.beforeRight).length,
    after: rows.filter(r => r.afterRight).length,
    bySource,
    changed: rows.filter(r => r.before !== r.after),
    rows,
  };
  fs.writeFileSync(path.join(ROOT, 'docs/research/experiments/results/analogy-bank-answers.json'), JSON.stringify(result, null, 2) + '\n');
});

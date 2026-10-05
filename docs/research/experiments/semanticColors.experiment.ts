import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decodeVocabBinary, VocabManifest } from '../../../src/embeddings/vocabAsset';
import { VectorIndex } from '../../../src/embeddings/VectorIndex';
import { defaultGroupThreshold, similarityGroups, similarityMatrix } from '../../../src/physics/orbitalForces';
import { spearman } from '../../../src/physics/layoutMetrics';
import { deltaE, hueDistance, oklchToHex, semanticColors } from '../../../src/theme/semanticColors';
import { contrastRatio, readableTextColor } from '../../../src/utils/colorUtils';
import { pcaScores } from './linalg';

/**
 * Color hint mode (docs/research/semantic-colors.md, Epic 5 · Task 5.17.1): which hue mapping makes
 * color distance mirror meaning? Compares random colors, PCA-angle hues, and the group-first palette
 * on the real vocabulary. Deterministic; writes results/semantic-colors.json.
 */
const ROOT = process.cwd();
const VOCAB = path.join(ROOT, 'public/vocab');
const manifest = JSON.parse(fs.readFileSync(path.join(VOCAB, 'vocab.json'), 'utf8')) as VocabManifest;
const bin = fs.readFileSync(path.join(VOCAB, 'vocab.bin'));
const index = VectorIndex.fromAsset(decodeVocabBinary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));
const threshold = defaultGroupThreshold(manifest.calibration);
const profane = new Set(manifest.profane.map(i => manifest.words[i]));

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0xffffffff; };
}
function randomBoard(seed: number, size = 30): string[] {
  const next = lcg(seed);
  const out = new Set<string>();
  while (out.size < size) { const w = index.baseWordAt(Math.floor(next() * 3000)); if (!profane.has(w)) out.add(w); }
  return [...out];
}
const BOARDS: Record<string, string[]> = {
  families15: ['dog', 'puppy', 'cat', 'kitten', 'king', 'queen', 'prince', 'ocean', 'sea', 'wave', 'doctor', 'nurse', 'hospital', 'guitar', 'piano'],
  dense24: ['dog', 'puppy', 'cat', 'kitten', 'wolf', 'fox', 'king', 'queen', 'prince', 'princess', 'castle', 'crown', 'ocean', 'sea', 'wave', 'beach', 'doctor', 'nurse', 'hospital', 'medicine', 'guitar', 'piano', 'drum', 'song'],
  random30a: randomBoard(11),
  random30b: randomBoard(22),
};
const ADDITIONS: Record<string, string> = { families15: 'lion', dense24: 'harp', random30a: 'river', random30b: 'teacher' };

type Mapping = (words: string[], previous?: Map<string, number>) => { hex: string; hue: number }[];

const vectorsOf = (words: string[]) => words.map(w => index.getVector(w)!);
const mappings: Record<string, Mapping> = {
  random: words => {
    const next = lcg(words.join().length * 7919);
    return words.map(() => { const hue = next() * 360; return { hue, hex: oklchToHex(0.72, 0.13, hue) }; });
  },
  pcaAngle: words => {
    const { coords } = pcaScores(vectorsOf(words), 2);
    return coords.map(([x, y]) => { const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360; return { hue, hex: oklchToHex(0.72, 0.13, hue) }; });
  },
  groupFirst: (words, previous) => {
    const vectors = vectorsOf(words);
    const sims = similarityMatrix(vectors);
    return semanticColors({ words, sims, groups: similarityGroups(sims, words.length, threshold), previous });
  },
};

function measure(name: string, words: string[], mapping: Mapping) {
  const sims = similarityMatrix(vectorsOf(words));
  const groups = similarityGroups(sims, words.length, threshold);
  const colors = mapping(words);
  const n = words.length;
  const dE: number[] = [], s: number[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { dE.push(deltaE(colors[i].hex, colors[j].hex)); s.push(sims[i * n + j]); }
  // Separation between multi-word groups: smallest hue gap between their members' mean hues.
  const multi = [...new Set(groups)].filter(g => groups.filter(x => x === g).length > 1);
  const groupHue = (g: number) => {
    const hs = groups.map((x, i) => (x === g ? colors[i].hue : NaN)).filter(h => !Number.isNaN(h));
    const [sx, sy] = hs.reduce(([a, b], h) => [a + Math.cos((h * Math.PI) / 180), b + Math.sin((h * Math.PI) / 180)], [0, 0]);
    return (Math.atan2(sy, sx) * 180) / Math.PI;
  };
  let minGroupGap = Infinity;
  for (let a = 0; a < multi.length; a++) for (let b = a + 1; b < multi.length; b++) minGroupGap = Math.min(minGroupGap, hueDistance(groupHue(multi[a]), groupHue(multi[b])));
  // Stability: add one word; the largest color change on words already on the board.
  const added = [...words, ADDITIONS[name]];
  const previous = new Map(words.map((w, i) => [w, colors[i].hue]));
  const after = mapping(added, previous);
  const maxShift = Math.max(...words.map((_, i) => deltaE(colors[i].hex, after[i].hex)));
  const minContrast = Math.min(...colors.map(c => contrastRatio(c.hex, readableTextColor(c.hex))));
  return {
    spearman: +spearman(dE, s).toFixed(3),
    groups: [...new Set(groups)].length,
    multiWordGroups: multi.length,
    minGroupHueGap: Number.isFinite(minGroupGap) ? +minGroupGap.toFixed(1) : null,
    maxShiftOnAdd: +maxShift.toFixed(1),
    minContrast: +minContrast.toFixed(2),
  };
}

it('semantic colors: random vs PCA angle vs group-first palette', () => {
  const results: Record<string, Record<string, ReturnType<typeof measure>>> = {};
  for (const [mappingName, mapping] of Object.entries(mappings)) {
    results[mappingName] = {};
    for (const [board, words] of Object.entries(BOARDS)) results[mappingName][board] = measure(board, words, mapping);
  }
  console.table(Object.fromEntries(Object.entries(results).flatMap(([m, boards]) => Object.entries(boards).map(([b, r]) => [`${m} · ${b}`, r]))));
  fs.writeFileSync(path.join(ROOT, 'docs/research/experiments/results/semantic-colors.json'), JSON.stringify({ threshold, results }, null, 2));
}, 120_000);

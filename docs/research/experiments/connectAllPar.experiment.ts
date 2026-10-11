import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decodeVocabBinary, VocabManifest } from '../../../src/embeddings/vocabAsset';
import { VectorIndex } from '../../../src/embeddings/VectorIndex';
import { BASE_RULES, ConnectNode, solveBeam, solveGreedy } from '../../../src/game/connectAll';
import { bandOf, generatePuzzle, PuzzleTemplate, SimColumns } from '../../../src/game/connectPuzzles';

/**
 * Connect-All par and templates (docs/research/connect-all-balance.md §6, Epic 2 · Tasks 2.10.2, 2.10.4).
 * For each candidate template: how often its puzzles are solvable, greedy vs beam-search par, the bands
 * beam par puts them in, and the time to make one puzzle. Deterministic; writes results/connect-all-par.json.
 */
const ROOT = process.cwd();
const VOCAB = path.join(ROOT, 'public/vocab');
const manifest = JSON.parse(fs.readFileSync(path.join(VOCAB, 'vocab.json'), 'utf8')) as VocabManifest;
const bin = fs.readFileSync(path.join(VOCAB, 'vocab.bin'));
const index = VectorIndex.fromAsset(decodeVocabBinary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));
const profane = new Set(manifest.profane.map(i => manifest.words[i]));
const rules = { ...BASE_RULES, link: manifest.calibration.p99 };
const SEEDS = Number(process.env.CONNECT_SEEDS ?? 40);
const MAX_MOVES = 15;

const candidates: ConnectNode[] = [];
for (let rank = 0; rank < Math.min(8000, index.baseSize); rank++) {
  const word = index.baseWordAt(rank);
  if (/^[a-z]{3,}$/.test(word) && !profane.has(word)) candidates.push({ word, vector: index.getVector(word)!, rank });
}

const TEMPLATES: PuzzleTemplate[] = [
  // The shipped five (2026-10-04).
  { pairs: 3, loose: 0 }, { pairs: 3, loose: 1 }, { pairs: 2, loose: 2 }, { pairs: 3, loose: 2 }, { pairs: 2, loose: 4 },
  // Candidates for the hard band: more loose words, each needing its own bridges.
  { pairs: 1, loose: 4 }, { pairs: 2, loose: 5 }, { pairs: 1, loose: 6 }, { pairs: 0, loose: 5 }, { pairs: 0, loose: 6 }, { pairs: 3, loose: 4 },
];

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

it('Connect-All: greedy vs beam par, and the bands each template produces', () => {
  const rows = TEMPLATES.map(template => {
    const results = Array.from({ length: SEEDS }, (_, k) => {
      const seed = 5000 + k;
      const words = generatePuzzle(seed, candidates, rules.link, template);
      const columns = new SimColumns(candidates);
      const sims = (c: number, board: readonly ConnectNode[]) => columns.row(c, board);
      const t0 = performance.now();
      const greedy = solveGreedy(words, candidates, rules, sims, MAX_MOVES);
      const t1 = performance.now();
      // A fresh cache, so the timing includes the similarity columns (as in the game, where makePuzzle runs alone).
      const beamColumns = new SimColumns(candidates);
      const beam = solveBeam(words, candidates, rules, (c, board) => beamColumns.row(c, board), { maxMoves: MAX_MOVES });
      const t2 = performance.now();
      // The shipped call (makePuzzle): beam with the candidate pool, from a fresh cache.
      const pooledColumns = new SimColumns(candidates);
      const pooled = solveBeam(words, candidates, rules, (c, board) => pooledColumns.row(c, board), { maxMoves: MAX_MOVES, pool: needy => pooledColumns.linked(needy, rules.link) });
      const t3 = performance.now();
      return {
        greedy: greedy.solved ? greedy.moves.length : null, beam: beam.solved ? beam.moves.length : null,
        greedyMs: t1 - t0, beamMs: t2 - t1, pooledMs: t3 - t2, pooledSame: JSON.stringify(pooled) === JSON.stringify(beam),
      };
    });
    const solvedBeam = results.filter(r => r.beam !== null);
    const both = results.filter(r => r.greedy !== null && r.beam !== null);
    const bands = { easy: 0, medium: 0, hard: 0 };
    solvedBeam.forEach(r => bands[bandOf(r.beam!)]++);
    const row = {
      template: `${template.pairs}+${template.loose}`,
      solvable: { greedy: results.filter(r => r.greedy !== null).length, beam: solvedBeam.length, of: SEEDS },
      meanPar: { greedy: +mean(both.map(r => r.greedy!)).toFixed(2), beam: +mean(both.map(r => r.beam!)).toFixed(2) },
      beamShorter: both.filter(r => r.beam! < r.greedy!).length,
      bands,
      ms: {
        greedy: Math.round(mean(results.map(r => r.greedyMs))), beam: Math.round(mean(results.map(r => r.beamMs))), beamMax: Math.round(Math.max(...results.map(r => r.beamMs))),
        pooled: Math.round(mean(results.map(r => r.pooledMs))), pooledMax: Math.round(Math.max(...results.map(r => r.pooledMs))),
      },
      pooledSame: results.filter(r => r.pooledSame).length,
    };
    console.log(JSON.stringify(row));
    return row;
  });
  fs.writeFileSync(path.join(ROOT, 'docs/research/experiments/results/connect-all-par.json'), JSON.stringify({ p99: rules.link, seeds: SEEDS, maxMoves: MAX_MOVES, candidates: candidates.length, rows }, null, 2) + '\n');
}, 3_600_000);

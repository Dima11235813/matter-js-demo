#!/usr/bin/env node
/**
 * Builds the base embedding vocabulary for Lexical Fountain.
 *
 *   node scripts/build-vocab.mjs [--max 20000] [--if-missing]
 *
 * Outputs (served statically by Vite and later precached by the PWA):
 *   public/vocab/vocab.json  manifest: model, dims, word list, centering mean, calibration
 *   public/vocab/vocab.bin   Float32 per-row scales [count] followed by Int8 vectors [count * dim]
 *
 * Why centering: MiniLM word vectors share a large common direction, so two unrelated words
 * already score ~0.24 cosine. Subtracting the vocabulary mean moves "unrelated" to ~0 and makes
 * thresholds meaningful. The same mean is applied at runtime to out-of-vocabulary words.
 *
 * Why calibration: similarity thresholds are expressed as percentiles of random word pairs
 * ("more related than 95% of pairs") instead of raw cosine values that drift per model.
 */
import { pipeline } from '@huggingface/transformers';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MODEL = 'Xenova/all-MiniLM-L6-v2';
const DTYPE = 'q8';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const OUT_DIR = path.join(ROOT, 'public', 'vocab');
const DICT_DIR = path.join(ROOT, 'src', 'utils', 'Dictionary');
const CALIBRATION_PAIRS = 50000;
const PERCENTILES = [1, 5, 10, 25, 50, 75, 90, 95, 99];

// Shared with text import in the app (src/game/keywords.ts).
const STOPWORDS = new Set(readListFile(path.join(ROOT, 'data', 'vocab', 'stopwords.txt')));

// Words ending in "s" that are not plurals of another vocabulary word.
const PLURAL_EXCEPTIONS = new Set(['news', 'lens', 'yes', 'plus', 'bias', 'series', 'species', 'physics', 'mathematics', 'glass', 'class', 'gas', 'bus', 'boss', 'loss', 'mass', 'grass', 'dress']);

function parseArgs(argv) {
    const args = { max: 20000, ifMissing: false };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--max') args.max = Number(argv[++i]);
        if (argv[i] === '--if-missing') args.ifMissing = true;
    }
    return args;
}

function readListFile(file) {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith('#'));
}

function readDictKeys(file) {
    const src = fs.readFileSync(file, 'utf8');
    return [...src.matchAll(/^\s*['"]?([^'":\s]+)['"]?\s*:/gm)].map(m => m[1].toLowerCase());
}

/** "word count" lines, already sorted by descending frequency. */
function readFrequencyList(file) {
    return readListFile(file).map(line => line.split(/\s+/)[0]);
}

/**
 * Frequency-ordered candidates: OpenSubtitles (conversational, 50k) sets the rank,
 * the Google web list and legacy dictionaries fill in written vocabulary it misses.
 */
function collectCandidates() {
    const ordered = [
        ...readFrequencyList(path.join(ROOT, 'data', 'vocab', 'sources', 'opensubtitles-en-50k.txt')),
        ...readDictKeys(path.join(DICT_DIR, 'googleMostCommonDict.js')),
        ...readDictKeys(path.join(DICT_DIR, 'combinationOfAllDict.js')),
        ...readDictKeys(path.join(DICT_DIR, 'scribdDict.js')),
        ...readListFile(path.join(ROOT, 'src', 'mitDict.txt')),
    ];
    return [...new Set(ordered)];
}

function isPluralOfPresent(word, present) {
    if (PLURAL_EXCEPTIONS.has(word) || !word.endsWith('s')) return false;
    if (word.endsWith('ies') && present.has(word.slice(0, -3) + 'y')) return true;
    if (word.endsWith('es') && present.has(word.slice(0, -2))) return true;
    return present.has(word.slice(0, -1));
}

function selectVocabulary(max) {
    const seeds = readListFile(path.join(ROOT, 'data', 'vocab', 'seed-words.txt'));
    const blocklist = new Set(readListFile(path.join(ROOT, 'data', 'vocab', 'blocklist.txt')));
    const english = new Set(readDictKeys(path.join(DICT_DIR, 'Dict3.ts')));
    const seedSet = new Set(seeds);

    const filtered = collectCandidates().filter(w =>
        /^[a-z]{3,20}$/.test(w) && !STOPWORDS.has(w) && !blocklist.has(w) && (english.has(w) || seedSet.has(w)));
    const present = new Set(filtered);
    const singular = filtered.filter(w => seedSet.has(w) || !isPluralOfPresent(w, present));

    const words = singular.slice(0, max);
    const included = new Set(words);
    for (const seed of seeds) if (!included.has(seed)) { words.push(seed); included.add(seed); }
    return words;
}

/**
 * One word per call, never batched: the q8 model quantizes activations dynamically over the whole
 * input tensor, so a batched word's vector depends on its batch-mates (cos ~0.985 vs. single).
 * The browser always encodes a single word, and the two must land in exactly the same space.
 */
async function embedAll(words) {
    const extractor = await pipeline('feature-extraction', MODEL, { dtype: DTYPE });
    const dim = 384;
    const out = new Float32Array(words.length * dim);
    for (let i = 0; i < words.length; i++) {
        const tensor = await extractor(words[i], { pooling: 'mean', normalize: true });
        out.set(tensor.data, i * dim);
        if (i % 1000 === 999 || i === words.length - 1) console.log(`  embedded ${i + 1}/${words.length}`);
    }
    return { vectors: out, dim };
}

function computeMean(vectors, count, dim) {
    const mean = new Float64Array(dim);
    for (let i = 0; i < count; i++) for (let d = 0; d < dim; d++) mean[d] += vectors[i * dim + d];
    return Array.from(mean, v => v / count);
}

/** Centers, renormalizes, and quantizes every row to int8 with a per-row scale. */
function centerAndQuantize(vectors, count, dim, mean) {
    const scales = new Float32Array(count);
    const quantized = new Int8Array(count * dim);
    const dequantized = new Float32Array(count * dim);
    const row = new Float32Array(dim);
    for (let i = 0; i < count; i++) {
        let norm = 0;
        for (let d = 0; d < dim; d++) { row[d] = vectors[i * dim + d] - mean[d]; norm += row[d] * row[d]; }
        norm = Math.sqrt(norm) || 1;
        let maxAbs = 0;
        for (let d = 0; d < dim; d++) { row[d] /= norm; maxAbs = Math.max(maxAbs, Math.abs(row[d])); }
        const scale = maxAbs / 127 || 1;
        scales[i] = scale;
        for (let d = 0; d < dim; d++) {
            const q = Math.round(row[d] / scale);
            quantized[i * dim + d] = q;
            dequantized[i * dim + d] = q * scale;
        }
    }
    return { scales, quantized, dequantized };
}

/** Deterministic PRNG so calibration is reproducible across builds. */
function mulberry32(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function calibrate(vectors, count, dim) {
    const rand = mulberry32(42);
    const sims = [];
    while (sims.length < CALIBRATION_PAIRS) {
        const a = Math.floor(rand() * count), b = Math.floor(rand() * count);
        if (a === b) continue;
        let dot = 0;
        for (let d = 0; d < dim; d++) dot += vectors[a * dim + d] * vectors[b * dim + d];
        sims.push(dot);
    }
    sims.sort((x, y) => x - y);
    const percentiles = {};
    for (const p of PERCENTILES) percentiles[`p${p}`] = Number(sims[Math.floor((p / 100) * (sims.length - 1))].toFixed(4));
    return percentiles;
}

function loadProfanity() {
    return new Set([
        ...readDictKeys(path.join(DICT_DIR, 'corporaExplitives.js')),
        ...readListFile(path.join(ROOT, 'data', 'vocab', 'profanity-extra.txt')),
    ]);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const manifestPath = path.join(OUT_DIR, 'vocab.json');
    if (args.ifMissing && fs.existsSync(manifestPath) && fs.existsSync(path.join(OUT_DIR, 'vocab.bin'))) {
        console.log('[vocab] present, skipping build (delete public/vocab to rebuild)');
        return;
    }

    const words = selectVocabulary(args.max);
    console.log(`[vocab] ${words.length} words selected, embedding with ${MODEL} (${DTYPE})`);
    const { vectors, dim } = await embedAll(words);
    const mean = computeMean(vectors, words.length, dim);
    const { scales, quantized, dequantized } = centerAndQuantize(vectors, words.length, dim, mean);
    const profanitySet = loadProfanity();

    const bin = Buffer.concat([Buffer.from(scales.buffer), Buffer.from(quantized.buffer)]);
    // Content hash: changes whenever words or vectors change, so stored analogies can tell which space produced them.
    const version = createHash('sha256').update(`${MODEL}|${DTYPE}|${words.join(',')}|`).update(bin).digest('hex').slice(0, 12);
    const manifest = {
        schema: 1,
        version,
        model: MODEL,
        dtype: DTYPE,
        dim,
        count: words.length,
        builtAt: new Date().toISOString(),
        layout: { scalesOffset: 0, vectorsOffset: words.length * 4 },
        calibration: calibrate(dequantized, words.length, dim),
        mean: mean.map(v => Number(v.toFixed(6))),
        profane: words.flatMap((w, i) => (profanitySet.has(w) ? [i] : [])),
        words,
    };

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'vocab.bin'), bin);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    console.log(`[vocab] v${version}: ${words.length} words, ${(bin.length / 1e6).toFixed(1)} MB bin, ${manifest.profane.length} flagged profane`);
    console.log('[vocab] calibration', manifest.calibration);
}

main().catch(err => { console.error(err); process.exit(1); });

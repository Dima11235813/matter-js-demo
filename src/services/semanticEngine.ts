import { AnalogyResult, solveAnalogy } from "../embeddings/analogy";
import { Calibration } from "../embeddings/calibration";
import { LiveEncoder } from "../embeddings/liveEncoder";
import { createProfanityPolicy, isProfanityFilterEnabled, ProfanityPolicy } from "../embeddings/profanity";
import { centerAndNormalize, Vector } from "../embeddings/vectorMath";
import { Neighbor, VectorIndex } from "../embeddings/VectorIndex";
import { fetchVocabAsset, VocabManifest } from "../embeddings/vocabAsset";
import { AnalogyRecord, GameRecord, openLexicalDb } from "../persistence/db";
import { GameResult, LexicalRepository } from "../persistence/LexicalRepository";
import { dealWords } from "../game/dealer";
import { analogyPoints } from "../game/timedGame";
import { logger } from "../utils/logger";

export type AddWordOutcome =
    | { status: "added" | "known"; word: string }
    | { status: "invalid" | "blocked" | "failed"; word: string; reason: string };

export interface AnalogyPlay {
    result: AnalogyResult;
    record: AnalogyRecord;
    points: number;
    isNewQuestion: boolean;
    score: number;
}

export interface CorpusStats {
    vocabVersion: string;
    baseWords: number;
    playerWords: number;
    analogies: number;
    score: number;
    profanityFilter: boolean;
}

const WORD_PATTERN = /^[a-z]{2,24}$/;
const NEW_QUESTION_BONUS = 25;

interface Loaded {
    manifest: VocabManifest;
    index: VectorIndex;
    policy: ProfanityPolicy;
    encoder: LiveEncoder;
    repo: LexicalRepository;
}

/**
 * Application service for the embedding playground: owns the vector index, the live encoder for
 * new words, and the local repository. UI and physics code talk to this, never to the parts.
 */
export class SemanticEngine {
    private loaded: Loaded | undefined;
    private startPromise: Promise<void> | undefined;

    constructor(private readonly vocabBaseUrl: string, private readonly dbName?: string) {}

    get isReady(): boolean {
        return this.loaded !== undefined;
    }

    /** Idempotent; every caller awaits the same load. */
    start(): Promise<void> {
        if (!this.startPromise) {
            this.startPromise = this.load().catch(error => {
                this.startPromise = undefined;
                throw error;
            });
        }
        return this.startPromise;
    }

    get calibration(): Calibration {
        return this.require().manifest.calibration;
    }

    /** Synchronous lookup for physics code; undefined until ready or for unknown words. */
    lookup(word: string): Vector | undefined {
        return this.loaded?.index.getVector(normalizeWord(word));
    }

    isAllowed(word: string): boolean {
        return this.loaded ? this.loaded.policy.isAllowed(word) : true;
    }

    /** Random allowed words drawn from the `maxRank` most frequent base words. */
    randomWords(count: number, maxRank = 4000): string[] {
        const { index, policy } = this.require();
        const limit = Math.min(maxRank, index.baseSize);
        const out: string[] = [];
        for (let guard = 0; out.length < count && guard < count * 50; guard++) {
            const word = index.baseWordAt(Math.floor(Math.random() * limit));
            if (policy.isAllowed(word) && !out.includes(word)) out.push(word);
        }
        return out;
    }

    /** Related word pairs for a game hand; see game/dealer.ts. */
    dealWords(count: number, inPlay: Iterable<string>): string[] {
        const { index, policy, manifest } = this.require();
        return dealWords(index, { count, inPlay, allow: policy.isAllowed, partnerThreshold: manifest.calibration.p99 });
    }

    /** Frequency rank for orbit ordering; player words rank after every base word. */
    rankOf(word: string): number {
        return this.loaded?.index.rankOf(normalizeWord(word)) ?? Number.POSITIVE_INFINITY;
    }

    get hintMode(): boolean {
        return this.loaded ? this.loaded.repo.hintMode : true;
    }

    setHintMode(hintMode: boolean): Promise<void> {
        return this.require().repo.setHintMode(hintMode);
    }

    get dimension(): "2d" | "3d" {
        return this.loaded ? this.loaded.repo.dimension : "2d";
    }

    setDimension(dimension: "2d" | "3d"): Promise<void> {
        return this.require().repo.setDimension(dimension);
    }

    saveGame(result: GameResult): Promise<GameRecord> {
        return this.require().repo.saveGame(result);
    }

    bestGameScore(): Promise<number> {
        return this.require().repo.bestGameScore();
    }

    neighbors(word: string, k = 8): Neighbor[] {
        const { index, policy } = this.require();
        const vector = index.getVector(normalizeWord(word));
        if (!vector) return [];
        return index.nearest(vector, { k, exclude: new Set([normalizeWord(word)]), allow: policy.isAllowed });
    }

    /** Validates, embeds, persists, and indexes a player-supplied word. */
    async addWord(input: string): Promise<AddWordOutcome> {
        const { index, policy, encoder, repo, manifest } = this.require();
        const word = normalizeWord(input);
        if (!WORD_PATTERN.test(word)) return { status: "invalid", word, reason: "Use 2-24 letters a-z" };
        if (!policy.isAllowed(word)) return { status: "blocked", word, reason: "Blocked by profanity filter" };
        if (index.has(word)) return { status: "known", word };
        try {
            const raw = await encoder.encode(word);
            await repo.savePlayerWord(word, raw, manifest.model, manifest.dtype);
            index.addWord(word, centerAndNormalize(raw, manifest.mean));
            return { status: "added", word };
        } catch (error) {
            logger.error("Failed to add word", word, error);
            return { status: "failed", word, reason: "Could not load the embedding model" };
        }
    }

    /** Solves, scores, and records "a is to b as c is to ?". */
    async playAnalogy(a: string, b: string, c: string): Promise<AnalogyPlay | undefined> {
        const { index, policy, repo, manifest } = this.require();
        const result = solveAnalogy(index, normalizeWord(a), normalizeWord(b), normalizeWord(c), policy.isAllowed);
        if (!result) return undefined;
        const record = await repo.recordAnalogy(result, manifest.version);
        const isNewQuestion = record.timesPlayed === 1;
        const points = analogyPoints(result.similarity) + (isNewQuestion ? NEW_QUESTION_BONUS : 0);
        const score = await repo.addScore(points);
        return { result, record, points, isNewQuestion, score };
    }

    recentAnalogies(limit = 5): Promise<AnalogyRecord[]> {
        return this.require().repo.recentAnalogies(limit);
    }

    async stats(): Promise<CorpusStats> {
        const { index, repo, manifest, policy } = this.require();
        return {
            vocabVersion: manifest.version,
            baseWords: index.baseSize,
            playerWords: index.extraSize,
            analogies: await repo.countAnalogies(),
            score: repo.score,
            profanityFilter: policy.enabled,
        };
    }

    private async load(): Promise<void> {
        const [asset, db] = await Promise.all([fetchVocabAsset(this.vocabBaseUrl), openLexicalDb(this.dbName)]);
        const { manifest } = asset;
        const index = VectorIndex.fromAsset(asset);
        const policy = createProfanityPolicy(isProfanityFilterEnabled(), manifest.profane.map(i => manifest.words[i]));
        const repo = await LexicalRepository.open(db);

        for (const record of await repo.listPlayerWords()) {
            if (record.model !== manifest.model || record.dtype !== manifest.dtype) {
                logger.warn(`Skipping player word "${record.word}" embedded with ${record.model}/${record.dtype}`);
                continue;
            }
            if (!index.isBaseWord(record.word)) index.addWord(record.word, centerAndNormalize(record.vector, manifest.mean));
        }
        this.loaded = { manifest, index, policy, encoder: new LiveEncoder(manifest.model, manifest.dtype), repo };
        logger.log(`Semantic engine ready: vocab ${manifest.version}, ${index.baseSize} base + ${index.extraSize} player words`);
    }

    private require(): Loaded {
        if (!this.loaded) throw new Error("SemanticEngine used before start() resolved");
        return this.loaded;
    }
}

export function normalizeWord(word: string): string {
    return word.trim().toLowerCase();
}

export const semanticEngine = new SemanticEngine(`${import.meta.env.BASE_URL}vocab/`);

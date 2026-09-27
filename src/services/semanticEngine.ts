import { AnalogyResult, solveAnalogy, solveExpression } from "../embeddings/analogy";
import { Calibration } from "../embeddings/calibration";
import { LiveEncoder } from "../embeddings/liveEncoder";
import { createProfanityPolicy, isProfanityFilterEnabled, parseWordList, ProfanityPolicy } from "../embeddings/profanity";
import { centerAndNormalize, dot, Vector } from "../embeddings/vectorMath";
import { normalizeKey } from "../persistence/keys";
import { Neighbor, VectorIndex } from "../embeddings/VectorIndex";
import { fetchVocabAsset, VocabManifest } from "../embeddings/vocabAsset";
import { AnalogyRecord, GameRecord, MetaRecord, openLexicalDb, PlayContext, PlayEventType } from "../persistence/db";
import { GameResult, LexicalRepository, LocalDataExport } from "../persistence/LexicalRepository";
import type { PrivacySnapshot } from "../stores/PrivacyStore";
import type { SyncPort } from "../account/syncService";
import { activeAccount, clearAdoption, dbNameFor, GUEST_DB_NAME, pendingAdoption } from "../account/profiles";
import { dealWords } from "../game/dealer";
import { analogyPoints } from "../game/timedGame";
import { extractKeywords, KeywordResult } from "../game/keywords";
import { expressionAsAnalogy, ExpressionTerm } from "../game/wordEntry";
import stopwordsText from "../../data/vocab/stopwords.txt?raw";
import relationPairsText from "../../data/vocab/relation-pairs.txt?raw";
import { dealRelationPairs, DealRelationOptions, parseRelationBank, RelationBank, RelationDeal } from "../game/relationPairs";
import { RelationStats } from "../game/relationHint";
import { playLogExport, PlayLogExport, summarizePlayLog, PlayLogSummary } from "../game/playLog";
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

/** What an expression evaluates to, without recording anything (live preview and submit). */
export type ExpressionOutcome =
    | { kind: "analogy"; result: AnalogyResult }
    | { kind: "sum"; neighbors: Neighbor[] }
    | { kind: "unknown"; words: string[] }
    | { kind: "blocked"; words: string[] }
    | { kind: "none" };

const WORD_PATTERN = /^[a-z]{2,24}$/;
const STOPWORDS: ReadonlySet<string> = new Set(parseWordList(stopwordsText));
const RELATION_BANK: RelationBank = parseRelationBank(relationPairsText);
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
    /** Groups this page load's plays in the play log without identifying the player. */
    readonly sessionId = crypto.randomUUID();

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

    /**
     * Evaluates `b - a + c` as the analogy a : b :: c (same solver as clicking three words) and any
     * other signed sum as "nearest to the sum". Words the vocabulary lacks come back as "unknown" so
     * the caller can embed them first.
     */
    evaluateExpression(terms: readonly ExpressionTerm[]): ExpressionOutcome {
        const { index, policy } = this.require();
        const blocked = terms.map(t => t.word).filter(w => !policy.isAllowed(w));
        if (blocked.length > 0) return { kind: "blocked", words: blocked };
        const unknown = terms.map(t => t.word).filter(w => !index.has(w));
        if (unknown.length > 0) return { kind: "unknown", words: unknown };
        const analogy = expressionAsAnalogy(terms);
        if (analogy) {
            const result = solveAnalogy(index, analogy.a, analogy.b, analogy.c, policy.isAllowed);
            return result ? { kind: "analogy", result } : { kind: "none" };
        }
        const neighbors = solveExpression(index, terms, policy.isAllowed);
        return neighbors && neighbors.length > 0 ? { kind: "sum", neighbors } : { kind: "none" };
    }

    /** Relation pairs for a timed round (designed questions); only words the index knows and allows. */
    dealRelationPairs(options: Omit<DealRelationOptions, "allow">): RelationDeal {
        const { index, policy } = this.require();
        return dealRelationPairs(RELATION_BANK, { ...options, allow: w => index.has(w) && policy.isAllowed(w) });
    }

    /** Similarities behind the relation hint and designed-play penalty (game/relationHint.ts). */
    relationStats(a: string, b: string, c: string, d: string): RelationStats | undefined {
        const { index } = this.require();
        const [va, vb, vc, vd] = [a, b, c, d].map(w => index.getVector(normalizeWord(w)));
        if (!va || !vb || !vc || !vd) return undefined;
        let offset = 0, n1 = 0, n2 = 0;
        for (let i = 0; i < va.length; i++) {
            const r = vb[i] - va[i], s = vd[i] - vc[i];
            offset += r * s; n1 += r * r; n2 += s * s;
        }
        return { ab: dot(va, vb), dc: dot(vd, vc), da: dot(vd, va), db: dot(vd, vb), offset: n1 && n2 ? offset / Math.sqrt(n1 * n2) : 0 };
    }

    /** Keywords of a pasted text, best first (see game/keywords.ts). */
    keywords(text: string): KeywordResult {
        const { index, policy } = this.require();
        return extractKeywords(text, {
            rankOf: word => index.rankOf(word),
            has: word => index.has(word),
            isAllowed: policy.isAllowed,
            stopwords: STOPWORDS,
            size: index.baseSize,
        });
    }

    /** Appends to the local play log (research telemetry; never leaves the device yet). */
    async logPlay(type: PlayEventType, context: PlayContext, payload: Record<string, unknown>): Promise<void> {
        const { repo, manifest } = this.require();
        try {
            await repo.logPlayEvent({ type, sessionId: this.sessionId, vocabVersion: manifest.version, context, payload });
        } catch (error) {
            logger.warn("Could not record play", error);
        }
    }

    /** Local storage as the sync service needs it (Epic 3 · Feature 3.8). */
    syncPort(): SyncPort {
        const { repo } = this.require();
        return {
            get deviceId() { return repo.deviceId; },
            get deviceSecret() { return repo.deviceSecret; },
            get accountUid() { return repo.accountUid; },
            get syncCursor() { return repo.syncCursor; },
            setAccount: changes => repo.updateMeta(changes),
            pendingSyncRecords: () => repo.pendingSyncRecords(),
            markSynced: record => repo.markSynced(record),
            applyRemote: record => repo.applyRemote(record),
        };
    }

    /** After a sync: index player words that arrived from other devices (same model only). */
    async indexSyncedWords(): Promise<number> {
        const { index, repo, manifest } = this.require();
        let added = 0;
        for (const record of await repo.listPlayerWords()) {
            if (record.model !== manifest.model || record.dtype !== manifest.dtype || index.has(record.word)) continue;
            index.addWord(record.word, centerAndNormalize(record.vector, manifest.mean));
            added++;
        }
        return added;
    }

    privacyState(): PrivacySnapshot {
        const { repo } = this.require();
        return { consent: repo.consent, ageBand: repo.ageBand, ageAnsweredAt: repo.ageAnsweredAt, consentPromptDismissedAt: repo.consentPromptDismissedAt };
    }

    updatePrivacy(changes: Partial<Omit<MetaRecord, "id" | "deviceSecret">>): Promise<void> {
        return this.require().repo.updateMeta(changes);
    }

    exportAllData(): Promise<LocalDataExport> {
        return this.require().repo.exportAll();
    }

    eraseDevice(): Promise<void> {
        return this.require().repo.eraseAll();
    }

    async playLogSummary(): Promise<PlayLogSummary> {
        return summarizePlayLog(await this.require().repo.listPlayEvents());
    }

    async exportPlayLog(): Promise<PlayLogExport> {
        return playLogExport(await this.require().repo.listPlayEvents());
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
        // Each account on this device has its own database (Epic 6 · Feature 6.7); tests pass dbName directly.
        const account = this.dbName ? undefined : activeAccount();
        const [asset, db] = await Promise.all([fetchVocabAsset(this.vocabBaseUrl), openLexicalDb(this.dbName ?? dbNameFor(account))]);
        const { manifest } = asset;
        const index = VectorIndex.fromAsset(asset);
        const policy = createProfanityPolicy(isProfanityFilterEnabled(), manifest.profane.map(i => manifest.words[i]));
        const repo = await LexicalRepository.open(db);
        if (account && pendingAdoption() === account) await this.adoptGuestProgress(repo);

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

    /** The first account signed in on a device takes over the guest's progress (the guest keeps its copy). */
    private async adoptGuestProgress(repo: LexicalRepository): Promise<void> {
        const guestDb = await openLexicalDb(GUEST_DB_NAME);
        try {
            const guest = await LexicalRepository.open(guestDb);
            const records = await guest.allSyncRecords();
            for (const record of records) await repo.adoptRecord(record);
            logger.log(`Adopted ${records.length} guest records into the signed-in account`);
        } finally {
            guestDb.close();
            clearAdoption();
        }
    }

    private require(): Loaded {
        if (!this.loaded) throw new Error("SemanticEngine used before start() resolved");
        return this.loaded;
    }
}

/** Words are keyed like every other natural key (persistence/keys.ts). */
export const normalizeWord = normalizeKey;

export const semanticEngine = new SemanticEngine(`${import.meta.env.BASE_URL}vocab/`);

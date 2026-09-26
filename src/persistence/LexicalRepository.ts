import { AnalogyResult } from "../embeddings/analogy";
import { AgeBand, AnalogyRecord, ConsentState, GameRecord, LexicalDb, MetaRecord, PLAY_EVENT_SCHEMA, PlayEventRecord, PlayerWordRecord, ProfileRecord, SyncStamp } from "./db";
import { counterTotal, incrementCounter } from "./counters";
import { analogyKey } from "./keys";

export type GameResult = Omit<GameRecord, keyof SyncStamp | "id">;
export type PlayEventInput = Omit<PlayEventRecord, keyof SyncStamp | "id" | "schema" | "at"> & { at?: number };

export interface PendingSyncCounts {
    words: number;
    analogies: number;
    games: number;
    playEvents: number;
}

export { analogyKey };

/** 32 random bytes as hex: proves this device's ownership of `deviceId` when an account claims it. */
function newDeviceSecret(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * All reads and writes of player data. Callers never touch IndexedDB directly, so swapping in a
 * syncing implementation later only changes this class.
 */
export class LexicalRepository {
    private constructor(private readonly db: LexicalDb, readonly deviceId: string, private profile: ProfileRecord, private meta: MetaRecord) {}

    /** Loads (or creates) the local profile, which owns this device's stable id, and the device's meta record. */
    static async open(db: LexicalDb): Promise<LexicalRepository> {
        let profile = await db.get("profile", "local");
        if (!profile) {
            const t = Date.now();
            const deviceId = crypto.randomUUID();
            profile = { id: "local", score: 0, scoreByDevice: {}, createdAt: t, updatedAt: t, syncState: "pending", deviceId };
            await db.put("profile", profile);
        }
        let meta = await db.get("meta", "device");
        if (!meta) {
            meta = { id: "device", deviceSecret: newDeviceSecret() };
            await db.put("meta", meta);
        }
        return new LexicalRepository(db, profile.deviceId, profile, meta);
    }

    /** Lifetime points: the sum over every device that played on this profile. */
    get score(): number {
        return this.profile.scoreByDevice ? counterTotal(this.profile.scoreByDevice) : this.profile.score;
    }

    get hintMode(): boolean {
        return this.profile.hintMode ?? true;
    }

    async setHintMode(hintMode: boolean): Promise<void> {
        this.profile = { ...this.profile, hintMode, ...this.touch(this.profile) };
        await this.db.put("profile", this.profile);
    }

    get dimension(): "2d" | "3d" {
        return this.profile.dimension ?? "2d";
    }

    async setDimension(dimension: "2d" | "3d"): Promise<void> {
        this.profile = { ...this.profile, dimension, ...this.touch(this.profile) };
        await this.db.put("profile", this.profile);
    }

    async addScore(points: number): Promise<number> {
        const scoreByDevice = incrementCounter(this.profile.scoreByDevice, this.deviceId, points);
        this.profile = { ...this.profile, scoreByDevice, score: counterTotal(scoreByDevice), ...this.touch(this.profile) };
        await this.db.put("profile", this.profile);
        return this.profile.score;
    }

    // --- device meta: consent and age (Epic 6 · Features 6.1, 6.2); never synced -------------------

    get consent(): ConsentState | undefined {
        return this.meta.consent;
    }

    get ageBand(): AgeBand | undefined {
        return this.meta.ageBand?.band;
    }

    get consentPromptDismissedAt(): number | undefined {
        return this.meta.consentPromptDismissedAt;
    }

    async updateMeta(changes: Partial<Omit<MetaRecord, "id" | "deviceSecret">>): Promise<void> {
        this.meta = { ...this.meta, ...changes };
        await this.db.put("meta", this.meta);
    }

    listPlayerWords(): Promise<PlayerWordRecord[]> {
        return this.db.getAll("words");
    }

    async savePlayerWord(word: string, vector: Float32Array, model: string, dtype: string): Promise<PlayerWordRecord> {
        const existing = await this.db.get("words", word);
        const record: PlayerWordRecord = { word, vector, model, dtype, ...(existing ? this.touch(existing) : this.stamp()) };
        await this.db.put("words", record);
        return record;
    }

    /** Upserts by question; replaying the same question bumps timesPlayed and refreshes the answer. */
    async recordAnalogy(result: AnalogyResult, vocabVersion: string): Promise<AnalogyRecord> {
        const id = analogyKey(result.a, result.b, result.c);
        const tx = this.db.transaction("analogies", "readwrite");
        const existing = await tx.store.get(id);
        const record: AnalogyRecord = {
            id,
            ...result,
            vocabVersion,
            ...this.countPlay(existing),
            ...(existing ? this.touch(existing) : this.stamp()),
        };
        await tx.store.put(record);
        await tx.done;
        return record;
    }

    async recentAnalogies(limit: number): Promise<AnalogyRecord[]> {
        const out: AnalogyRecord[] = [];
        let cursor = await this.db.transaction("analogies").store.index("byUpdatedAt").openCursor(null, "prev");
        while (cursor && out.length < limit) {
            out.push(cursor.value);
            cursor = await cursor.continue();
        }
        return out;
    }

    countAnalogies(): Promise<number> {
        return this.db.count("analogies");
    }

    async saveGame(result: GameResult): Promise<GameRecord> {
        const record: GameRecord = { id: crypto.randomUUID(), ...result, ...this.stamp() };
        await this.db.put("games", record);
        return record;
    }

    async bestGameScore(): Promise<number> {
        const cursor = await this.db.transaction("games").store.index("byScore").openCursor(null, "prev");
        return cursor?.value.score ?? 0;
    }

    /** Appends a play event (never updated afterwards; a sync marks it synced). */
    async logPlayEvent(input: PlayEventInput): Promise<PlayEventRecord> {
        const record: PlayEventRecord = { ...input, id: crypto.randomUUID(), schema: PLAY_EVENT_SCHEMA, at: input.at ?? Date.now(), ...this.stamp() };
        await this.db.put("playEvents", record);
        return record;
    }

    /** Play events in time order, optionally only those at or after `since`. */
    listPlayEvents(since = 0): Promise<PlayEventRecord[]> {
        return this.db.getAllFromIndex("playEvents", "byAt", IDBKeyRange.lowerBound(since));
    }

    countPlayEvents(): Promise<number> {
        return this.db.count("playEvents");
    }

    async pendingSyncCounts(): Promise<PendingSyncCounts> {
        const [words, analogies, games, playEvents] = await Promise.all([
            this.db.countFromIndex("words", "bySyncState", "pending"),
            this.db.countFromIndex("analogies", "bySyncState", "pending"),
            this.db.countFromIndex("games", "bySyncState", "pending"),
            this.db.countFromIndex("playEvents", "bySyncState", "pending"),
        ]);
        return { words, analogies, games, playEvents };
    }

    /** One more play of an analogy on this device; the total is derived from the per-device counts. */
    private countPlay(existing: AnalogyRecord | undefined): Pick<AnalogyRecord, "playsByDevice" | "timesPlayed"> {
        const base = existing?.playsByDevice ?? (existing ? { [existing.deviceId]: existing.timesPlayed } : undefined);
        const playsByDevice = incrementCounter(base, this.deviceId);
        return { playsByDevice, timesPlayed: counterTotal(playsByDevice) };
    }

    private stamp(): SyncStamp {
        const t = Date.now();
        return { createdAt: t, updatedAt: t, syncState: "pending", deviceId: this.deviceId };
    }

    /** Local edits always re-mark a record pending, even if it was synced before. */
    private touch(existing: SyncStamp): SyncStamp {
        return { createdAt: existing.createdAt, updatedAt: Date.now(), syncState: "pending", deviceId: this.deviceId };
    }
}

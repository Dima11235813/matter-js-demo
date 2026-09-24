import { AnalogyResult } from "../embeddings/analogy";
import { AnalogyRecord, GameRecord, LexicalDb, PlayerWordRecord, ProfileRecord, SyncStamp } from "./db";

export type GameResult = Omit<GameRecord, keyof SyncStamp | "id">;

export interface PendingSyncCounts {
    words: number;
    analogies: number;
    games: number;
}

export function analogyKey(a: string, b: string, c: string): string {
    return `${a}:${b}::${c}`;
}

/**
 * All reads and writes of player data. Callers never touch IndexedDB directly, so swapping in a
 * syncing implementation later only changes this class.
 */
export class LexicalRepository {
    private constructor(private readonly db: LexicalDb, readonly deviceId: string, private profile: ProfileRecord) {}

    /** Loads (or creates) the local profile, which also owns this device's stable id. */
    static async open(db: LexicalDb): Promise<LexicalRepository> {
        let profile = await db.get("profile", "local");
        if (!profile) {
            const t = Date.now();
            profile = { id: "local", score: 0, createdAt: t, updatedAt: t, syncState: "pending", deviceId: crypto.randomUUID() };
            await db.put("profile", profile);
        }
        return new LexicalRepository(db, profile.deviceId, profile);
    }

    get score(): number {
        return this.profile.score;
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
        this.profile = { ...this.profile, score: this.profile.score + points, ...this.touch(this.profile) };
        await this.db.put("profile", this.profile);
        return this.profile.score;
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
            timesPlayed: (existing?.timesPlayed ?? 0) + 1,
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

    async pendingSyncCounts(): Promise<PendingSyncCounts> {
        const [words, analogies, games] = await Promise.all([
            this.db.countFromIndex("words", "bySyncState", "pending"),
            this.db.countFromIndex("analogies", "bySyncState", "pending"),
            this.db.countFromIndex("games", "bySyncState", "pending"),
        ]);
        return { words, analogies, games };
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

import { AnalogyResult } from "../embeddings/analogy";
import { AgeBand, AnalogyRecord, ConsentState, GameRecord, LexicalDb, MetaRecord, PLAY_EVENT_SCHEMA, PlayEventRecord, PlayerWordRecord, ProfileRecord, SyncStamp } from "./db";
import { counterTotal, incrementCounter } from "./counters";
import { analogyKey } from "./keys";
import { mergeRecords, sameRecord, type SyncRecord } from "@lexical/shared";
import {
    analogyFromSync, analogyToSync, gameFromSync, gameToSync, profileFromSync, profileToSync, wordFromSync, wordToSync,
} from "./syncRecords";

export type GameResult = Omit<GameRecord, keyof SyncStamp | "id">;

export interface LocalDataExport {
    kind: "lexical-fountain-my-data";
    exportedAt: string;
    deviceId: string;
    profile: ProfileRecord;
    meta: Omit<MetaRecord, "deviceSecret">;
    words: (Omit<PlayerWordRecord, "vector"> & { vector: number[] })[];
    analogies: AnalogyRecord[];
    games: GameRecord[];
    playEvents: PlayEventRecord[];
}
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

    get ageAnsweredAt(): number | undefined {
        return this.meta.ageBand?.at;
    }

    get deviceSecret(): string {
        return this.meta.deviceSecret;
    }

    get accountUid(): string | undefined {
        return this.meta.accountUid;
    }

    get syncCursor(): string | undefined {
        return this.meta.syncCursor;
    }

    get rating(): { value: number; plays: number } | undefined {
        return this.meta.rating;
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

    // --- sync (Epic 3 · Feature 3.8): local records in the shared contract's shape -----------------

    /** Every record waiting to be pushed (the play log and device meta are never synced). */
    async pendingSyncRecords(): Promise<SyncRecord[]> {
        const [words, analogies, games] = await Promise.all([
            this.db.getAllFromIndex("words", "bySyncState", "pending"),
            this.db.getAllFromIndex("analogies", "bySyncState", "pending"),
            this.db.getAllFromIndex("games", "bySyncState", "pending"),
        ]);
        return [
            ...(this.profile.syncState === "pending" ? [profileToSync(this.profile)] : []),
            ...words.map(wordToSync),
            ...analogies.map(analogyToSync),
            ...games.map(gameToSync),
        ];
    }

    /** Every syncable record (pending or not): what another local profile adopts (Epic 6 · Feature 6.7). */
    async allSyncRecords(): Promise<SyncRecord[]> {
        const [words, analogies, games] = await Promise.all([this.db.getAll("words"), this.db.getAll("analogies"), this.db.getAll("games")]);
        return [profileToSync(this.profile), ...words.map(wordToSync), ...analogies.map(analogyToSync), ...games.map(gameToSync)];
    }

    /** Folds another local profile's record into this one with the shared merge rules; it stays pending (to sync). */
    async adoptRecord(record: SyncRecord): Promise<void> {
        const local = await this.localAsSync(record);
        await this.writeLocal(local ? mergeRecords(local, record) : record, "pending");
    }

    /** Marks a pushed record synced, unless it changed locally while the push was in flight. */
    async markSynced(record: SyncRecord): Promise<void> {
        const current = await this.localAsSync(record);
        if (!current || current.clientUpdatedAt !== record.clientUpdatedAt) return;
        await this.writeLocal(current, "synced");
    }

    /**
     * Folds a record from the server into the local copy with the shared merge rules. The result is
     * `synced` when it equals the server's copy, `pending` when this device still has something newer.
     */
    async applyRemote(remote: SyncRecord): Promise<"inserted" | "merged" | "unchanged"> {
        const local = await this.localAsSync(remote);
        if (local && sameRecord(local, remote)) {
            await this.writeLocal(local, "synced");
            return "unchanged";
        }
        const merged = local ? mergeRecords(local, remote) : remote;
        await this.writeLocal(merged, sameRecord(merged, remote) ? "synced" : "pending");
        return local ? "merged" : "inserted";
    }

    private async localAsSync(record: SyncRecord): Promise<SyncRecord | undefined> {
        switch (record.collection) {
            case "profile":
                return profileToSync(this.profile);
            case "words": {
                const local = await this.db.get("words", record.payload.word);
                // The same word embedded by another model is a different record; keep this device's.
                return local && local.model === record.payload.model && local.dtype === record.payload.dtype ? wordToSync(local) : undefined;
            }
            case "analogies": {
                const local = await this.db.get("analogies", record.key);
                return local ? analogyToSync(local) : undefined;
            }
            case "games": {
                const local = await this.db.get("games", record.key);
                return local ? gameToSync(local) : undefined;
            }
        }
    }

    private async writeLocal(record: SyncRecord, syncState: "synced" | "pending"): Promise<void> {
        switch (record.collection) {
            case "profile":
                this.profile = profileFromSync(this.profile, record, syncState);
                await this.db.put("profile", this.profile);
                return;
            case "words": {
                const existing = await this.db.get("words", record.payload.word);
                if (existing && (existing.model !== record.payload.model || existing.dtype !== record.payload.dtype)) return;
                await this.db.put("words", wordFromSync(record, syncState));
                return;
            }
            case "analogies":
                await this.db.put("analogies", analogyFromSync(record, syncState));
                return;
            case "games":
                await this.db.put("games", gameFromSync(record, syncState));
                return;
        }
    }

    /** One more play of an analogy on this device; the total is derived from the per-device counts. */
    private countPlay(existing: AnalogyRecord | undefined): Pick<AnalogyRecord, "playsByDevice" | "timesPlayed"> {
        const base = existing?.playsByDevice ?? (existing ? { [existing.deviceId]: existing.timesPlayed } : undefined);
        const playsByDevice = incrementCounter(base, this.deviceId);
        return { playsByDevice, timesPlayed: counterTotal(playsByDevice) };
    }

    /**
     * Everything this device holds about the player, as one JSON-ready object: the local version of the
     * future GDPR export (Epic 6 · Task 6.3.1). The device secret is left out: it is a credential.
     */
    async exportAll(): Promise<LocalDataExport> {
        const [words, analogies, games, playEvents] = await Promise.all([
            this.db.getAll("words"), this.db.getAll("analogies"), this.db.getAll("games"), this.db.getAll("playEvents"),
        ]);
        const { deviceSecret: _secret, ...meta } = this.meta;
        return {
            kind: "lexical-fountain-my-data",
            exportedAt: new Date().toISOString(),
            deviceId: this.deviceId,
            profile: this.profile,
            meta,
            words: words.map(w => ({ ...w, vector: Array.from(w.vector) })),
            analogies,
            games,
            playEvents,
        };
    }

    /** Clears every store on this device (Epic 6 · Task 6.3.2). The next open starts a fresh profile. */
    async eraseAll(): Promise<void> {
        const names = ["words", "analogies", "profile", "games", "playEvents", "meta"] as const;
        const tx = this.db.transaction([...names], "readwrite");
        await Promise.all([...names.map(name => tx.objectStore(name).clear()), tx.done]);
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

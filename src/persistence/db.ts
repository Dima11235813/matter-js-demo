import { DBSchema, IDBPDatabase, IDBPTransaction, openDB, StoreNames } from "idb";
import { DeviceCounter } from "./counters";
import { analogyKey } from "./keys";
import { Neighbor } from "../embeddings/VectorIndex";

/**
 * Local-first persistence. Every record carries sync metadata so a future server can pull
 * `syncState: "pending"` rows (outbox pattern) and merge by natural key:
 *   - words are keyed by the word itself (the same word from two devices is one record)
 *   - analogies are keyed by their question "a:b::c" (repeat plays increment this device's count)
 *   - games are keyed by a random id (each finished round is one immutable result)
 *   - play events are keyed by a client-generated id (append-only; the id makes uploads idempotent)
 */
export type SyncState = "pending" | "synced";

export interface SyncStamp {
    createdAt: number;
    updatedAt: number;
    syncState: SyncState;
    deviceId: string;
}

/** A word a player added to the corpus that is not in the base vocabulary. */
export interface PlayerWordRecord extends SyncStamp {
    word: string;
    /** Raw model output (uncentered). Centering is applied at load so vocab rebuilds stay valid. */
    vector: Float32Array;
    model: string;
    dtype: string;
}

export interface AnalogyRecord extends SyncStamp {
    id: string;
    a: string;
    b: string;
    c: string;
    answer: string;
    similarity: number;
    alternatives: Neighbor[];
    /** Base vocab version the answer was computed against; answers can change as the corpus grows. */
    vocabVersion: string;
    /** Derived total of `playsByDevice`, kept for readers. Never merge this number across devices. */
    timesPlayed: number;
    /** Plays per device (a grow-only counter): what a sync merges. v4+. */
    playsByDevice?: DeviceCounter;
}

export interface ProfileRecord extends SyncStamp {
    id: "local";
    /** Derived total of `scoreByDevice`, kept for readers. Never merge this number across devices. */
    score: number;
    /** Lifetime points per device (a grow-only counter): what a sync merges. v4+. */
    scoreByDevice?: DeviceCounter;
    /** Low-gravity semantic orbits; undefined means the default (on). */
    hintMode?: boolean;
    /** Hint view dimension; undefined means 2D. */
    dimension?: "2d" | "3d";
}

export interface GameRecord extends SyncStamp {
    id: string;
    mode: "timed";
    rulesVersion: number;
    startedAt: number;
    endedAt: number;
    score: number;
    analogies: number;
    wordsDealt: number;
    /** Kept so leaderboards can separate assisted and unassisted rounds. */
    hintMode: boolean;
}

/**
 * One thing a player did, for research (Epic 2 · Task 2.11.5): which analogies players find, which
 * fail, how imports and new words are used. Local only until telemetry ingest ships with consent.
 * Payloads never contain free text the player typed or pasted beyond the words that were played.
 */
export type PlayEventType = "analogy" | "expression" | "word" | "import";
export const PLAY_EVENT_SCHEMA = 1;

export interface PlayContext {
    view: string;
    dimension: "2d" | "3d";
    hintMode: boolean;
    /** Timed rounds only. */
    rulesVersion?: number;
    /** Timed rounds only: the round's relation category. */
    relation?: string;
}

export interface PlayEventRecord extends SyncStamp {
    id: string;
    type: PlayEventType;
    schema: number;
    at: number;
    /** One id per app session (page load), to group plays without identifying the player. */
    sessionId: string;
    vocabVersion: string;
    context: PlayContext;
    payload: Record<string, unknown>;
}

/** Research-consent state (Epic 6 · Feature 6.2). Nothing is sent anywhere until telemetry ingest ships. */
export interface ConsentState {
    policyVersion: string;
    grantedAt: number;
    scopes: string[];
    /** Minted when consent is granted; never the device or account id (platform-plan §3). */
    researchId: string;
}

/** Only the band is kept, never the birth year (Epic 6 · Task 6.2.2.1). */
export type AgeBand = "under13" | "13to15" | "16plus";

/**
 * This device's identity and privacy state (Epic 6 · Task 6.1.2.1). Never synced: the secret proves
 * ownership of `deviceId` when an account claims the device, and consent is per device.
 */
export interface MetaRecord {
    id: "device";
    deviceSecret: string;
    accountUid?: string;
    consent?: ConsentState;
    ageBand?: { band: AgeBand; at: number };
    /** When the consent prompt was last dismissed, so it isn't shown again right away. */
    consentPromptDismissedAt?: number;
}

export interface LexicalSchema extends DBSchema {
    words: { key: string; value: PlayerWordRecord; indexes: { bySyncState: SyncState } };
    analogies: { key: string; value: AnalogyRecord; indexes: { bySyncState: SyncState; byUpdatedAt: number } };
    profile: { key: string; value: ProfileRecord };
    games: { key: string; value: GameRecord; indexes: { bySyncState: SyncState; byScore: number } };
    playEvents: { key: string; value: PlayEventRecord; indexes: { bySyncState: SyncState; byAt: number } };
    meta: { key: string; value: MetaRecord };
}

export type LexicalDb = IDBPDatabase<LexicalSchema>;

export const DEFAULT_DB_NAME = "lexical-fountain";
const DB_VERSION = 4;

export function openLexicalDb(name: string = DEFAULT_DB_NAME): Promise<LexicalDb> {
    return openDB<LexicalSchema>(name, DB_VERSION, {
        upgrade(db, oldVersion, _newVersion, transaction) {
            // Append-only migrations: add `if (oldVersion < N)` blocks, never edit old ones.
            if (oldVersion < 1) {
                const words = db.createObjectStore("words", { keyPath: "word" });
                words.createIndex("bySyncState", "syncState");
                const analogies = db.createObjectStore("analogies", { keyPath: "id" });
                analogies.createIndex("bySyncState", "syncState");
                analogies.createIndex("byUpdatedAt", "updatedAt");
                db.createObjectStore("profile", { keyPath: "id" });
            }
            if (oldVersion < 2) {
                const games = db.createObjectStore("games", { keyPath: "id" });
                games.createIndex("bySyncState", "syncState");
                games.createIndex("byScore", "score");
            }
            if (oldVersion < 3) {
                const events = db.createObjectStore("playEvents", { keyPath: "id" });
                events.createIndex("bySyncState", "syncState");
                events.createIndex("byAt", "at");
            }
            if (oldVersion < 4) {
                db.createObjectStore("meta", { keyPath: "id" });
                // Only the upgrade transaction's own requests run here, which keeps it alive until done.
                if (oldVersion >= 1) void migrateToDeviceCounters(transaction);
            }
        },
    });
}

type UpgradeTransaction = IDBPTransaction<LexicalSchema, StoreNames<LexicalSchema>[], "versionchange">;

/**
 * v4: plain counters become per-device counters (the existing total is credited to the device that
 * recorded it), and analogy keys are re-normalized (NFC). Colliding keys merge their play counts.
 */
async function migrateToDeviceCounters(transaction: UpgradeTransaction): Promise<void> {
    const profiles = transaction.objectStore("profile");
    const profile = await profiles.get("local");
    if (profile && !profile.scoreByDevice) {
        await profiles.put({ ...profile, scoreByDevice: { [profile.deviceId]: profile.score } });
    }
    const analogies = transaction.objectStore("analogies");
    const playsOf = (record: AnalogyRecord) => record.playsByDevice ?? { [record.deviceId]: record.timesPlayed };
    // Re-read each record by key: an earlier step may already have merged into it.
    for (const id of await analogies.getAllKeys()) {
        const record = await analogies.get(id);
        if (!record) continue;
        const key = analogyKey(record.a, record.b, record.c);
        if (key === record.id) {
            if (!record.playsByDevice) await analogies.put({ ...record, playsByDevice: playsOf(record) });
            continue;
        }
        const existing = await analogies.get(key);
        const merged: Record<string, number> = { ...(existing ? playsOf(existing) : {}) };
        for (const [device, n] of Object.entries(playsOf(record))) merged[device] = (merged[device] ?? 0) + n;
        const total = Object.values(merged).reduce((sum, n) => sum + n, 0);
        await analogies.delete(record.id);
        await analogies.put({ ...(existing ?? record), id: key, playsByDevice: merged, timesPlayed: total });
    }
}

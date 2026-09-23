import { DBSchema, IDBPDatabase, openDB } from "idb";
import { Neighbor } from "../embeddings/VectorIndex";

/**
 * Local-first persistence. Every record carries sync metadata so a future server can pull
 * `syncState: "pending"` rows (outbox pattern) and merge by natural key:
 *   - words are keyed by the word itself (the same word from two devices is one record)
 *   - analogies are keyed by their question "a:b::c" (repeat plays increment timesPlayed)
 *   - games are keyed by a random id (each finished round is one immutable result)
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
    timesPlayed: number;
}

export interface ProfileRecord extends SyncStamp {
    id: "local";
    score: number;
    /** Low-gravity semantic orbits; undefined means the default (on). */
    hintMode?: boolean;
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

export interface LexicalSchema extends DBSchema {
    words: { key: string; value: PlayerWordRecord; indexes: { bySyncState: SyncState } };
    analogies: { key: string; value: AnalogyRecord; indexes: { bySyncState: SyncState; byUpdatedAt: number } };
    profile: { key: string; value: ProfileRecord };
    games: { key: string; value: GameRecord; indexes: { bySyncState: SyncState; byScore: number } };
}

export type LexicalDb = IDBPDatabase<LexicalSchema>;

export const DEFAULT_DB_NAME = "lexical-fountain";
const DB_VERSION = 2;

export function openLexicalDb(name: string = DEFAULT_DB_NAME): Promise<LexicalDb> {
    return openDB<LexicalSchema>(name, DB_VERSION, {
        upgrade(db, oldVersion) {
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
        },
    });
}

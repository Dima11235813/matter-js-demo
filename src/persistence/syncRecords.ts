import { decodeVector, encodeVector, SYNC_SCHEMA_VERSION, wordKey, type RecordOf, type SyncRecord } from "@lexical/shared";
import type { AnalogyRecord, GameRecord, PlayerWordRecord, ProfileRecord, SyncState } from "./db";

/**
 * Local IndexedDB records ⇄ the shared sync contract (Epic 3 · Feature 3.8). Pure, so the mapping is
 * unit-tested. Merging always happens on the SyncRecord form with the shared rules, so the web app and
 * the server combine copies identically.
 */
export function profileToSync(profile: ProfileRecord): RecordOf<"profile"> {
    return {
        collection: "profile",
        key: "profile",
        schemaVersion: SYNC_SCHEMA_VERSION,
        clientUpdatedAt: profile.updatedAt,
        deviceId: profile.deviceId,
        payload: {
            ...(profile.hintMode !== undefined ? { hintMode: profile.hintMode } : {}),
            ...(profile.dimension !== undefined ? { dimension: profile.dimension } : {}),
            scoreByDevice: profile.scoreByDevice ?? { [profile.deviceId]: profile.score },
        },
    };
}

export function wordToSync(record: PlayerWordRecord): RecordOf<"words"> {
    return {
        collection: "words",
        key: wordKey(record.word, record.model, record.dtype),
        schemaVersion: SYNC_SCHEMA_VERSION,
        clientUpdatedAt: record.updatedAt,
        deviceId: record.deviceId,
        payload: { word: record.word, vector: encodeVector(record.vector), model: record.model, dtype: record.dtype, createdAt: record.createdAt },
    };
}

export function analogyToSync(record: AnalogyRecord): RecordOf<"analogies"> {
    return {
        collection: "analogies",
        key: record.id,
        schemaVersion: SYNC_SCHEMA_VERSION,
        clientUpdatedAt: record.updatedAt,
        deviceId: record.deviceId,
        payload: {
            a: record.a, b: record.b, c: record.c, answer: record.answer, similarity: record.similarity,
            alternatives: record.alternatives.map(n => ({ word: n.word, similarity: n.similarity })),
            vocabVersion: record.vocabVersion,
            playsByDevice: record.playsByDevice ?? { [record.deviceId]: record.timesPlayed },
            createdAt: record.createdAt,
        },
    };
}

export function gameToSync(record: GameRecord): RecordOf<"games"> {
    const { id, createdAt: _c, updatedAt, syncState: _s, deviceId, ...payload } = record;
    return { collection: "games", key: id, schemaVersion: SYNC_SCHEMA_VERSION, clientUpdatedAt: updatedAt, deviceId, payload };
}

/**
 * A merged profile back onto this device's profile. The profile's deviceId is this device's identity,
 * so it never changes, whichever copy won.
 */
export function profileFromSync(local: ProfileRecord, record: RecordOf<"profile">, syncState: SyncState): ProfileRecord {
    const { hintMode, dimension, scoreByDevice } = record.payload;
    const score = Object.values(scoreByDevice).reduce((sum, n) => sum + n, 0);
    return { ...local, hintMode, dimension, scoreByDevice, score, updatedAt: record.clientUpdatedAt, syncState };
}

export function wordFromSync(record: RecordOf<"words">, syncState: SyncState): PlayerWordRecord {
    const { word, vector, model, dtype, createdAt } = record.payload;
    return { word, vector: decodeVector(vector), model, dtype, createdAt, updatedAt: record.clientUpdatedAt, syncState, deviceId: record.deviceId };
}

export function analogyFromSync(record: RecordOf<"analogies">, syncState: SyncState): AnalogyRecord {
    const { createdAt, playsByDevice, ...rest } = record.payload;
    const timesPlayed = Object.values(playsByDevice).reduce((sum, n) => sum + n, 0);
    return { id: record.key, ...rest, playsByDevice, timesPlayed, createdAt, updatedAt: record.clientUpdatedAt, syncState, deviceId: record.deviceId };
}

export function gameFromSync(record: RecordOf<"games">, syncState: SyncState): GameRecord {
    return { id: record.key, ...record.payload, createdAt: record.clientUpdatedAt, updatedAt: record.clientUpdatedAt, syncState, deviceId: record.deviceId };
}

export type { SyncRecord };

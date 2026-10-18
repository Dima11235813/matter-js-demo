import { decodeVector, encodeVector, SYNC_SCHEMA_VERSION, wordKey, type RecordOf, type SyncRecord } from "@lexical/shared";
import type { AnalogyRecord, GameRecord, PlayerWordRecord, ProfileRecord, SessionRecord, SyncState } from "./db";

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
            ...(profile.rating ? { rating: profile.rating } : {}),
        },
    };
}

/**
 * A saved session (Task 2.15.4). `deviceId` is the device that last changed it (sessions saved before v6
 * carry none: this device's id is used). A tombstone keeps the id and sends an empty board.
 *
 * The board is cleaned to the contract's limits on the way out (as uploaded files are): one invalid entry
 * must never make the server refuse a whole push batch, which would stall sync for every record in it.
 */
export function sessionToSync(record: SessionRecord, thisDevice: string): RecordOf<"sessions"> {
    const fits = (s: unknown, max: number): s is string => typeof s === "string" && s.length > 0 && s.length <= max;
    const coord = (n: unknown) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1e6;
    const hex = (c: unknown) => (typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c) ? c : undefined);
    const words = record.words
        .filter(w => fits(w.word, 40) && coord(w.x) && coord(w.y))
        .slice(0, 400)
        .map(w => ({ word: w.word, x: w.x, y: w.y, ...(hex(w.color) ? { color: hex(w.color) } : {}) }));
    const analogies = record.analogies
        .filter(a => [a.a, a.b, a.c, a.answer].every(s => fits(s, 40)) && Number.isFinite(a.similarity) && Number.isFinite(a.points))
        .slice(0, 300)
        .map(a => ({ a: a.a, b: a.b, c: a.c, answer: a.answer, points: Math.round(a.points), similarity: a.similarity, ...(a.guess !== undefined ? { guess: a.guess } : {}) }));
    const letters = record.letters
        ?.filter(l => fits(l.text, 40) && fits(l.color, 32) && [l.x, l.y, l.angle, l.w, l.h].every(coord) && Number.isInteger(l.type))
        .slice(0, 600);
    return {
        collection: "sessions",
        key: record.id,
        schemaVersion: SYNC_SCHEMA_VERSION,
        clientUpdatedAt: record.updatedAt ?? record.savedAt,
        deviceId: record.deviceId ?? thisDevice,
        payload: {
            name: (record.name.trim() || "Saved board").slice(0, 200),
            savedAt: record.savedAt,
            schema: Math.round(record.schema),
            view: fits(record.view, 32) ? record.view : "fountain",
            words,
            analogies,
            ...(letters ? { letters } : {}),
            ...(record.deleted ? { deleted: true } : {}),
        },
    };
}

export function sessionFromSync(record: RecordOf<"sessions">, syncState: SyncState): SessionRecord {
    const { deleted, letters, ...board } = record.payload;
    return {
        id: record.key, ...board, ...(letters ? { letters } : {}), ...(deleted ? { deleted: true } : {}),
        updatedAt: record.clientUpdatedAt, syncState, deviceId: record.deviceId,
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
    const { hintMode, dimension, scoreByDevice, rating } = record.payload;
    const score = Object.values(scoreByDevice).reduce((sum, n) => sum + n, 0);
    return { ...local, hintMode, dimension, scoreByDevice, score, rating, updatedAt: record.clientUpdatedAt, syncState };
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

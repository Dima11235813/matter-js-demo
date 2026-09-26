import { z } from "zod";

/**
 * The sync API's data contracts (Epic 3 · Feature 3.8), defined once. The server validates every
 * request with these schemas; the web app uses the inferred types. Versioning: every record carries
 * `schemaVersion`; the server accepts the current and the previous version.
 */
export const SYNC_SCHEMA_VERSION = 1;
export const MAX_PUSH_RECORDS = 200;
export const MAX_PULL_RECORDS = 500;

const counter = z.record(z.string(), z.number().int().nonnegative());
const epochMs = z.number().int().nonnegative();
const deviceId = z.string().uuid();

/** Settings plus the per-device lifetime score. */
export const ProfilePayload = z.object({
    hintMode: z.boolean().optional(),
    dimension: z.enum(["2d", "3d"]).optional(),
    scoreByDevice: counter,
});

/** A word a player added: the model's raw vector, base64 of little-endian float32 (see vectors.ts). */
export const WordPayload = z.object({
    word: z.string().min(1).max(64),
    vector: z.string().max(8192),
    model: z.string().min(1),
    dtype: z.string().min(1),
    createdAt: epochMs,
});

export const Neighbor = z.object({ word: z.string(), similarity: z.number() });

export const AnalogyPayload = z.object({
    a: z.string(),
    b: z.string(),
    c: z.string(),
    answer: z.string(),
    similarity: z.number(),
    alternatives: z.array(Neighbor).max(20),
    vocabVersion: z.string(),
    playsByDevice: counter,
    createdAt: epochMs,
});

export const GamePayload = z.object({
    mode: z.literal("timed"),
    rulesVersion: z.number().int(),
    startedAt: epochMs,
    endedAt: epochMs,
    score: z.number().int(),
    analogies: z.number().int().nonnegative(),
    wordsDealt: z.number().int().nonnegative(),
    hintMode: z.boolean(),
});

const envelope = {
    key: z.string().min(1).max(256),
    schemaVersion: z.number().int().min(SYNC_SCHEMA_VERSION - 1).max(SYNC_SCHEMA_VERSION),
    clientUpdatedAt: epochMs,
    deviceId,
};

/** One synced record. The play log and device meta are never synced. */
export const SyncRecord = z.discriminatedUnion("collection", [
    z.object({ collection: z.literal("profile"), ...envelope, payload: ProfilePayload }),
    z.object({ collection: z.literal("words"), ...envelope, payload: WordPayload }),
    z.object({ collection: z.literal("analogies"), ...envelope, payload: AnalogyPayload }),
    z.object({ collection: z.literal("games"), ...envelope, payload: GamePayload }),
]);
export type SyncRecord = z.infer<typeof SyncRecord>;
export type SyncCollection = SyncRecord["collection"];
export type RecordOf<C extends SyncCollection> = Extract<SyncRecord, { collection: C }>;

export const PushRequest = z.object({
    deviceId,
    records: z.array(SyncRecord).max(MAX_PUSH_RECORDS),
});
export type PushRequest = z.infer<typeof PushRequest>;

export const PushResult = z.object({
    collection: z.enum(["profile", "words", "analogies", "games"]),
    key: z.string(),
    /** applied: stored as sent; merged: combined with the server's copy (the merged record is returned). */
    status: z.enum(["applied", "merged"]),
    serverSeq: z.number().int(),
    record: SyncRecord.optional(),
});
export const PushResponse = z.object({ results: z.array(PushResult) });
export type PushResponse = z.infer<typeof PushResponse>;

/** A pulled change carries the server's sequence number; the cursor is opaque to the client. */
export const PulledRecord = z.object({ serverSeq: z.number().int(), record: SyncRecord });
export const PullResponse = z.object({
    changes: z.array(PulledRecord),
    nextCursor: z.string(),
    hasMore: z.boolean(),
});
export type PullResponse = z.infer<typeof PullResponse>;

export const ClaimRequest = z.object({
    deviceId,
    /** 64 hex chars; the server stores only its SHA-256. */
    deviceSecret: z.string().regex(/^[0-9a-f]{64}$/),
});
export type ClaimRequest = z.infer<typeof ClaimRequest>;
export const ClaimResponse = z.object({
    status: z.enum(["claimed", "already-yours"]),
});
export type ClaimResponse = z.infer<typeof ClaimResponse>;

export const AccountExport = z.object({
    kind: z.literal("lexical-fountain-account-export"),
    exportedAt: z.string(),
    userId: z.string(),
    devices: z.array(z.object({ deviceId: z.string(), claimedAt: z.string() })),
    records: z.array(SyncRecord),
});
export type AccountExport = z.infer<typeof AccountExport>;

export const DeleteResponse = z.object({
    receipt: z.string().uuid(),
    deleted: z.object({ records: z.number().int(), devices: z.number().int() }),
});
export type DeleteResponse = z.infer<typeof DeleteResponse>;

export const ApiError = z.object({
    error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof ApiError>;

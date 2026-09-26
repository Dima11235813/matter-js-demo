import { mergeCounters } from "./counters";
import type { RecordOf, SyncRecord } from "./sync";

/**
 * Merge rules for synced records (Epic 3 · Feature 3.7; docs/research/backend-sync-telemetry.md §3.3).
 * Pure functions, run by the server on push and by the client on pull, so both sides always agree.
 * Every rule is commutative and idempotent: merge(a, b) equals merge(b, a), and merge(a, a) equals a.
 *
 *   profile:   settings last-writer-wins (clientUpdatedAt, tie-break deviceId); scoreByDevice max-merge
 *   words:     add-wins; a key (word + model + dtype) is immutable, the earlier createdAt is kept
 *   analogies: playsByDevice max-merge; answer fields last-writer-wins; createdAt = the minimum
 *   games:     immutable, the first copy stays (both copies are identical)
 */
export function mergeRecords(a: SyncRecord, b: SyncRecord): SyncRecord {
    if (a.collection !== b.collection || a.key !== b.key) {
        throw new Error(`Cannot merge ${a.collection}/${a.key} with ${b.collection}/${b.key}`);
    }
    switch (a.collection) {
        case "profile":
            return mergeProfile(a, b as RecordOf<"profile">);
        case "words":
            return mergeWord(a, b as RecordOf<"words">);
        case "analogies":
            return mergeAnalogy(a, b as RecordOf<"analogies">);
        case "games":
            return newer(a, b) === a ? a : b; // identical by construction; pick deterministically
    }
}

/** Last-writer-wins order: the later clientUpdatedAt, ties broken by the larger deviceId. */
function newer<T extends SyncRecord>(a: T, b: T): T {
    if (a.clientUpdatedAt !== b.clientUpdatedAt) return a.clientUpdatedAt > b.clientUpdatedAt ? a : b;
    return a.deviceId >= b.deviceId ? a : b;
}

function mergeProfile(a: RecordOf<"profile">, b: RecordOf<"profile">): RecordOf<"profile"> {
    const winner = newer(a, b);
    return {
        ...winner,
        clientUpdatedAt: Math.max(a.clientUpdatedAt, b.clientUpdatedAt),
        payload: { ...winner.payload, scoreByDevice: mergeCounters(a.payload.scoreByDevice, b.payload.scoreByDevice) },
    };
}

function mergeWord(a: RecordOf<"words">, b: RecordOf<"words">): RecordOf<"words"> {
    // Add-wins set: both sides hold the same word; keep the one added first (deterministic for ties).
    if (a.payload.createdAt !== b.payload.createdAt) return a.payload.createdAt < b.payload.createdAt ? a : b;
    return a.deviceId <= b.deviceId ? a : b;
}

function mergeAnalogy(a: RecordOf<"analogies">, b: RecordOf<"analogies">): RecordOf<"analogies"> {
    const winner = newer(a, b);
    return {
        ...winner,
        clientUpdatedAt: Math.max(a.clientUpdatedAt, b.clientUpdatedAt),
        payload: {
            ...winner.payload,
            playsByDevice: mergeCounters(a.payload.playsByDevice, b.payload.playsByDevice),
            createdAt: Math.min(a.payload.createdAt, b.payload.createdAt),
        },
    };
}

/** True when two records carry the same content (used to report "applied" vs "merged"). */
export function sameRecord(a: SyncRecord, b: SyncRecord): boolean {
    return stableJson(a) === stableJson(b);
}

function stableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (value && typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, v]) => v !== undefined)
            .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
        return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
    }
    return JSON.stringify(value);
}

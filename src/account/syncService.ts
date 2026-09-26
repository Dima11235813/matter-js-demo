import { MAX_PUSH_RECORDS, type SyncRecord } from "@lexical/shared";
import { ApiClient, ApiRequestError } from "./apiClient";

/** What sync needs from local storage (the repository, via the semantic engine). */
export interface SyncPort {
    readonly deviceId: string;
    readonly deviceSecret: string;
    readonly accountUid: string | undefined;
    readonly syncCursor: string | undefined;
    setAccount(changes: { accountUid?: string; syncCursor?: string }): Promise<void>;
    pendingSyncRecords(): Promise<SyncRecord[]>;
    markSynced(record: SyncRecord): Promise<void>;
    applyRemote(record: SyncRecord): Promise<"inserted" | "merged" | "unchanged">;
}

export interface SyncReport {
    pushed: number;
    pulled: number;
    merged: number;
}

export class SyncConflictError extends Error {}

/**
 * One sync pass (Epic 3 · Features 3.7, 3.8; Epic 6 · Task 6.4.1.2):
 *   1. claim the device for this account on first sync (the device secret proves it is ours);
 *   2. push every pending record, in pages; the server merges with the shared rules;
 *   3. pull everything after the stored cursor and fold it in with the same rules;
 *   4. save the cursor.
 * A device already linked to a different account is never merged silently.
 */
export async function syncOnce(api: ApiClient, port: SyncPort, uid: string): Promise<SyncReport> {
    if (port.accountUid && port.accountUid !== uid) {
        throw new SyncConflictError("This device's data belongs to another account. Sign in with that account, or erase this device first.");
    }
    if (!port.accountUid) {
        try {
            await api.claim({ deviceId: port.deviceId, deviceSecret: port.deviceSecret });
        } catch (error) {
            if (error instanceof ApiRequestError && error.code === "device-claimed-by-other") {
                throw new SyncConflictError("This device is linked to another account. Erase this device to use it with this one.");
            }
            throw error;
        }
        await port.setAccount({ accountUid: uid, syncCursor: undefined });
    }

    const report: SyncReport = { pushed: 0, pulled: 0, merged: 0 };
    const pending = await port.pendingSyncRecords();
    for (let i = 0; i < pending.length; i += MAX_PUSH_RECORDS) {
        const batch = pending.slice(i, i + MAX_PUSH_RECORDS);
        const { results } = await api.push({ deviceId: port.deviceId, records: batch });
        for (const [j, result] of results.entries()) {
            if (result.status === "merged" && result.record) {
                await port.applyRemote(result.record);
                report.merged++;
            } else {
                await port.markSynced(batch[j]);
            }
        }
        report.pushed += batch.length;
    }

    let cursor = port.syncCursor;
    for (let page = 0; page < 1000; page++) {
        const { changes, nextCursor, hasMore } = await api.pull(cursor);
        for (const change of changes) {
            if ((await port.applyRemote(change.record)) !== "unchanged") report.pulled++;
        }
        cursor = nextCursor;
        await port.setAccount({ syncCursor: cursor });
        if (!hasMore) break;
    }
    return report;
}

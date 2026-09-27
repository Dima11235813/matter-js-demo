import { createHash, randomUUID } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { $ZodError } from "zod/v4/core";
import {
    AccountExport, analogyKey, ClaimRequest, ClaimResponse, DeleteResponse, MAX_PULL_RECORDS, mergeRecords, PullResponse,
    PushRequest, PushResponse, sameRecord, SyncRecord, wordKey,
} from "@lexical/shared";
import type { Db, Queryable } from "./db";
import { AuthError, type Verifier } from "./auth";

/**
 * The API (Epic 3 · Features 3.7, 3.8). Every body is validated with the shared schemas; merges use the
 * shared rules, so the server and the web app always agree on how two copies combine.
 */
type Env = { Variables: { userId: string } };

class HttpError extends Error {
    constructor(readonly status: 400 | 401 | 403 | 404 | 409, readonly code: string, message: string) {
        super(message);
    }
}

export function createApp({ db, verifier }: { db: Db; verifier: Verifier }) {
    const app = new Hono<Env>().basePath("/api/v1");

    app.onError((error, c) => {
        if (error instanceof HttpError) return c.json({ error: { code: error.code, message: error.message } }, error.status);
        if (error instanceof AuthError) return c.json({ error: { code: "unauthorized", message: error.message } }, 401);
        if (error instanceof $ZodError) {
            return c.json({ error: { code: "invalid-request", message: error.issues.slice(0, 3).map(i => `${i.path.join(".")}: ${i.message}`).join("; ") } }, 400);
        }
        console.error(error);
        return c.json({ error: { code: "internal", message: "Internal error" } }, 500);
    });

    app.get("/health", c => c.json({ ok: true, db: db.kind }));

    if (verifier.mintDevToken) {
        // Dev and e2e only (config.ts refuses DEV_AUTH_SECRET in production).
        app.post("/dev/token", async c => {
            const { subject } = z.object({ subject: z.string().min(1).max(128) }).parse(await c.req.json());
            return c.json({ token: await verifier.mintDevToken!(subject) });
        });
    }

    // Everything below needs a signed-in user.
    app.use("/devices/*", requireUser);
    app.use("/sync/*", requireUser);
    app.use("/me", requireUser);
    app.use("/me/*", requireUser);

    async function requireUser(c: import("hono").Context<Env>, next: () => Promise<void>) {
        const header = c.req.header("authorization") ?? "";
        const token = header.startsWith("Bearer ") ? header.slice(7) : "";
        if (!token) throw new AuthError("Sign in first");
        const identity = await verifier.verify(token);
        c.set("userId", await userFor(db, identity.issuer, identity.subject));
        await next();
    }

    app.post("/devices/claim", async c => {
        const body = ClaimRequest.parse(await c.req.json());
        const userId = c.get("userId");
        const hash = sha256(body.deviceSecret);
        const existing = (await db.query<{ user_id: string; secret_hash: string }>(
            "SELECT user_id, secret_hash FROM devices WHERE device_id = $1", [body.deviceId])).rows[0];
        if (existing) {
            if (existing.secret_hash !== hash) throw new HttpError(403, "device-proof-mismatch", "This device id belongs to a different device");
            if (existing.user_id !== userId) throw new HttpError(409, "device-claimed-by-other", "This device is linked to another account");
            return c.json(ClaimResponse.parse({ status: "already-yours" }));
        }
        await db.query("INSERT INTO devices (device_id, user_id, secret_hash) VALUES ($1, $2, $3)", [body.deviceId, userId, hash]);
        return c.json(ClaimResponse.parse({ status: "claimed" }), 201);
    });

    app.post("/sync/push", bodyLimit({ maxSize: 512 * 1024 }), async c => {
        const body = PushRequest.parse(await c.req.json());
        const userId = c.get("userId");
        await requireDevice(db, userId, body.deviceId);
        const results = await db.transaction(async tx => {
            const out: PushResponse["results"] = [];
            for (const incoming of body.records) {
                checkKey(incoming);
                const row = (await tx.query<{ record: SyncRecord }>(
                    "SELECT record FROM sync_records WHERE user_id = $1 AND collection = $2 AND key = $3 FOR UPDATE",
                    [userId, incoming.collection, incoming.key])).rows[0];
                const merged = row ? mergeRecords(SyncRecord.parse(row.record), incoming) : incoming;
                const seq = await nextSeq(tx);
                await tx.query(
                    `INSERT INTO sync_records (user_id, collection, key, record, server_seq) VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (user_id, collection, key) DO UPDATE SET record = EXCLUDED.record, server_seq = EXCLUDED.server_seq`,
                    [userId, incoming.collection, incoming.key, JSON.stringify(merged), seq]);
                const changed = !sameRecord(merged, incoming);
                out.push({ collection: incoming.collection, key: incoming.key, status: changed ? "merged" : "applied", serverSeq: seq, ...(changed ? { record: merged } : {}) });
            }
            return out;
        });
        return c.json(PushResponse.parse({ results }));
    });

    app.get("/sync/pull", async c => {
        const userId = c.get("userId");
        const since = parseCursor(c.req.query("since"));
        const limit = Math.min(Number(c.req.query("limit") ?? MAX_PULL_RECORDS) || MAX_PULL_RECORDS, MAX_PULL_RECORDS);
        const rows = (await db.query<{ record: SyncRecord; server_seq: string }>(
            "SELECT record, server_seq FROM sync_records WHERE user_id = $1 AND server_seq > $2 ORDER BY server_seq LIMIT $3",
            [userId, since, limit + 1])).rows;
        const page = rows.slice(0, limit);
        const last = page.length > 0 ? Number(page[page.length - 1].server_seq) : since;
        return c.json(PullResponse.parse({
            changes: page.map(r => ({ serverSeq: Number(r.server_seq), record: r.record })),
            nextCursor: String(last),
            hasMore: rows.length > limit,
        }));
    });

    app.get("/me/export", async c => {
        const userId = c.get("userId");
        const devices = (await db.query<{ device_id: string; claimed_at: Date | string }>(
            "SELECT device_id, claimed_at FROM devices WHERE user_id = $1 ORDER BY claimed_at", [userId])).rows;
        const records = (await db.query<{ record: SyncRecord }>(
            "SELECT record FROM sync_records WHERE user_id = $1 ORDER BY server_seq", [userId])).rows;
        return c.json(AccountExport.parse({
            kind: "lexical-fountain-account-export",
            exportedAt: new Date().toISOString(),
            userId,
            devices: devices.map(d => ({ deviceId: d.device_id, claimedAt: new Date(d.claimed_at).toISOString() })),
            records: records.map(r => r.record),
        }));
    });

    app.delete("/me", async c => {
        const userId = c.get("userId");
        const receipt = randomUUID();
        const deleted = await db.transaction(async tx => {
            const records = Number((await tx.query<{ n: string }>("SELECT count(*) AS n FROM sync_records WHERE user_id = $1", [userId])).rows[0].n);
            const devices = Number((await tx.query<{ n: string }>("SELECT count(*) AS n FROM devices WHERE user_id = $1", [userId])).rows[0].n);
            await tx.query("INSERT INTO deletion_ledger (receipt, user_id) VALUES ($1, $2)", [receipt, userId]);
            await tx.query("DELETE FROM users WHERE user_id = $1", [userId]); // cascades to identities, devices, records
            await tx.query("UPDATE deletion_ledger SET completed_at = now() WHERE receipt = $1", [receipt]);
            return { records, devices };
        });
        return c.json(DeleteResponse.parse({ receipt, deleted }));
    });

    return app;
}

/** Finds or creates our user for a provider identity (issuer + subject). */
async function userFor(db: Db, issuer: string, subject: string): Promise<string> {
    const found = (await db.query<{ user_id: string }>("SELECT user_id FROM identities WHERE issuer = $1 AND subject = $2", [issuer, subject])).rows[0];
    if (found) return found.user_id;
    const userId = randomUUID();
    await db.transaction(async tx => {
        await tx.query("INSERT INTO users (user_id) VALUES ($1)", [userId]);
        await tx.query("INSERT INTO identities (issuer, subject, user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [issuer, subject, userId]);
    });
    // A concurrent first request may have won the race: read back the stored mapping.
    return (await db.query<{ user_id: string }>("SELECT user_id FROM identities WHERE issuer = $1 AND subject = $2", [issuer, subject])).rows[0].user_id;
}

async function requireDevice(db: Db, userId: string, deviceId: string): Promise<void> {
    const row = (await db.query<{ user_id: string }>("SELECT user_id FROM devices WHERE device_id = $1", [deviceId])).rows[0];
    if (!row || row.user_id !== userId) throw new HttpError(403, "device-not-claimed", "Claim this device before syncing");
}

/** Keys must be the canonical ones, so the same record from two devices always lands on one row. */
function checkKey(record: SyncRecord): void {
    const expected =
        record.collection === "profile" ? "profile"
            : record.collection === "words" ? wordKey(record.payload.word, record.payload.model, record.payload.dtype)
                : record.collection === "analogies" ? analogyKey(record.payload.a, record.payload.b, record.payload.c)
                    : record.key; // games: a client-generated id
    if (record.key !== expected) throw new HttpError(400, "non-canonical-key", `Expected key "${expected}" for ${record.collection}, got "${record.key}"`);
}

async function nextSeq(tx: Queryable): Promise<number> {
    return Number((await tx.query<{ seq: string }>("SELECT nextval('sync_seq') AS seq")).rows[0].seq);
}

function parseCursor(value: string | undefined): number {
    if (value === undefined || value === "") return 0;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) throw new HttpError(400, "invalid-cursor", "Invalid cursor");
    return n;
}

function sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}

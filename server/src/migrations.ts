import type { Db } from "./db";

/**
 * Forward-only SQL migrations, applied at startup in order (Epic 7 · Task 7.4.3: each one must stay
 * compatible with the previous release). Never edit an applied migration; add the next one.
 */
export const MIGRATIONS: { id: string; sql: string }[] = [
    {
        id: "001-accounts-and-sync",
        sql: `
            CREATE TABLE users (
                user_id uuid PRIMARY KEY,
                created_at timestamptz NOT NULL DEFAULT now()
            );
            -- Provider identity (JWT iss + sub) -> our own user id, so the auth provider can change.
            CREATE TABLE identities (
                issuer text NOT NULL,
                subject text NOT NULL,
                user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
                PRIMARY KEY (issuer, subject)
            );
            CREATE TABLE devices (
                device_id uuid PRIMARY KEY,
                user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
                secret_hash text NOT NULL,
                claimed_at timestamptz NOT NULL DEFAULT now()
            );
            -- Pull cursors come from this server-assigned sequence, never from client clocks.
            CREATE SEQUENCE sync_seq;
            CREATE TABLE sync_records (
                user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
                collection text NOT NULL,
                key text NOT NULL,
                record jsonb NOT NULL,
                server_seq bigint NOT NULL,
                PRIMARY KEY (user_id, collection, key)
            );
            CREATE INDEX sync_records_pull ON sync_records (user_id, server_seq);
            -- Proof of deletion (ids and dates only), also read by the research archive job later.
            CREATE TABLE deletion_ledger (
                receipt uuid PRIMARY KEY,
                user_id uuid NOT NULL,
                requested_at timestamptz NOT NULL DEFAULT now(),
                completed_at timestamptz
            );
        `,
    },
];

export async function migrate(db: Db): Promise<string[]> {
    await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const applied = new Set((await db.query<{ id: string }>("SELECT id FROM schema_migrations")).rows.map(r => r.id));
    const ran: string[] = [];
    for (const migration of MIGRATIONS) {
        if (applied.has(migration.id)) continue;
        await db.transaction(async tx => {
            for (const statement of splitStatements(migration.sql)) await tx.query(statement);
            await tx.query("INSERT INTO schema_migrations (id) VALUES ($1)", [migration.id]);
        });
        ran.push(migration.id);
    }
    return ran;
}

/** Splits on semicolons at line ends; the migrations above contain no semicolons inside statements. */
function splitStatements(sql: string): string[] {
    return sql
        .split(/;\s*(?:\n|$)/)
        .map(s => s.replace(/^\s*--.*$/gm, "").trim())
        .filter(Boolean);
}

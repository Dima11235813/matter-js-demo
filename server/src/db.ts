import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

/**
 * The little the API needs from Postgres. Two implementations: PGlite (Postgres compiled to WASM,
 * in-process) for local development and tests, so no Docker is needed; and `pg` for production.
 */
export interface Queryable {
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Db extends Queryable {
    readonly kind: "pglite" | "postgres";
    transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T>;
    close(): Promise<void>;
}

export async function createPgliteDb(dataDir?: string): Promise<Db> {
    const db = new PGlite(dataDir);
    await db.waitReady;
    return {
        kind: "pglite",
        query: (sql, params) => db.query(sql, params) as never,
        transaction: work => db.transaction(tx => work({ query: (sql, params) => tx.query(sql, params) as never })),
        close: () => db.close(),
    };
}

export function createPostgresDb(connectionString: string): Db {
    const pool = new pg.Pool({ connectionString, max: 5 });
    return {
        kind: "postgres",
        query: async (sql, params) => ({ rows: (await pool.query(sql, params as unknown[])).rows }),
        async transaction(work) {
            const client = await pool.connect();
            try {
                await client.query("BEGIN");
                const result = await work({ query: async (sql, params) => ({ rows: (await client.query(sql, params as unknown[])).rows }) });
                await client.query("COMMIT");
                return result;
            } catch (error) {
                await client.query("ROLLBACK");
                throw error;
            } finally {
                client.release();
            }
        },
        close: () => pool.end(),
    };
}

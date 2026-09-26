import os from "node:os";
import path from "node:path";

export interface ServerConfig {
    port: number;
    production: boolean;
    firebaseProjectId?: string;
    databaseUrl?: string;
    pgliteDataDir?: string;
    devAuthSecret?: string;
}

/** Reads configuration from the environment (secrets come from Secret Manager in production). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
    const production = env.NODE_ENV === "production";
    const devAuthSecret = env.DEV_AUTH_SECRET || undefined;
    if (production && devAuthSecret) {
        throw new Error("DEV_AUTH_SECRET must not be set in production: it would let anyone mint sign-in tokens");
    }
    if (devAuthSecret && devAuthSecret.length < 16) throw new Error("DEV_AUTH_SECRET must be at least 16 characters");
    const databaseUrl = env.DATABASE_URL || undefined;
    if (production && !databaseUrl) throw new Error("DATABASE_URL is required in production");
    return {
        port: Number(env.PORT || 8787),
        production,
        firebaseProjectId: env.FIREBASE_PROJECT_ID || undefined,
        databaseUrl,
        // Local data stays outside the Drive-synced repo (workspace rule): the OS temp dir by default.
        pgliteDataDir: databaseUrl ? undefined : env.PGLITE_DATA_DIR || path.join(os.tmpdir(), "lexical-fountain-pglite"),
        devAuthSecret,
    };
}

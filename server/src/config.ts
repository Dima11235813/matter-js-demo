import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";

export interface ServerConfig {
    port: number;
    production: boolean;
    firebaseProjectId?: string;
    databaseUrl?: string;
    pgliteDataDir?: string;
    devAuthSecret?: string;
    /** How dev sign-in got enabled (for the startup log): explicit secret, automatic local default, or off. */
    devAuthSource: "explicit" | "local-default" | "off";
    /** The built web app to serve (default: the repo's dist/). */
    staticDir?: string;
    /** Interface to listen on (default: all interfaces, which hosting proxies need). */
    host?: string;
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
    // Production without DATABASE_URL uses PGlite: on disk at PGLITE_DATA_DIR (outside the deploy folder,
    // so redeploys keep it), or in memory with a warning (sync data is lost on restart).
    if (production && !databaseUrl && !env.PGLITE_DATA_DIR) {
        console.warn("[config] No DATABASE_URL or PGLITE_DATA_DIR: accounts and sync use an in-memory database (lost on restart)");
    }
    // Local runs (not production, in-process database) accept dev sign-in tokens by default, so tests and
    // local play never need Google. A deployed server always has DATABASE_URL, so it never gets this
    // default, even if NODE_ENV were forgotten. DEV_AUTH=off turns it off locally.
    const localDefault = !production && !databaseUrl && env.DEV_AUTH !== "off" && !devAuthSecret;
    const effectiveDevSecret = devAuthSecret ?? (localDefault ? randomBytes(32).toString("hex") : undefined);
    return {
        // Local default: the workspace block 41940–41959 (ports.config.ts at the repo root); hosts set PORT.
        port: Number(env.PORT || 41941),
        production,
        firebaseProjectId: env.FIREBASE_PROJECT_ID || undefined,
        databaseUrl,
        // Local data stays outside the Drive-synced repo (workspace rule): the OS temp dir by default.
        pgliteDataDir: databaseUrl ? undefined : env.PGLITE_DATA_DIR || (production ? "memory://" : path.join(os.tmpdir(), "lexical-fountain-pglite")),
        devAuthSecret: effectiveDevSecret,
        devAuthSource: devAuthSecret ? "explicit" : localDefault ? "local-default" : "off",
        staticDir: env.STATIC_DIR || undefined,
        // Loopback locally (shared machine: never expose by accident); every interface in production.
        host: env.HOST || (production ? undefined : "127.0.0.1"),
    };
}

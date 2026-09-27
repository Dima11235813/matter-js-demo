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
    // Local runs (not production, in-process database) accept dev sign-in tokens by default, so tests and
    // local play never need Google. A deployed server always has DATABASE_URL, so it never gets this
    // default, even if NODE_ENV were forgotten. DEV_AUTH=off turns it off locally.
    const localDefault = !production && !databaseUrl && env.DEV_AUTH !== "off" && !devAuthSecret;
    const effectiveDevSecret = devAuthSecret ?? (localDefault ? randomBytes(32).toString("hex") : undefined);
    return {
        port: Number(env.PORT || 8787),
        production,
        firebaseProjectId: env.FIREBASE_PROJECT_ID || undefined,
        databaseUrl,
        // Local data stays outside the Drive-synced repo (workspace rule): the OS temp dir by default.
        pgliteDataDir: databaseUrl ? undefined : env.PGLITE_DATA_DIR || path.join(os.tmpdir(), "lexical-fountain-pglite"),
        devAuthSecret: effectiveDevSecret,
        devAuthSource: devAuthSecret ? "explicit" : localDefault ? "local-default" : "off",
    };
}

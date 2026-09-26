import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createVerifier } from "./auth";
import { loadConfig } from "./config";
import { createPgliteDb, createPostgresDb } from "./db";
import { migrate } from "./migrations";

// Local settings from server/.env.local, if present (never required; production uses real env vars).
try {
    process.loadEnvFile(new URL("../.env.local", import.meta.url));
} catch {
    // no local file: fine
}

const config = loadConfig();
const db = config.databaseUrl ? createPostgresDb(config.databaseUrl) : await createPgliteDb(config.pgliteDataDir);
const ran = await migrate(db);
const verifier = createVerifier({ firebaseProjectId: config.firebaseProjectId, devAuthSecret: config.devAuthSecret });
const app = createApp({ db, verifier });

serve({ fetch: app.fetch, port: config.port }, info => {
    console.log(`Lexical API on http://localhost:${info.port}/api/v1 · db=${db.kind}${config.pgliteDataDir ? ` (${config.pgliteDataDir})` : ""}`
        + ` · migrations applied: ${ran.length ? ran.join(", ") : "none"}`
        + ` · auth: ${[config.firebaseProjectId && `firebase:${config.firebaseProjectId}`, config.devAuthSecret && "dev-tokens"].filter(Boolean).join(", ") || "none (sign-in disabled)"}`);
});

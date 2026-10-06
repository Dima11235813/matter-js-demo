import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createVerifier } from "./auth";
import { loadConfig } from "./config";
import { createPgliteDb, createPostgresDb } from "./db";
import { migrate } from "./migrations";
import { webApp } from "./web";

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
const api = createApp({ db, verifier });

// The built web app (dist/) is served from the same origin when it exists (production hosting);
// in local development Vite serves the app and proxies /api here.
const distDir = config.staticDir ?? fileURLToPath(new URL("../../dist", import.meta.url));
const web = webApp(distDir);
const app = new Hono();
app.route("/", api);
if (web) app.route("/", web);

serve({ fetch: app.fetch, port: config.port, hostname: config.host }, info => {
    console.log(`Lexical on port ${info.port}: API /api/v1${web ? ` + web app (${distDir})` : ""} · db=${db.kind}${config.pgliteDataDir ? ` (${config.pgliteDataDir})` : ""}`
        + ` · migrations applied: ${ran.length ? ran.join(", ") : "none"}`
        + ` · auth: ${[config.firebaseProjectId && `firebase:${config.firebaseProjectId}`, config.devAuthSecret && `dev-tokens (${config.devAuthSource})`].filter(Boolean).join(", ") || "none (sign-in disabled)"}`);
});

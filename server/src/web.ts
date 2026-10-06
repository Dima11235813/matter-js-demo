import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { serveStatic } from "@hono/node-server/serve-static";

/**
 * Serves the built web app (Vite `dist/`) next to the API, so one Node process on one port runs the
 * whole site (SiteGround Node.js hosting starts `yarn start` and routes the domain to `PORT`). The
 * page calls the API same-origin at `/api/v1`, so nothing assumes localhost. Headers mirror
 * `public/_headers` (Cloudflare): hashed bundles cache for a year, the vocabulary revalidates.
 */
export function webApp(distDir: string): Hono | undefined {
    const indexFile = path.join(distDir, "index.html");
    if (!existsSync(indexFile)) return undefined;
    const indexHtml = readFileSync(indexFile, "utf8");
    const web = new Hono();
    web.use("*", compress());
    web.use("*", async (c, next) => {
        await next();
        c.header("X-Content-Type-Options", "nosniff");
        c.header("Referrer-Policy", "strict-origin-when-cross-origin");
        const p = c.req.path;
        if (p.startsWith("/assets/")) c.header("Cache-Control", "public, max-age=31536000, immutable");
        else if (p.startsWith("/vocab/") || p === "/" || p.endsWith(".html")) c.header("Cache-Control", "no-cache");
    });
    // Source maps are never published (the build keeps them out of dist; this is a second guard).
    web.get("*.map", c => c.notFound());
    web.get("*", serveStatic({ root: distDir }));
    // Single-page app: any other path without a file gets the app shell.
    web.get("*", c => c.html(indexHtml));
    return web;
}

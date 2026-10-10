/**
 * Local ports for this project: block 41940–41959, claimed in the workspace registry
 * (D:\GDrive\proj-mgmt\inventory\local-ports.md, 2026-10-10). The machine is shared by many projects:
 * never fall back to another port (servers start with strictPort), and bind 127.0.0.1 unless LAN
 * access is deliberate (`yarn dev --host 0.0.0.0` for the owner's phone play-tests, recorded in the
 * registry). Vite and Playwright read these; the API's default lives in server/src/config.ts.
 */
export const PORTS = {
    /** Vite dev server (the game, hot reload). */
    dev: 41940,
    /** The API (`yarn dev:server` / `yarn start:server`); Vite proxies /api to it. */
    api: 41941,
    /** `vite preview` of a build (CI-mode e2e serves the e2e bundle here). */
    preview: 41942,
    /** Local production check: `NODE_ENV=production PORT=41943 yarn start`. */
    production: 41943,
} as const;

export const LOCAL_HOST = "127.0.0.1";

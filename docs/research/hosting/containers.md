# Hosting slice: run the existing Node server unchanged (container PaaS or small VPS)

> Part of [hosting-options.md](../hosting-options.md) (round 2, 2026-10-10): one of three parallel deep dives, written by a research agent and reviewed before committing.

Date: 2026-10-10 · Scope: hosts that run `server/src/main.ts` as-is (one Node process: `dist/` + `/api` on `PORT`; PGlite on a disk, or Postgres via `DATABASE_URL`) · Read-only on the repo; one local measurement (below) · Complements `docs/research/hosting-options.md` (2026-10-10, Cloudflare recommended, Fly.io runner-up).

Provenance: vendor pages were read on 2026-10-10 through an automated page reader. **(unconfirmed)** marks numbers that came only from third-party pages or that the official page did not show. Re-check before paying.

## 1. What the server needs (measured today)

| Fact | Measurement / evidence | Consequence |
|---|---|---|
| Memory, server alone | `node --import tsx src/main.ts` (production, PGlite on disk, after 20 vocab + chunk downloads): **268 MB working set, 307 MB private** (Windows; Linux RSS likely similar or lower, unmeasured) | Needs a **512 MB** instance; 256 MB plans (Fly $2.19, Northflank nf-compute-10, Cloudflare Containers lite) will OOM |
| Memory via `yarn start` | `yarn start` → `yarn workspace` → `yarn run` → tsx CLI → server: 77 + 74 + 70 + 52 + 285 MB ≈ **560 MB** working set | **Do not use `yarn start` as the container command** on a 512 MB box (or on Railway, which bills used RAM). Start with `node --import tsx server/src/main.ts` (works from the repo root; `main.ts` resolves `dist/` from `import.meta.url`) |
| Start time | process start → first `/api/v1/health` 200: **0.86 s** (warm PGlite dir, desktop CPU) | Cold starts are dominated by the platform (machine boot / image pull), not the app; slower on 0.1 vCPU (unmeasured) |
| Static transfer | `vocab.bin` is served **uncompressed, 7,760,388 B** (Hono `compress()` skips `application/octet-stream`); JS chunks are gzipped on the fly (WorldContainer 307 KB gz) | The 12 MB/MAU model of `delivery-cicd.md` holds: ~0.25 GB/month now, **~12 GB at 1k MAU, ~120 GB at 10k** |
| Health check | `GET /api/v1/health` → `{"ok":true,"db":"pglite","devAuth":false}` | Use it as the platform health check and the deploy smoke test |
| Build | Repo has **no** Dockerfile, `.dockerignore`, `.nvmrc`/`.node-version`, `engines`, or `packageManager` field. `yarn build` runs `prebuild` (`build-vocab.mjs --if-missing`, which statically imports `@huggingface/transformers` → `onnxruntime-node`); CI instead runs `npx vite build` after `yarn install --frozen-lockfile --ignore-scripts` (DEP-03) | Every host must be told: Node 22, Yarn 1, install with `--ignore-scripts`, build with `npx vite build`, start with `node --import tsx server/src/main.ts`. Default Node on some PaaS is **not** 22 (Render 24.21.0 since 2026-09-17 [RD5]; Koyeb 20.x [KY4]; Railpack "lts" [RW5]) |
| Persistent state | `PGLITE_DATA_DIR` (disk) or `DATABASE_URL` (Postgres). Without either, production runs PGlite in memory with a warning (`config.ts`) | A host without volumes still works unchanged with Neon Free via `DATABASE_URL` |

## 2. Comparison table

Costs in USD/month, one always-on instance unless noted, 1 GB volume, traffic 0.25 / 12 / 120 GB for "0" / 1k / 10k monthly players. No custom-domain cost included.

| Host / plan | $ at 0 | $ at 1k | $ at 10k | Process + storage | Sleep / cold start | Bandwidth included | GitHub push-to-deploy | TLS + custom domain | Backups | Dockerfile? | Setup / upkeep |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Fly.io** shared-cpu-1x 512 MB + 1 GB volume [FL1] | **3.84** | **4.08** | **6.24** | Machine $3.69; volume $0.15/GB-month; volume on one host [FL2] | Always on by default; optional `auto_stop_machines = "suspend"` (no CPU/RAM billed while stopped/suspended [FL4]; resume time not published) | **none**; $0.02/GB NA/EU [FL1] | No native Git integration on the docs page; a CI job with `superfly/flyctl-actions` + `FLY_API_TOKEN` (`fly tokens create deploy`) [FL3] | Free shared IPv4; first 10 certs free [FL1] | Daily volume snapshots, 5 days default (1–60 configurable); first 10 GB free, then $0.08/GB [FL1][FL2] | **Yes** (write our own; `fly launch` can generate one, but not for a Yarn-1 workspaces repo with `--ignore-scripts`) | 2–4 h / ~0 (Dependabot for the base image) |
| **Railway** Hobby [RW1][RW2] | **5.00** | **5.00** | **~9.3** | Billed on **actual** usage: RAM $10/GB-mo, CPU $20/vCPU-mo, volume $0.15/GB; Hobby volume ≤ 5 GB; ~0.3 GB RAM ≈ $3 + CPU ≈ $0.2 + egress, inside the $5 credit until ~1–2k MAU | Optional Serverless: sleeps 5–10 min after last outbound packet; first request may 502 [RW3] | **none**; $0.05/GB [RW2] | **Yes**, native GitHub integration (dashboard) | Hobby: 2 custom domains, TLS automatic [RW1] | Volume backups daily (kept 6 d) / weekly (27 d) / monthly (89 d), billed as incremental volume storage [RW4] | **No** (Railpack detects Yarn workspaces and Node version from `engines`/`.node-version`/`RAILPACK_NODE_VERSION`; set build/start commands) [RW5] | 1–2 h / ~0 |
| Railway Free [RW1] | 0 (only if usage ≤ $1) | — | — | 0.5 GB RAM cap; 0.5 GB volume; ~0.3 GB RAM ≈ $3/month > $1 credit | Would need Serverless sleep to fit | — | Yes | **0 custom domains** | — | No | Not viable always-on |
| **Render** Starter + 1 GB disk, Hobby workspace | 7.25 | 8.30 | 24.50 | Starter $7, 512 MB, 0.5 CPU (unconfirmed [RD4]); disk $0.25/GB [RD3]; disks paid-only [RD2] | Paid: always on. **Disk ⇒ no zero-downtime deploys** (seconds of outage per deploy) [RD2] | Hobby **5 GB**, then $0.15/GB (cut from 100 GB on 2026-08-01 [RD4]) [RD1] | Yes, native | Yes, automatic TLS | Disk snapshot every 24 h, kept ≥ 7 days [RD2] | No (native Node runtime; set `NODE_VERSION=22`) [RD5] | 1–2 h / ~0 |
| Render Free + Neon Free | 0 | 1.05 | 17.25 | No disks on Free → `DATABASE_URL` to Neon [RD6] | **Spins down after 15 min; ~1 min to wake** [RD6] | 5 GB then $0.15/GB | Yes | Yes | Neon 6-h restore window [NE1] | No | 2 h / ~0; the 1-minute wake rules it out for phone play |
| **Koyeb** Free instance + Neon Free | **0** | **0** | **0.80** | 512 MB, **0.1 vCPU**, 2 GB SSD, Frankfurt or Washington [KY1]; **volumes not allowed on free/eco** and are "public preview… only suitable for testing" [KY3] → `DATABASE_URL` | Free scales to zero after **1 h idle**, cannot be disabled; deep-sleep cold start **1–5 s** [KY2] | **100 GB free**, then $0.04/GB [KY1] | Yes, native Git deploys | Custom domains on free (unconfirmed) | Neon 6-h restore window [NE1] | No (buildpack; default Node 20.x → set `engines`) [KY4] | 2–3 h / low; 0.1 vCPU + on-the-fly gzip + PGlite-free path unmeasured |
| Koyeb paid (Pro) | 29+ | 29+ | 29+ | Pro $29/month incl. $10 compute [KY5] | — | 100 GB | Yes | Yes | Volume snapshots (preview) | No | Too expensive for this scale |
| Northflank pay-as-you-go nf-compute-20 + volume | ~6.0 | ~6.7 | ~13.2 | 0.2 vCPU / 512 MB $5.40 [NF1]; volume $0.15/GB (minimum size 4 GB per product page, unconfirmed) | Always on | none stated; $0.06/GB [NF1] | Yes (Git integration) | Yes | Volume backups (price unconfirmed) | Dockerfile or buildpack | 2–3 h / ~0 |
| Northflank Developer Sandbox | 0 | 0? | ? | 2 services, 1 addon (DB), always on, "no sleeping" [NF1]; free compute size "Limited" (unconfirmed; if 256 MB it will OOM) | None | unconfirmed | Yes | Yes | — | Dockerfile or buildpack | **Card required for all plans; "should not be used for production"** [NF2] |
| DigitalOcean App Platform $5 + Neon Free | 5.00 | 5.00 | 6.40 | 1 shared vCPU / 512 MiB, **no volumes listed** → `DATABASE_URL` (or DO dev DB $7 → $12) [DO1] | Always on | **50 GiB**, then $0.02/GiB [DO1] | Yes, native | Yes | Neon 6 h | No (buildpack) | 1–2 h / ~0 |
| DigitalOcean Droplet 1 GB + weekly backups | 7.20 | 7.20 | 7.20 | $6: 1 vCPU, 1 GiB, 25 GiB SSD (the $4 / 512 MiB plan is too tight with an OS) [DO2] | Always on | **1,000 GiB**, then $0.01/GiB [DO2][DO3] | Via Coolify/Dokploy or an SSH deploy job | Caddy/Coolify (Let's Encrypt) | +20% weekly / +30% daily [DO2] | Coolify/Dokploy can build without one (Nixpacks) | 4–8 h / 1–2 h per month (OS, Node, firewall) |
| **Hetzner CX23** + backups (+ Coolify or Dokploy, self-hosted free) | ~7.7 (€7.09) | ~7.7 | ~7.7 | 2 vCPU, 4 GB, 40 GB NVMe, **€5.49 + €0.50 IPv4** (€5.99, Aug 2026 [HZ3]); price rise 2026-06-15 [HZ1]. **EU only**: US CPX11 is now $20.49 [HZ1] | Always on | **20 TB** (EU) [HZ3] | Coolify GitHub App or Dokploy webhook | Coolify/Dokploy/Caddy automate Let's Encrypt | 7 backup slots [HZ2]; +20% of server price (unconfirmed) | No (Nixpacks/Railpack in Coolify) | 4–8 h / 1–2 h per month. Coolify needs ≥ 2 CPU, 2 GB RAM, 10 GB disk [CO2]; Coolify Cloud $5/month if you don't want to host the panel [CO1]; Dokploy Cloud $4.50/server [DK1] |
| Oracle Cloud Always Free (A1) | 0 | 0 | 0 | 2 OCPU / 12 GB A1 (halved 2026-06-15, documentation-only change [OC2]), 200 GB block, 10 TB egress [OC1] | Always on, **but idle instances (p95 CPU < 20%, network < 20%, memory < 20% over 7 days) may be reclaimed** [OC1]: exactly this app's profile | 10 TB [OC1] | As VPS | As VPS | 5 volume backups free [OC1] | As VPS | 6–10 h / high + reclamation risk. Card at sign-up (unconfirmed) |
| Cloudflare Containers (2025–26 newcomer) | ~5 | ~5 | ~5 | Workers Paid $5 incl. 375 vCPU-min, 25 GiB-h memory [CC1]; **disk ephemeral** (fresh disk after sleep) [CC2] → Neon | Sleeps after a timeout; cold start "often 1–3 s" [CC2] | 1 TB NA/EU [CC1] | Via the existing `wrangler deploy` job | Yes | Neon | **Yes** + a Worker entry routing to the container | Not "unchanged": needs a Worker shim; a 512 MB-class instance (`basic`, 1 GiB) would exceed the 25 GiB-h memory allowance if kept awake (~720 GiB-h/month) → billed overage |
| Sevalla / Zeabur (2026 options) | from 5 / 5 + own server | — | — | Sevalla app hosting "from $5", free trial, specs not on page [SV1]; Zeabur Dev $5/month manages **your own** servers [ZB1] | — | — | Yes | Yes | — | — | Not better than Railway/Fly; not investigated further |

## 3. Cost model notes

* **Fly.io** = $3.69 (512 MB machine, `iad`/`ewr` price [FL1]) + $0.15 (1 GB volume) + $0.02/GB egress: 0.25 GB → $3.84; 12 GB → $4.08; 120 GB → $6.24. Snapshots are free under 10 GB. No minimum bill and no monthly free allowance for new orgs; the trial is 2 machine-hours or 7 days; card required [FL1]. With `auto_stop_machines = "suspend"` and `min_machines_running = 0`, idle hours cost only the volume (+ rootfs $0.15/GB) [FL1][FL4], so family-scale use could fall to ~$1–2 (unmeasured; resume latency not published).
* **Railway Hobby** = $5 subscription that includes $5 of usage, billed per second on resources the service **actually uses** [RW1]. Estimate with the measured ~0.3 GB RAM: RAM $3.00 + CPU ~$0.20 (idle) + volume $0.08 + egress $0.05/GB → $3.3 (0), $3.9 (1k), $9.3 (10k, 120 GB × $0.05 = $6). Bill = max($5, usage). If the start command were `yarn start` (~0.56 GB measured), RAM alone would be ~$5.6/month.
* **Render**: $7 + $0.25 + (GB − 5) × $0.15. **10k costs $24.50**, the worst bandwidth curve here.
* **Koyeb Free + Neon Free**: $0 until 100 GB/month, then $0.04/GB. Neon Free: 100 CU-hours/month, suspends after 5 min idle, 6-hour restore window [NE1]. The server's 30 s sync poll keeps Neon awake while anyone is signed in (see hosting-options.md §3.3).
* **VPS** (Hetzner, DO Droplet): flat; bandwidth is irrelevant at any of these scales. You pay in hours instead.
* **Domain**: optional, ~$10.46/year for `.com` at Cloudflare Registrar (third-party figure, from hosting-options.md [DM1]).
* **Cheaper egress trick (any PaaS)**: put the custom domain on Cloudflare DNS with the proxy on. `/assets/*` is `immutable` and would be served from Cloudflare's cache, cutting origin egress; `vocab.bin` is `no-cache` (revalidates, 304s are tiny). Unmeasured; also hides the origin region's latency for static files.

## 4. Does each host need a Dockerfile? (Yarn 1 workspaces, Node 22)

| Host | Builder | Needs Dockerfile? | What must be configured |
|---|---|---|---|
| Fly.io | Docker image (remote builder via `fly deploy --remote-only`) [FL3] | **Yes** | See the sketch below |
| Railway | Railpack: detects Yarn 1 from `yarn.lock`, workspaces from `workspaces`, Node from `RAILPACK_NODE_VERSION` / `engines` / `.nvmrc` / `.node-version` (default `lts`); start = root `start` script unless overridden [RW5] | No | Build: `yarn install --frozen-lockfile --ignore-scripts && npx vite build` (overriding install to keep `--ignore-scripts` is possible via a custom build/install command; exact Railpack variable for Yarn unconfirmed); start: `node --import tsx server/src/main.ts`; `RAILPACK_NODE_VERSION=22`; volume at `/data`, `PGLITE_DATA_DIR=/data/pglite`. Config-as-code in `railway.json` (optional) |
| Render | Native Node runtime [RD5] | No | `NODE_VERSION=22` (default is 24.21.0 for services created after 2026-09-17); build and start commands as above; disk mount `/data` |
| Koyeb | Buildpack (Node detected from `package.json`; default **20.x**) [KY4] | No (Dockerfile optional) | `engines.node` = `22.x` (or a Dockerfile); `DATABASE_URL` |
| DO App Platform | Buildpack | No | `engines`; `DATABASE_URL` |
| Northflank | Buildpack or Dockerfile | Optional | As Koyeb |
| VPS + Coolify/Dokploy | Nixpacks/Railpack or Dockerfile | Optional | As Railway; a persistent volume mapping |

**Dockerfile sketch** (Fly, or anywhere; deploys the **exact `dist` artifact CI already e2e-tested**, as the current `deploy-production` job does for Cloudflare):

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json yarn.lock ./
COPY packages/shared/package.json packages/shared/
COPY server/package.json server/
# Yarn 1 ships with the node image; no install scripts (DEP-03); production deps only
RUN yarn install --frozen-lockfile --ignore-scripts --production --non-interactive && yarn cache clean
COPY packages/shared packages/shared
COPY server server
COPY dist dist            # the CI artifact (dist/ is gitignored; .dockerignore must NOT exclude it)
ENV PORT=8080 PGLITE_DATA_DIR=/data/pglite
EXPOSE 8080
CMD ["node", "--import", "tsx", "server/src/main.ts"]
```

Caveat: Yarn 1 cannot install one workspace's dependencies alone, so `--production` still installs the web app's runtime dependencies (`@huggingface/transformers` → `onnxruntime-node`, firebase, three, MUI; p5 was removed the same day, Epic 4 · Task 4.5.7). The image will be several hundred MB (unmeasured, no Docker on this machine). Acceptable on Fly/Railway; an optional later improvement is bundling the server with esbuild (`pglite` and `pg` external) into one file. `tsx` and `@lexical/shared` (TypeScript source, no build step) must stay in the image because the server runs TypeScript directly.

## 5. Recommendation within this slice

1. **Fly.io, one 512 MB machine + 1 GB volume: ~$3.84 / $4.08 / $6.24** (0 / 1k / 10k). Cheapest always-on option that keeps PGlite on a disk with daily snapshots, egress at $0.02/GB (the cheapest metered rate here), global anycast, free TLS. Costs: a Dockerfile and a CI deploy job (it fits the existing "deploy the tested artifact from CI" model, and replaces only the wrangler step). Risks: no free tier and a card from day one; the volume lives on one host (data since the last daily snapshot can be lost [FL2]); single region for the 7.4 MB vocabulary (mitigate with Cloudflare proxy on a custom domain).
2. **Railway Hobby: $5 / $5 / ~$9.** Least effort: no Dockerfile, native GitHub deploys, volume backups with daily/weekly/monthly schedules, 2 custom domains. Risks: deploys from GitHub on push, which bypasses "deploy only what CI e2e-tested" unless gated (Railway's wait-for-CI behaviour unconfirmed; alternative: deploy via `railway up` from CI with a token); billing is usage-based, so the start command must avoid the yarn wrapper chain; a redeploy with a volume has brief downtime [RW6].

**$0 variant without code changes**: Koyeb Free + Neon Free (`DATABASE_URL`), $0 up to 100 GB/month. Not first choice because it scales to zero after an hour (1–5 s cold start for the first phone visit), has 0.1 vCPU (gzip of 1.2 MB chunks per request, unmeasured), and moves accounts into a second service (Neon).

**Rejected in this slice**: Render (worst bandwidth curve, $24.50 at 10k; free tier wakes in ~1 min; disk blocks zero-downtime deploys), Koyeb paid ($29 floor), Northflank (card + "not for production" free tier; paid ~$6 with no edge over Fly), DO App Platform (no volumes; fine at $5 with Neon, but then Koyeb Free does the same for $0), Hetzner/DO Droplet (flat ~$7–8 but we become the sysadmin; Hetzner's cheap plans are EU-only, conflicting with decision D3 "United States" for data), Oracle Always Free (idle reclamation targets exactly this workload; silent limit cuts), Cloudflare Containers (ephemeral disk, needs a Worker shim, memory allowance too small to keep a 1 GiB instance awake).

## 6. Repo changes per option (none made)

* **Fly.io**: new `Dockerfile`, `.dockerignore` (exclude `node_modules`, `.git`, `dist-e2e`, `tests`, `docs`, `data`, `scratch`, `.env*`, `public/vocab` source copies are fine to exclude since `dist/vocab` carries them; keep `dist`), `fly.toml` (`app`, `primary_region = "iad"`, `[http_service] internal_port = 8080, force_https = true, auto_stop_machines = "off"|"suspend"`, `[[mounts]] source = "pglite", destination = "/data"`, `[env] NODE_ENV/PGLITE_DATA_DIR/FIREBASE_PROJECT_ID`, `[checks]` on `/api/v1/health`); `.github/workflows/ci.yml` `deploy-production`: download the `dist` artifact, `superfly/flyctl-actions/setup-flyctl` (pin SHA), `flyctl deploy --remote-only` with `FLY_API_TOKEN` as a `production` environment secret, smoke test against `https://<app>.fly.dev` (page, `vocab.bin`, `/api/v1/health` with `devAuth:false`); `.github/dependabot.yml` docker ecosystem; docs: `docs/setup/accounts-and-deploy.md`, a human-todo item (Fly account, card, `fly volumes create`, token), Epic 7 Task 7.6.3. `wrangler.jsonc` and `public/_headers` stay (Cloudflare option kept).
* **Railway**: optional `railway.json` (build command, start command, health check path, watch paths), `engines.node: "22.x"` or `.node-version` (would also fix Render/Koyeb defaults), docs + human-todo; CI deploy step only if we choose `railway up` from CI instead of Railway's GitHub integration.
* **Both**: no change to `server/src/*`; `server/.env.example` already lists the variables.

## 7. How this compares with hosting-options.md (Cloudflare recommendation)

* Cloudflare Workers static is **$0 at 0/1k/10k** and is already wired (`wrangler.jsonc`, `_headers`, deploy job); nothing here beats it on cost, CDN delivery of the 7.4 MB vocabulary, or zero cold starts.
* What this slice buys for ~$4–6 (Fly) or ~$5–9 (Railway): **sign-in, sync, export and delete run today with zero server code changes** (PGlite on a volume), whereas Cloudflare Phase 2 needs a Worker entry, a PGlite-free DB module, migrations moved to CI, Neon + Hyperdrive, and a CPU-per-request check against the 10 ms Free limit.
* A middle path: Cloudflare static now ($0), and if sign-in opens before the Worker port is done, run the unchanged server on Fly (~$4) behind a `run_worker_first: ["/api/*"]` Worker route that proxies to it (same origin, small Worker, no DB port). This is the same shape as the original D1 plan with Fly instead of Cloud Run.

## 8. Unconfirmed / limitations

* Memory and start time measured on Windows with a desktop CPU; Linux RSS and startup on 0.1–0.5 shared vCPU were not measured. No host was tried; Docker image size not measured.
* Render Starter price/specs and the 2026-08-01 plan change come from third-party pages [RD4]; Render's pricing page did not render.
* Hetzner backup price (20%) and the €5.99 total come from third-party sources; Hetzner's own page did not show prices.
* Koyeb volume price, free custom domains; Northflank free compute size and volume minimum; Oracle card requirement; Fly suspend/resume latency; Railway "wait for CI" and Railpack install-command override for Yarn: not confirmed.
* Fly has historically waived invoices under $5; the current pricing page lists **no** waiver, so none is assumed.

## Sources (read 2026-10-10)

* [FL1] Fly.io pricing: https://docs.fly.io/about/pricing
* [FL2] Fly.io volume snapshots: https://docs.fly.io/volumes/snapshots
* [FL3] Fly.io GitHub Actions deploys: https://docs.fly.io/launch/continuous-deployment-with-github-actions
* [FL4] Fly.io autostop/autostart: https://docs.fly.io/launch/autostop-autostart
* [RW1] Railway pricing page (actual-usage billing, plans, custom domains): https://railway.com/pricing
* [RW2] Railway pricing reference (rates, volume limits, trial): https://docs.railway.com/reference/pricing · plans: https://docs.railway.com/pricing/plans · bill: https://docs.railway.com/pricing/understanding-your-bill
* [RW3] Railway app sleeping: https://docs.railway.com/reference/app-sleeping
* [RW4] Railway backups: https://docs.railway.com/reference/backups
* [RW5] Railpack Node (versions, Yarn, workspaces, start detection): https://railpack.com/languages/node · Railway monorepo guide: https://docs.railway.com/guides/monorepo
* [RW6] Railway volumes (downtime on redeploy, no replicas): https://docs.railway.com/reference/volumes
* [RD1] Render outbound bandwidth (Hobby 5 GB, $0.15/GB): https://render.com/docs/outbound-bandwidth
* [RD2] Render disks (paid only, daily snapshots ≥ 7 days, no zero-downtime deploys): https://render.com/docs/disks
* [RD3] Render article, 2026-07-08 (disk $0.25/GB, plan fees): https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses
* [RD4] Third party, 2026-08-06 (2026-08-01 plan change, Starter $7 / 512 MB / 0.5 CPU, Postgres $6): https://jwatte.com/blog/render-com-platform-review.md
* [RD5] Render Node version (default 24.21.0 since 2026-09-17): https://render.com/docs/node-version
* [RD6] Render free tier (15-min spin-down, ~1 min wake, no disks, Postgres expires 30 d): https://render.com/docs/free
* [KY1] Koyeb pricing FAQ (updated 2026-05-27; free instance, 100 GB bandwidth): https://www.koyeb.com/docs/faq/pricing
* [KY2] Koyeb scale-to-zero (free: 1 h idle; deep sleep 1–5 s): https://www.koyeb.com/docs/run-and-scale/scale-to-zero
* [KY3] Koyeb volumes (preview, not on free/eco): https://www.koyeb.com/docs/reference/volumes
* [KY4] Koyeb Node.js builds (default 20.x): https://www.koyeb.com/docs/build-and-deploy/build-from-git/nodejs
* [KY5] Koyeb pricing page (Pro $29, Mistral AI acquisition banner): https://www.koyeb.com/pricing
* [NF1] Northflank pricing: https://northflank.com/pricing
* [NF2] Northflank billing docs (card required; sandbox not for production): https://northflank.com/docs/v1/application/billing/pricing-on-northflank
* [DO1] DigitalOcean App Platform pricing (verified 2026-07-13): https://docs.digitalocean.com/products/app-platform/details/pricing/
* [DO2] DigitalOcean Droplet pricing: https://www.digitalocean.com/pricing/droplets
* [DO3] DigitalOcean bandwidth billing ($0.01/GiB): https://docs.digitalocean.com/platform/billing/bandwidth/
* [HZ1] Hetzner price adjustment 2026-06-15 (official): https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/
* [HZ2] Hetzner backups (7 slots): https://docs.hetzner.com/cloud/servers/backups-snapshots/overview/
* [HZ3] Cloud pricing comparison, August 2026 (third party; CX23 €5.99 incl. IPv4, 20 TB): https://kimmo.suominen.com/stuff/cpc-2026-08.txt
* [CO1] Coolify pricing: https://coolify.io/pricing · [CO2] Coolify requirements: https://coolify.io/docs/get-started/installation
* [DK1] Dokploy pricing: https://dokploy.com/pricing
* [OC1] Oracle Always Free resources: https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm
* [OC2] InfoQ, 2026-07-03, Always Free cut: https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/
* [CC1] Cloudflare Containers pricing (updated 2026-10-05): https://developers.cloudflare.com/containers/pricing/
* [CC2] Cloudflare Containers FAQ (ephemeral disk, 1–3 s cold start): https://developers.cloudflare.com/containers/faq/
* [SV1] Sevalla pricing: https://sevalla.com/pricing/ · [ZB1] Zeabur pricing: https://zeabur.com/pricing
* [NE1] Neon pricing (via hosting-options.md, read 2026-10-10): https://neon.com/pricing

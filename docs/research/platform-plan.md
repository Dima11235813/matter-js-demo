# Platform Plan: From Local Game to Public Launch with Research Telemetry

**Status**: research complete, decisions pending (§5) · **Date**: 2026-09-25 · **Drives**: [Epic 6 (accounts and privacy)](../../proj-mgmt/epic-6-accounts-privacy.md), [Epic 3 (backend)](../../proj-mgmt/epic-3-enterprise-architecture.md), [Epic 7 (delivery and operations)](../../proj-mgmt/epic-7-delivery-operations.md)

**Sources**: three delegated research reports (each with its own sources and "(verify)" price flags):
* [accounts-auth.md](accounts-auth.md)
* [backend-sync-telemetry.md](backend-sync-telemetry.md)
* [delivery-cicd.md](delivery-cicd.md)

This page reconciles them into one plan. It adds no new research.

## 1. Goal

Get people playing publicly, and collect their plays (with consent) to learn which analogies work and how molecules form. Anonymous play must keep working; accounts are optional. Cost must stay near zero until there are players. Everything must meet the workspace security standards: secrets only in GCP Secret Manager, short-lived credentials, no credentials in the Drive-synced tree.

## 2. Combined recommendation

| Layer | Choice | Why | Fallback |
|---|---|---|---|
| Hosting | **Cloudflare Workers static assets**, with PR previews from preview aliases | $0 at 100k MAU (~1.2 TB/month of vocabulary and bundles). A Worker can serve `/api/*` on the same origin. | Firebase Hosting + Cloud Run (all GCP, keyless deploys, ~$16–180/month in bandwidth) |
| API | A thin TypeScript API (**Hono**, zod, `jose`) on **GCP Cloud Run**, reached via the Worker at `/api/*` (same origin, so `sendBeacon` and cookies need no CORS) | Research questions are SQL questions. GCP matches Secret Manager and short-lived IAM credentials. Hono also runs on Workers if edge latency ever matters. | The API inside the Worker, with Hyperdrive to Postgres |
| Database | **Postgres** (Cloud SQL shared-core with IAM login, ~$10/month; or Neon at $0–5) | Sync tables plus play events partitioned by month; nightly Parquet copies to GCS so DuckDB can analyse them | Supabase Pro, if its Auth were chosen |
| Accounts | **Firebase Authentication / Identity Platform** (Google and email-link sign-in, popup flow); tokens verified by the API through JWKS | Native to GCP; $0 up to 50k signed-in MAU; the best documented anonymous-to-account flow | Supabase Auth; Better Auth as the self-hosted exit |
| Bot protection | Cloudflare Turnstile for the ingest session token; per-`researchId` rate limits; Cloud Run `max-instances` | Free; no puzzle for real players | Firebase App Check |
| CI/CD | **GitHub Actions**: typecheck, unit tests, vocabulary build (cached, later an immutable release file), production build and guards, e2e against a production-like build, preview and production deploys | Free on a public repo | Cloudflare Workers Builds (no deploy token at all) |
| Monitoring | Sentry (upgraded to v11, only when a DSN is configured, releases and source maps), UptimeRobot, Cloudflare Web Analytics, Dependabot, CodeQL, `audit-ci` | Free tiers | — |

**Where the reports disagreed, and how it's resolved:**
* **Firestore vs Postgres for synced data.** The auth report assumed Firestore; the backend report shows research queries need SQL, and Firestore's own offline cache would duplicate IndexedDB. Resolution: **Firebase Auth, with the data in Postgres behind the Cloud Run API.** The Firestore-specific steps in the auth report's Phase 1 are replaced by the backend report's sync API.
* **Hosting: Firebase Hosting vs Cloudflare.** The backend report chose Firebase Hosting for its `/api` rewrite; the delivery report chose Cloudflare for $0 bandwidth. A Worker route proxying `/api/*` to Cloud Run gives the same same-origin API at $0. The cost is one long-lived, narrowly scoped Cloudflare deploy token (Cloudflare has no OIDC for deploys yet), stored in Secret Manager with a 90-day expiry. **Decision D1.**

**Cost**:

| Stage | Monthly cost |
|---|---|
| Before any backend | ~$1–2 (domain, Secret Manager) |
| With ingest and sync, 10k MAU | ~$10–50 |
| 100k MAU | ~$50–100 |

The database and Sentry dominate these figures, not hosting.

## 3. What the current code must change before any data leaves the device

Both the auth and backend reports found these independently:

1. **Counters would lose points in a sync.** `profile.score` and `analogies.timesPlayed` are plain numbers, so merging two devices by "last writer wins" loses offline plays. Make them per-device counters (`{deviceId: n}`, summed), or derive the score from `games`. Migrations are cheap now and painful after sync exists.
2. **Normalized keys.** Words are already lowercased and trimmed (`normalizeWord`). Add Unicode NFC, and use the same function for every key, including `a:b::c`.
3. **Identity records.** Add a local `meta` store:
   * `deviceSecret`: random; proves ownership of `deviceId` when an account claims the device.
   * `accountUid`: set after sign-in.
   * `consent`: `{policyVersion, grantedAt, scopes}`.
   * `ageBand`: only the band and a timestamp, never a birth date.
4. **Play log to upload envelope.** The shipped log (`playEvents`, schema 1, UUIDv4 ids) stays the local source of truth. At upload time the sender:
   * adds `researchId` (minted at consent, never the device or user id) and a per-session `clientSeq`;
   * redacts player-added (out-of-vocabulary) words to `<oov>`;
   * keeps the event id for server-side deduplication.

   UUIDv7 for new events is optional: the server can partition by `occurredAt`.
5. **Local "export all my data" and "erase this device"**, next to the play-log download. These become the GDPR export and deletion paths later.

## 4. The path to public launch

Each stage ends with tests and a measured number, per the working agreements.

| Stage | What ships | Epics | Cost |
|---|---|---|---|
| **A. Local hardening** | The §3 fixes. Consent store and prompt (nothing is sent yet). Neutral age screen before any sign-in or upload offer. Privacy notice draft. **CI on PRs** (Epic 7 Phase 0): the workflow, `REQUIRE_VOCAB`, an e2e build mode, and a guard that the dev handle never reaches production. | 6, 7 | $0 |
| **B. Public static launch** | Domain, Cloudflare hosting, PR previews, cache headers (`vocab.bin` renamed with its content hash so it can be cached forever), Sentry v11 per environment, uptime and analytics monitoring, and a decision on the unused 22.5 MiB wasm file. | 7, 4 | ~$1–2 |
| **C. Research telemetry** | Cloud Run `api` with Turnstile session tokens, `POST /v1/events`, consent events, research deletion. Postgres play events partitioned by month; nightly Parquet copy; a research experiment that runs the report's queries on real plays. | 3, 6 | ~$0–12 |
| **D. Accounts and sync** | Firebase Auth; claim-on-sign-in with device proof; `sync/push` and `sync/pull` with the merge rules from the backend report §3.3; export and delete endpoints; Content Security Policy. | 6, 3 | + ~$0 |
| **E. Competitive and social** | Server-dealt timed rounds re-scored on the server (so leaderboards can't be forged), leaderboards, saved views (thumbnails uploaded directly to storage), URL import in an isolated fetch service with SSRF guards, molecule research. | 2, 3, 5 | ~$35–70 at 100k |

## 5. Decisions needed (product owner)

| # | Decision | Recommendation | Why it matters |
|---|---|---|---|
| D1 | Hosting: Cloudflare Workers + a Worker `/api` proxy to Cloud Run, **or** all-GCP Firebase Hosting | Cloudflare | $0 vs ~$16–180/month; one long-lived, narrowly scoped Cloudflare token vs fully keyless deploys |
| D2 | Database: Cloud SQL (~$10, IAM login) **or** Neon ($0–5, password in Secret Manager) | Cloud SQL once telemetry ships; Neon is fine before that | Workspace preference for short-lived credentials |
| D3 | Region: EU (`europe-west1`) or US | Decide before stage C | Moving personal data later is painful |
| D4 | Commercial ever (ads, payments)? Domain name? | — | Affects the privacy policy and CCPA; the domain is needed in stage B |
| D5 | Age policy: neutral age screen, local-only play for under-13s (US) and under the local consent age (EU) | Yes, before stage C | The largest legal exposure is minors' identifiers |
| D6 | May player-added (out-of-vocabulary) words ever reach research data? | Never (default); maybe opt-in later | Re-identification risk |
| D7 | Who are the researchers: you only (DuckDB on Parquet) or collaborators (BigQuery)? | You only, for now | Storage and access design |
| D8 | Retention periods: raw events 6 months, Parquet 24 months, inactive accounts 24 months | As proposed | Needed for the privacy notice |
| D9 | Self-host the model and ORT wasm instead of Hugging Face and jsdelivr | Later (stage B decision) | Privacy (third parties see player IPs), reliability, CSP breadth |
| D10 | Public PR previews, or behind Cloudflare Access? | Public with `noindex` | Convenience vs exposure |

## 6. Workspace follow-ups (cross-project; not changed without the owner's approval)

* `D:\GDrive\proj-mgmt\inventory\technology-assets.md` doesn't list this project. Add it once hosting is live.
* `secrets-inventory.md` must list, as they are created: the Cloudflare deploy token, the Sentry release token, the Turnstile secret, the ingest HMAC key, the export HMAC key, and the database credentials (none if IAM).
* The hard-coded Sentry DSN in `src/index.tsx` is not a secret (DSNs only allow sending events). Still, issue a fresh key with allowed domains and a rate limit when Sentry is reconfigured.

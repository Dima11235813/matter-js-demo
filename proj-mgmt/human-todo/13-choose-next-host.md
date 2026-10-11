# 13. Choose the next host (decisions H1–H5) ☐

**Why**: nothing is deployed since SiteGround was dropped (2026-10-09). The research is done: [hosting-options.md](../../docs/research/hosting-options.md) §4b (round 2, 2026-10-10), with a cost table for 0, 1k, and 10k players on every path. Epic 7 · Task 7.6.3 waits on these answers.

**Decide** (reply with the numbers, e.g. "H1 yes, H2 route B, H3 yes, H4 as recommended, H5 yes"):

| # | Decision | Recommendation |
|---|---|---|
| H1 | Host for the game now | **Cloudflare Workers static assets**: $0, no code; about 1 h of your setup (items 4 and 5) |
| H2 | Where the deploy token lives | Route B (GitHub environment secret, an approved exception) for less effort, or route A (GCP Secret Manager, keyless; item 3) as documented |
| H3 | Phase 2 (sign-in and sync) | **API in the same Worker + Neon via Hyperdrive** (agent ~1–1.5 days); fallback: a proxy Worker to the unchanged server on Fly.io (~$4/month) |
| H4 | When sign-in opens publicly | After the Worker port passes the deploy smoke test and a two-phone sync check (item 6) |
| H5 | Sync cadence | **Change-driven sync** (Epic 7 · Task 7.6.4) before sign-in opens publicly; keeps Neon and Workers free longer on any host |

**Rejected, for the record**: Firebase Hosting (bandwidth billed and uncappable on the Blaze plan).

**Unblocks**: the Phase 1 deploy (items 4, 5, then the agent's smoke test and a phone play-test against the live URL); the Phase 2 plan.

**Done when**: H1–H5 are answered here or in the session, and Task 7.6.3 records the decision.

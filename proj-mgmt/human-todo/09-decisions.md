# 9. Open product decisions ☐

Recommendations and reasons: [docs/research/platform-plan.md §5](../../docs/research/platform-plan.md). Already decided: D1 hosting (Cloudflare + Cloud Run), D3 region (US), D5 age question (yes).

* ☐ **D2 Database** for the server: Cloud SQL (~$10/month, no password: IAM login) or Neon ($0–5, a password in Secret Manager). *Recommended: Neon until there are players, Cloud SQL once research telemetry ships.*
* ☐ **D4** Will the game ever be commercial (ads, payments)? And the **domain name** (the workers.dev URL works until then).
* ☐ **D6** May player-added words ever reach research data? *Recommended: never (default).*
* ☐ **D7** Researchers: only you (DuckDB on files) or collaborators (BigQuery)? *Recommended: only you for now.*
* ☐ **D8** Retention periods (see item 7).
* ☐ **D9** Self-host the language model and its runtime instead of Hugging Face and jsDelivr (privacy and reliability vs. bandwidth)? *Decide at the public launch.*
* ☐ **D10** Pull-request previews public or behind a login? *Recommended: public with noindex.*
* ☐ **Personas & rating** (Epic 2 · Feature 2.12): confirm the idea (rating from designed-play outcomes sets the puzzle difficulty band) before it's built.

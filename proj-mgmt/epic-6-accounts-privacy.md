# Epic 6: Accounts, Consent & Privacy

## 📋 Overview
Optional accounts on top of local-first play, and the privacy engineering that lets real players' plays be collected for research: consent, pseudonymous research ids, age screening, export, and deletion. Anonymous play keeps working with nothing leaving the device. Driven by [docs/research/platform-plan.md](../docs/research/platform-plan.md) and [accounts-auth.md](../docs/research/accounts-auth.md). The backend side (sync API, telemetry ingest) is in [Epic 3](epic-3-enterprise-architecture.md); hosting and CI are in [Epic 7](epic-7-delivery-operations.md).

### Decisions (2026-09-25; D1 hosting = Cloudflare + Cloud Run, D3 region = US, D5 age screen = yes, decided by the user; the rest in platform-plan.md §5)
* **Auth provider**: Firebase Authentication / Identity Platform (Google + email-link sign-in, popup flow, custom `authDomain`). Anonymous players get **no** provider account: they stay local until they choose to sign in, which keeps auth billing to people who create accounts.
* **Three ids, three purposes**:
  * `deviceId`: exists today; used for sync provenance.
  * `researchId`: minted at consent; used for telemetry only.
  * `userId`: our own id, mapped to the provider uid, so we can change provider later.

  Research data joins identity only through a restricted `research_links` table, and only for deletion and export.
* **Consent is separate from sign-in**: research telemetry is opt-in, off by default, and withdrawable in one click. Signing in never implies it.
* **Age**: a neutral birth-year screen before any sign-in or telemetry offer, not before play. Under-13s (US) or under the local consent age (EU) get local-only play. Only the age band is stored.

---

## 🛠️ Features, Stories & Tasks

### Feature 6.1: Local Identity & Data-Model Fixes (Stage A · before any data leaves the device)
* **Story 6.1.1**: *As a player on two devices, I want my points and play counts to add up after syncing, never to be lost or doubled.*
  * [x] **Task 6.1.1.1** (2026-09-25): Per-device counters: `profile.scoreByDevice` and `analogies.playsByDevice` (`src/persistence/counters.ts`: increment only this device's entry, max-merge per device, total = sum; decrements rejected, because a shrinking entry would break the merge). `score` and `timesPlayed` stay as derived totals for readers. The IndexedDB v4 migration credits existing totals to the device that recorded them. Tests: two devices playing offline and syncing in either order lose and double nothing (commutative, idempotent, associative with stale copies). On the real dev database, the score of 1,516 and all 15 analogies (20 plays) migrated intact.
  * [x] **Task 6.1.1.2** (2026-09-25): `src/persistence/keys.ts` `normalizeKey` (trim, lowercase, NFC) used by `normalizeWord` and `analogyKey`. The v4 migration re-keys analogies and merges the play counts of keys that collide. A test caught a bug in the first version: it ignored the counts of a colliding record that had not been migrated yet, and worked from a stale snapshot.
* **Story 6.1.2**: *As a developer, I want the identity records in place now, so accounts and consent don't need schema churn later.*
  * [x] **Task 6.1.2.1** (2026-09-25): The v4 `meta` store holds the device record: `deviceSecret` (32 random bytes, created once, never shown), `accountUid`, `consent {policyVersion, grantedAt, scopes, researchId}`, `ageBand {band, at}`, and `consentPromptDismissedAt`. It is never synced.

### Feature 6.2: Consent, Age Screen & Privacy Notice (Stage A)
* **Story 6.2.1**: *As a player, I want to choose whether my plays help research, and change my mind any time.*
  * [ ] **Task 6.2.1.1**: A MobX `ConsentStore`. The event sender is only created once consent exists, so the gate is enforced by how the code is built, not by flag checks.
  * [ ] **Task 6.2.1.2**: A dismissible prompt after the first finished round, plus a Settings toggle; withdrawal drops queued events and offers "also delete what I sent". Plays from before consent stay local unless "include my earlier plays" is ticked.
* **Story 6.2.2**: *As an operator, I don't want to collect children's identifiers without the consent the law requires.*
  * [ ] **Task 6.2.2.1**: A neutral age screen ("What year were you born?", no default), shown before sign-in or a telemetry offer. It stores the band only, and has a short cooldown before a retry with a different year.
* [ ] **Task 6.2.3**: Privacy notice: processors, what is collected, retention (decision D8), rights, contact. Reviewed before real players' data is collected.

### Feature 6.3: Local Export & Erase (Stage A)
* [~] **Task 6.3.1**: "Download my play log" ✅ (Epic 2 · Task 2.11.5). ⬜ "Export all my data": words, analogies, games, profile, plays, as one JSON (the future GDPR export format).
* [ ] **Task 6.3.2**: "Erase this device": clear every store, with confirmation. Important on shared or school computers.

### Feature 6.4: Sign-in & Claim (Stage D)
* **Story 6.4.1**: *As a player who played anonymously for weeks, I want to sign in and keep everything, on this device and the next.*
  * [ ] **Task 6.4.1.1**: Firebase project on Blaze with Identity Platform; Google + email link; custom `authDomain`; popup flow (tested on Safari iOS); a budget alert. The client talks to an `AuthService` interface, so the provider can be swapped.
  * [ ] **Task 6.4.1.2**: Claim on sign-in: `POST /devices/claim {deviceId, deviceSecret}`; local records re-stamped `pending` and pushed; the server merges them (Epic 3 · Feature 3.7).
  * [ ] **Task 6.4.1.3**: A device already bound to another account is never merged silently: "switch account (keep / clear this device's data)".
  * [ ] **Task 6.4.1.4**: Sign-out keeps local data by default; "remove my data from this device" is offered.
* **Story 6.4.2**: *As a player, my session should be safe.*
  * [ ] **Task 6.4.2.1**: Content Security Policy (report-only first; then enforced): `script-src 'self'` plus the auth SDK origins; never render player text as HTML.
  * [ ] **Task 6.4.2.2**: "Sign out everywhere" (`revokeRefreshTokens`); sensitive endpoints (export, delete) verify tokens with the revocation check (`checkRevoked`).

### Feature 6.5: Data Rights (Stage D)
* [ ] **Task 6.5.1**: `GET /me/export`: the same format as the local export, plus the server copy of the user's research events.
* [ ] **Task 6.5.2**: `DELETE /me`: the account, sync data, games, leaderboard entries, and research events linked to the account's research ids. Also a deletion ledger, which the Parquet archive job honours. A receipt is shown to the player; the target is completion within 30 days.
* [ ] **Task 6.5.3**: "Delete my research data" for anonymous players, authenticated by `researchId` + `deviceSecret`.

### Feature 6.6: Later
* [ ] **Task 6.6.1** (roadmap): Passkeys. Firebase has none natively in 2026. The options: wait, federate an OIDC passkey provider, or migrate auth. A migration stays cheap because there are no passwords and data is keyed by our own `userId`.
* [ ] **Task 6.6.2** (roadmap): Sign in with Apple (needs the $99/yr Apple Developer Program), when players ask or an iOS wrapper exists.

**Exit criteria (Stage D)**: two devices converge with no lost points (property-based merge tests); claim-flow e2e test; export matches the local format; deletion reaches the Parquet copies (verified by the ledger); sign-in works on Chrome, Firefox, and Safari iOS with third-party storage blocked.

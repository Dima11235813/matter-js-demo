# Research: user authentication for Lexical Fountain

> **Provenance**: researched 2026-09-25 by a delegated research agent (web search plus official pricing and docs pages; no code was run). Prices marked **(verify)** were not read from an official page, and even the rest came through an automated page reader, so re-check every price before spending money. The combined recommendation and the decisions it needs are in [platform-plan.md](platform-plan.md).


Date: 2026-09-25. Status: decision-ready draft. Scope: auth only, plus the sync, security, and privacy decisions that auth forces.

How this was researched: web search, plus fetches of the official pricing and docs pages listed under Sources. Prices marked **(verify)** could not be read from an official page (the page was truncated, or the figure came from a third-party article). Figures read from official pages came through an automated page summarizer, so re-read them before committing money. No repository files were modified.

---

## 1. Question

Lexical Fountain is a React 18 + Vite SPA. It stores data local-first in IndexedDB (`src/persistence/db.ts`). Every record carries `createdAt/updatedAt/syncState/deviceId`, and each store has a natural merge key: `words` by the word, `analogies` by `a:b::c`, `games` by a random id, `profile` as the singleton `"local"`. There is no backend.

**What should we use to add optional accounts?** The accounts should enable cross-device sync, pseudonymous research attribution, and later leaderboards and saved views. Anonymous local play must keep working. Cost must stay low at 0–10k MAU and be reasonable at 100k. The design must be GDPR/CCPA-ready and handle the possibility of child players.

Constraints from the workspace: GCP leaning (Secret Manager is the vault, Google OAuth clients already exist), a solo developer, secrets only through env or a vault, short-lived scoped tokens preferred.

---

## 2. Options compared

### 2.1 Summary table

| | **Firebase Auth / Google Identity Platform** | **Supabase Auth** | **Clerk** | **Auth0 (Okta)** | **AWS Cognito** | **Better Auth (self-hosted)** |
|---|---|---|---|---|---|---|
| Google / Apple / email magic link | Yes / Yes / Yes (email link; needs Blaze for >5 link emails/day) | Yes / Yes / Yes (needs custom SMTP in prod: the default SMTP sends 2 emails/hour) | Yes / Yes / Yes | Yes / Yes / Yes (passwordless on Free) | Yes / Yes / Yes (email OTP/passwordless in Essentials) | Yes (social providers) / Yes / Yes (magic-link plugin) |
| Passkeys | **No native passkeys.** Available only through third-party Extensions (Extensions shut down 2027-03-31) or an OIDC passkey provider billed at the Tier-2 rate | Yes, **beta** (announced 2026-05-28, experimental opt-in) | Yes, **Pro plan only** (not on Free) | Yes, included on all B2C tiers including Free | Yes, Essentials tier | Yes (`@better-auth/passkey` plugin) |
| Native anonymous users | **Yes** (`signInAnonymously`) | **Yes** (`signInAnonymously`, `is_anonymous` JWT claim) | **Not found in docs** (verify). Guests would stay local | **No native feature.** Community threads describe custom workarounds | Only as **identity-pool guest identities** (AWS credentials), not user-pool users | **Yes** (anonymous plugin) |
| Upgrade anonymous → real account, keeping data | **Same uid kept** via `linkWithPopup/linkWithCredential`. If the credential already belongs to another account, linking fails with `auth/credential-already-in-use` and the app must merge | **Same user id kept** via `linkIdentity()` (OAuth) or `updateUser()` (email). Manual linking must be enabled. Conflicts are the app's job | n/a | Account linking exists (Actions / Management API), but there is no anonymous user to link | The identity pool keeps the identity id and "profile data is merged automatically" (Cognito Sync era) | **A new user id is created.** The `onLinkAccount({anonymousUser,newUser})` hook moves the data, and the anonymous user is deleted by default |
| SPA integration | JS SDK, popup/redirect via `authDomain`. `signInWithRedirect` breaks under third-party-storage blocking unless `authDomain` = your domain (or you use a popup/proxy). The default persistence is `LOCAL` (survives restarts) | `supabase-js`, PKCE via `flowType:'pkce'`. The session is in `localStorage` by default (custom storage adapter supported) | Prebuilt React components. Short-lived (60 s) `__session` token plus a long-lived `__client` cookie on a CNAME'd Frontend API subdomain | `auth0-spa-js`: Auth Code + PKCE, in-memory token cache by default, refresh-token rotation | Amplify / hosted "managed login" | Your own server. SPA on a different origin needs the cross-domain/bearer setup |
| Tokens / refresh | ID token 1 h. Long-lived refresh token, revocable with Admin `revokeRefreshTokens`, checked with `verifyIdToken(checkRevoked)` | JWT 1 h default. **Single-use refresh tokens with reuse detection** (10 s grace). `signOut({scope:'global'\|'local'\|'others'})` | 60 s token refreshed every 50 s | Rotation with reuse detection | Standard OIDC refresh | Session cookie. JWT plugin with a JWKS endpoint for services |
| Price @10k MAU | **$0** (50k MAU free on Spark and Blaze; Spark also caps Tier-1 at 3,000 DAU, so plan on Blaze) | **$0 on Free**, but **Free projects pause after 1 week of inactivity**. Realistically **$25/mo Pro** | **$0** (Free: 50k MRU per app, no passkeys/MFA, Clerk branding) | **$0** (Free: up to 25k MAU). Paid Essentials is **$700/mo at 10k** | **$0** (Lite/Essentials: 10k MAU free, no expiry) | $0 licence. Hosting ≈ Cloud Run (scale to zero) + Postgres (Cloud SQL from **$9.37/mo**, or Neon free tier (verify)) + an email provider |
| Price @100k MAU | ≈ **$275/mo**: 50k × $0.0055 on the tier above 50k (verify; rate from a third-party snippet, the official Identity Platform page did not load). **Anonymous users stop counting once auto-cleanup is enabled** | **$25/mo** (Pro includes 100k MAU, then $0.00325/MAU) + compute. **Anonymous users count as MAU** | ≈ **$1,025/mo**: $25 Pro + 50k × $0.02 MRU. Counts only *retained* users (return ≥1 day after sign-up) | **Contact sales** (self-serve B2C tiers stop at 30k–50k) | Lite ≈ **$495/mo** (90k × $0.0055). Essentials (passkeys) ≈ **$1,350/mo** (90k × $0.015) | Same infra, bigger instance. Roughly tens of $/mo (verify by load test) |
| Lock-in / export | Medium. `firebase auth:export` (includes password hashes (verify)). With social + email-link only, there are no passwords to migrate, and lock-in is mostly the uid ↔ provider mapping | Low. Users live in your own Postgres `auth` schema. Supabase is open source and self-hostable | Medium. Dashboard CSV export includes password hashes | Medium. bcrypt hashes exportable (Management API / extension) | **High.** Cognito cannot export password hashes (just-in-time migration only) | **None.** Your DB, your code |
| GCP fit | **Native** (same project, IAM, Secret Manager, Cloud Run, Firestore, Cloud SQL / SQL Connect) | Neutral (hosted on AWS; can accept Firebase JWTs as "third-party auth") | Neutral | Neutral | Poor (AWS) | Good (runs on Cloud Run + Cloud SQL) |
| Pairs with backend | Firestore security rules on `request.auth.uid`; SQL Connect `@auth` directives on Cloud SQL Postgres; Admin SDK `verifyIdToken` in Cloud Run/Functions. **Supabase can also accept Firebase JWTs for Postgres RLS** (needs a `role: authenticated` custom claim) | **Postgres RLS** on `auth.uid()` / `auth.jwt()`. Asymmetric signing keys (ES256/RS256) with a JWKS at `/auth/v1/.well-known/jwks.json` let serverless verify locally | Networkless JWT verification. Official Supabase / Firebase-style integrations | JWKS verification | JWKS verification | Your server is the backend. JWKS for other services |

Other 2026 status notes:
- **Lucia is deprecated.** Its maintainers deprecated it in March 2025, and it is now a learning resource for writing session auth yourself, not a library to adopt.
- **Auth.js (NextAuth) joined Better Auth on 2025-09-22.** It is in security-patch-only maintenance, and new projects are pointed to Better Auth.
- **Firebase Extensions (the platform) shuts down on 2027-03-31.** Installed extensions keep running but can no longer be installed, updated, or uninstalled. Do not build on extension-based passkeys or the "Delete User Data" extension.
- **Firebase Dynamic Links shut down on 2025-08-25.** Email-link sign-in still works with current SDKs by using `linkDomain` / a Hosting custom domain.
- **Firebase Data Connect is now "SQL Connect".** It is Postgres on Cloud SQL, with 250k free operations/month, then $0.90 per million, plus the Cloud SQL instance (from $9.37/mo after a 3-month trial).
- **Not evaluated in depth:** Ory, Keycloak, Zitadel, Logto, SuperTokens. They are viable self-host/OSS alternatives, but none has a clear advantage over Better Auth or Firebase for this app.

### 2.2 Reading the table for this app

- **Anonymous play does not need a provider anonymous user at all.** The app is already local-first, with a `deviceId` on every record. A provider-side anonymous user only matters if we want server-side data (cloud backup or telemetry) *before* sign-in. In that case, only Firebase, Supabase, and Better Auth support it natively. Firebase and Supabase keep the same user id on upgrade; Better Auth creates a new id and gives us a hook to move the data.
- **Cost at our scale is dominated by who counts as an MAU.** Firebase stops counting anonymous users once auto-cleanup is enabled. Supabase counts them. Clerk counts only retained users. Keeping guests purely local, with no provider account, makes every option $0 at 10k signed-in MAU. Supabase is the exception: its Free plan pauses after a week without activity, which is not acceptable for a public game.
- **Passkeys are the one area where Firebase is weak.** It has no native support in 2026, and the extension route dies in 2027. Supabase (beta), Auth0, Cognito Essentials, Clerk Pro, and Better Auth have them.

---

## 3. The anonymous-to-account flow

### 3.1 What the providers give you natively

- **Firebase:** `signInAnonymously()` then later `linkWithPopup(GoogleAuthProvider)` keeps the uid, so server data keyed by uid carries over. If the Google account is already an account (the second-device case), linking fails with `auth/credential-already-in-use`. The documented fix is app-level: save the anonymous user's data, sign in with the credential, merge, and restore on failure. **Auto-cleanup** (Identity Platform) deletes anonymous accounts *older than 30 days*. Linked accounts are not deleted, and anonymous users then stop counting toward billing. Whether "older than 30 days" means age or inactivity was **not confirmed** (verify). Assume age.
- **Supabase:** `signInAnonymously()` then `linkIdentity()` (OAuth) or `updateUser({email})` keeps the user id. Manual linking must be enabled. The docs say conflicts (the email already belongs to another user) are the app's decision: overwrite either side, or merge. RLS can tell guests apart with the `is_anonymous` claim.
- **Better Auth:** on sign-in from an anonymous session, `onLinkAccount({anonymousUser, newUser})` fires. The new user has a new id, and the anonymous user is deleted unless `disableDeleteAnonymousUser` is set. A 2026 bug where the hook didn't fire after email verification was fixed in PR #9548.
- **Cognito identity pools:** guest identities keep the identity id when an IdP login is added. This is designed for AWS resource access, not app data.
- **Clerk / Auth0:** no native anonymous users. Guests stay local, and the claim happens at first sign-in.

### 3.2 Recommended design (provider-independent)

Because every record is already on the device, **the merge happens client-side from the local store, not server-to-server.** This is the main payoff of local-first, and it makes the provider's linking features a convenience rather than a requirement.

1. **Identities.**
   - `installId`: the existing `deviceId`, a random UUID per browser profile.
   - `accountUid`: the provider uid, stored in a local `meta` record once signed in.
   - `researchId`: a random UUID minted **only when the player consents to telemetry**. It is never the uid or the email. The uid → researchId mapping is stored server-side in an access-restricted table, so research data is pseudonymous.
2. **Claim on sign-in.** When a device signs in and has no `accountUid`:
   - set `accountUid`;
   - pull the account's remote records;
   - merge them with local records using the rules below;
   - push the merged set, marking records `synced`.
   A later schema version can add an `ownerUid` field. Unclaimed records have none, which means "claim me".
3. **Conflict rules per store**, using the natural keys already in `db.ts`:
   - `games`: immutable, unique random ids. **Union**, never conflicts.
   - `words`: keyed by word. **Union.** On collision, keep the earlier `createdAt`, and prefer the vector whose `model/dtype` matches the current model. Vectors can be recomputed, so this is low-stakes.
   - `analogies`: keyed by `a:b::c`. `timesPlayed` must not be merged by max or naive sum. Two devices that each sync and then play again would double-count or lose plays. Store **per-device counters** (`timesPlayedByDevice: {deviceId: n}`, a grow-only counter) and derive the total. `answer/similarity/vocabVersion` are recomputable: last-writer-wins by `updatedAt`.
   - `profile.score`: same problem. Either derive the score from `games` (preferred, and auditable for leaderboards) or use per-device counters. UI settings (`hintMode`, `dimension`): last-writer-wins by `updatedAt`, or keep them device-local.
   - Play-event log: append-only, keyed by event UUID. **Union.**
4. **Device already bound to a different account.** If `accountUid` is set and differs from the uid that just signed in, **do not auto-merge.** Offer "switch account (keep other account's data on this device / remove it)". Never merge two real accounts silently.
5. **Sign-out.** Keep local data by default so the game still works offline. Offer "Remove my data from this device" (important on shared or school computers). Anonymous play after sign-out starts from a clean local profile.
6. **Clocks.** Last-writer-wins by client `updatedAt` is vulnerable to skewed device clocks. Acceptable for settings; never use it for scores. Leaderboard scores must be recomputed server-side from submitted games (see Risks).

If we later adopt **Firebase anonymous auth** for pre-sign-in cloud telemetry:
- Same device: `linkWithPopup` keeps the uid, so the telemetry stays attributed.
- Second device: `credential-already-in-use` → before switching, capture the anonymous user's ID token (valid 1 h). Sign in to the existing account, upload local records as in step 2, then call a server function that verifies **both** tokens and reassigns the anonymous uid's server rows to the account. Auto-cleanup then removes the orphaned anonymous user.

---

## 4. SPA security

- **Flow.** RFC 10017 (OAuth 2.0 for Browser-Based Applications, BCP 212, published 2026) says:
  - use Authorization Code + PKCE and never the implicit flow;
  - the most secure architecture is a **backend-for-frontend (BFF)** that keeps tokens out of the browser behind a secure cookie;
  - a token-mediating backend is a middle ground.

  Firebase's and Clerk's SDKs manage their own flows. With Supabase, set `flowType:'pkce'`.
- **Token storage trade-offs:**
  - **Memory only:** the best XSS posture, but the session is lost on reload unless there is a refresh cookie or silent re-auth. `auth0-spa-js` defaults to memory.
  - **localStorage / IndexedDB:** Supabase uses `localStorage` by default, and Firebase `LOCAL` persistence survives restarts. Any XSS can read the refresh token, so the attacker gets a long-lived session.
  - **HttpOnly cookie via a BFF:** XSS cannot read the token (it can still act *as* the user while the page is open). This adds **CSRF**: use `SameSite=Lax/Strict`, check `Origin`, and use CSRF tokens for state-changing requests.
  - Bearer tokens sent in an `Authorization` header are not auto-attached by the browser, so they carry **no CSRF risk**.
- **Recommendation for this app.** The account protects low-value data: game progress, no payments. A BFF is not justified in Phase 1. Accept SDK-managed browser storage and invest in **XSS prevention**:
  - a strict CSP (no inline script; `script-src 'self'` plus the auth SDK origins; consider Trusted Types);
  - no third-party analytics scripts;
  - never render player-added words or pasted text as HTML (no `dangerouslySetInnerHTML`; canvas/p5 text is safe).

  Revisit a BFF if payments or anything valuable is ever attached to accounts.
- **Refresh and revocation:**
  - **Firebase:** 1 h ID tokens and long-lived refresh tokens. Deleting, disabling, or changing credentials revokes them. **Sign out everywhere** = Admin `revokeRefreshTokens(uid)`. Already-issued ID tokens stay valid for up to 1 h unless the server calls `verifyIdToken(token, true)` (checkRevoked, one extra round trip). Use that on sensitive endpoints: delete account, export.
  - **Supabase:** rotating single-use refresh tokens with reuse detection revoke the whole session family on reuse. `signOut()` defaults to **global** (all devices), so use `{scope:'local'}` for the normal button. Access JWTs cannot be revoked before expiry.
  - **Auth0:** rotation with reuse detection.
- **Rate limiting and bots:**
  - Firebase caps new-account creation at **100 accounts/hour per IP** and email-link sends at 5/day on Spark (25k/day on Blaze).
  - Supabase applies 30 anonymous sign-ins/hour per IP by default, and its docs **strongly recommend CAPTCHA/Turnstile for anonymous sign-ins**.
  - **Cloudflare Turnstile** is free with no published request cap.
  - On GCP, Firebase **App Check** (reCAPTCHA Enterprise) can gate Firestore/Functions. App Check's enforcement coverage for Auth endpoints and reCAPTCHA pricing were not verified (verify).
  - Identity Platform **blocking functions** can reject disposable-email sign-ups.
  - Put per-uid write quotas in the sync endpoint or rules, for example a maximum number of events per minute.

---

## 5. Privacy and age

Not legal advice. The minimum reasonable launch posture is below.

**EU/UK (GDPR + ePrivacy):**
- **Separate consent for telemetry.** Gameplay data in IndexedDB is strictly necessary for the service the player asked for. Reading play events from the device and sending them to a server for research is covered by ePrivacy Art. 5(3). The EDPB's Guidelines 2/2023 (adopted Oct 2024) explicitly bring "local processing where information is transferred outside the user's device" into scope. So:
  - opt-in and off by default;
  - separate from sign-in (signing in must not imply research consent);
  - withdrawable in one click;
  - store `{consentVersion, grantedAt}` with the researchId.

  Accounts and sync rest on *contract*; research telemetry rests on *consent*.
- **Data subject rights:** access and portability (a JSON export of all the user's records; the app already has everything locally), erasure (delete account + server rows + telemetry linked to their researchId), within one month. Build these as callable server functions, **not** the Firebase "Delete User Data" extension, which is caught in the Extensions shutdown.
- **Retention:** publish it. For example, delete inactive accounts after N months, keep raw telemetry for M months before aggregation, and remove orphaned anonymous users (Firebase auto-cleanup at 30 days).
- **Privacy notice:** list processors (Google/Firebase, the email provider) and international transfer grounds. Google's DPA and EU–US Data Privacy Framework status were not verified here (verify).

**US:**
- **CCPA/CPRA** applies to for-profit businesses above $26.625M revenue, *or* those that buy/sell/share personal information of 100k+ CA consumers, *or* that earn ≥50% of revenue from selling/sharing data. A solo non-commercial game is very likely below all three (verify with counsel). Offering export and deletion anyway costs little, because we need it for GDPR.

**Age (the big one for a word game):**
- **COPPA:** the amended Rule was published 2025-04-22, effective 2025-06-23, with **compliance required by 2026-04-22**. It adds a written retention policy, a ban on indefinite retention, and separate parental consent for third-party disclosure.
  - A general-audience site is covered on **actual knowledge** of an under-13 user.
  - A "mixed audience" site must use a **neutral age screen**: ask "What is your date/year of birth?", not "Are you over 13?", with no default age.
  - A persistent identifier (our `installId`/`researchId`) sent to a server for anything beyond internal operations counts as personal information. **Telemetry from under-13s therefore needs verifiable parental consent.**
- **GDPR Art. 8:** the age of digital consent is 16 by default, and member states may lower it to 13–16. Country values vary (verify per country). Below it, consent-based processing needs parental authorisation.
- **Practical gate:** show a neutral birth-year prompt **before** offering sign-in or telemetry, not before play.
  - Under 13 (US), or under the local consent age (EU), gets **local-only play**: no account, no telemetry, nothing leaves the device.
  - Store only the result (an age band plus a timestamp), not the birth date.
  - Don't let a player immediately retry with a different year (a short cooldown is common practice).

  UK players are also covered by the ICO Children's Code (high-privacy defaults for under-18s) (verify applicability).

---

## 6. Recommendation and phased plan

**Recommendation:**
- **Auth:** Firebase Authentication, upgraded to Identity Platform on the Blaze plan. Sign-in methods: Google + email link. Use the popup flow, or set `authDomain` to our own Hosting domain.
- **Data:** a GCP backend (Firestore for per-user sync; Cloud Run/Functions for merges, export, deletion, and later leaderboards). Secrets stay in Secret Manager.
- **Anonymous players stay local** (no provider account) until they choose to sign in.
- **Keep the design portable:** the client talks to a small `AuthService`/`SyncService` interface, and server data is keyed by our own `userId`, which maps to the provider uid.

Why:
- It is native to the GCP workspace and the existing Google OAuth setup: one project, IAM, Secret Manager.
- It costs $0 through 50k signed-in MAU and ≈$275/mo at 100k (verify). Anonymous users are free with cleanup.
- It has the best-documented anonymous → linked flow if we later want pre-sign-in cloud data.
- Firestore rules on `request.auth.uid` mean Phase 1 needs very little server code.

**Runner-up: Supabase (Pro, $25/mo).** Choose it instead if passkeys or relational queries with Postgres RLS matter more than GCP nativeness. It has anonymous users, same-id linking, rotating refresh tokens, passkeys (beta), and a flat $25 for 100k MAU. Budget for custom SMTP, and CAPTCHA on anonymous sign-ins.

**Not recommended:**
- **Clerk:** no anonymous users; passkeys are paywalled; ~$1k/mo at 100k.
- **Auth0:** $700/mo at 10k MAU once off Free; sales-only at 100k.
- **Cognito:** AWS; hashes not exportable.
- **Better Auth:** best lock-in story, but a solo developer would own an internet-facing auth server. Keep it as the exit path if Firebase ever becomes a problem.

### Phase 0: anonymous + local only (now)
- Keep `deviceId` as `installId`. Add a local `meta` store (`accountUid`, `consent`, `ageGate`), so no schema churn is needed later.
- Change `analogies.timesPlayed` and `profile.score` to per-device counters, or make score derived from `games`, **before** any sync exists. Migrations are cheap now and painful later.
- Add a local **Export my data (JSON)** and **Erase local data** in settings. This is the future GDPR export, already done.
- Add the neutral age screen and the telemetry consent UI (stored locally; nothing is sent yet). Write the privacy notice.
- Ship publicly as a static site. No auth means no auth risk.

### Phase 1: sign-in + sync
Status: design only. Nothing from this phase has been built, measured, or tested yet.
1. Firebase project on Blaze with Identity Platform. Custom `authDomain` on our domain. Google sign-in + email link. App Check (reCAPTCHA Enterprise). CSP.
2. Claim-on-sign-in and merge rules (Section 3.2), behind `SyncService`. Unit-test the merge rules with two simulated devices.
3. Firestore layout: `users/{uid}/words|analogies|games|profile`, with rules `request.auth.uid == uid`. Batch the play-event log into per-session documents, to stay inside the free 20k writes/day.
4. Callable functions (verifying ID tokens, with `checkRevoked`) for: export, delete account (data, then `auth.deleteUser`), and sign out everywhere (`revokeRefreshTokens`).
5. Telemetry only for consenting, age-cleared players, keyed by `researchId`. The uid → researchId map lives in a separate server-only collection. Optional later: Firebase anonymous auth for consenting guests (with auto-cleanup), using the reassign function from Section 3.2.
6. Numbers to record in the epic:
   - sign-in-to-first-sync latency;
   - merge correctness on two devices;
   - Firestore reads/writes per session, against the free quota.

### Later
- **Leaderboards:** server-recomputed scores from submitted `games` (`rulesVersion`, `hintMode` separated). Never trust a client-sent total. A Cloud Run endpoint writes the leaderboard collection; clients read only.
- **Passkeys:** Firebase has no native passkeys. Options, in order:
  1. wait for native support (monitor);
  2. an OIDC passkey provider federated into Identity Platform (Tier-2 billing $0.015/MAU after 50) (verify);
  3. migrate auth to Supabase or Better Auth. That migration is feasible because accounts are social/email-link only (no password hashes) and our data is keyed by our own `userId`.
- **Sign in with Apple:** needs the $99/yr Apple Developer Program. Defer until players ask, or until an iOS wrapper exists.
- **Saved views:** just another synced store under the same rules.

---

## 7. Risks and open questions

**Risks:**
1. **Passkeys gap on Firebase.** This is the main strategic risk of the recommendation. It is mitigated by passwordless-only sign-in and our own `userId` indirection.
2. **Redirect sign-in breakage** under third-party-storage blocking (Chrome 115+, Firefox 109+, Safari 16.1+). Use a popup, or set `authDomain` to our own domain. Test on Safari iOS before launch.
3. **Counter merges.** If `timesPlayed`/`score` stay as plain numbers, multi-device sync will double-count or lose plays. Fix this in Phase 0.
4. **XSS = account takeover** while tokens live in browser storage. Needs a CSP and no HTML rendering of user text.
5. **Minors.** Collecting identifiers from under-13s without parental consent is the largest legal exposure. The age gate must come before any network telemetry.
6. **Firestore write costs from the event log** at 10k+ MAU if events are written one per play. Batch them, or move them to BigQuery via a Cloud Run ingestion endpoint.
7. **Free-tier traps.** Firebase Spark caps Tier-1 auth at 3,000 DAU and email links at 5/day, so use Blaze with budget alerts. Supabase Free pauses after 1 week.
8. **Google Drive workspace.** Never put service-account keys or `.env` secrets in the synced repo. Use Secret Manager and Workload Identity for CI.

**Open questions (verify):**
- Identity Platform per-MAU rates above 50k: the official page did not render; the figures ($0.0055 / $0.0046 / $0.0032) come from third-party sources.
- Does Firebase auto-cleanup measure 30 days from creation or from last activity?
- Does `firebase auth:export` include password hashes? (Irrelevant if we never enable passwords.)
- App Check enforcement coverage for Auth endpoints, and the reCAPTCHA Enterprise free allowance.
- Does Clerk now offer native anonymous/guest users? None was found in its docs.
- The GDPR Art. 8 consent age per target country, plus UK Children's Code applicability. Get a lawyer's read before targeting schools.
- Is research telemetry going to an academic partner? If so, ethics approval and data-sharing terms change the consent text.

---

## 8. Sources

Pricing and plans (official pages unless noted):
- Firebase pricing: https://firebase.google.com/pricing
- Identity Platform pricing (page did not render for extraction): https://cloud.google.com/identity-platform/pricing
- Tier rates (third-party, verify): https://blog.logto.io/firebase-authentication-pricing · https://www.metacto.com/blogs/the-complete-guide-to-firebase-auth-costs-setup-integration-and-maintenance
- Firebase Auth limits (100 accounts/h/IP, Spark 3,000 DAU, email-link quotas): https://firebase.google.com/docs/auth/limits
- Supabase pricing: https://supabase.com/pricing
- Supabase free project pausing: https://supabase.com/docs/guides/platform/free-project-pausing
- Supabase MAU counting incl. anonymous: https://github.com/orgs/supabase/discussions/35933 · https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users
- Clerk pricing: https://clerk.com/pricing
- Auth0 pricing: https://auth0.com/pricing
- AWS Cognito pricing: https://aws.amazon.com/cognito/pricing/
- Firebase SQL Connect pricing (formerly Data Connect): https://firebase.google.com/docs/sql-connect/pricing
- Neon free plan (verify): https://neon.com/pricing
- Cloudflare Turnstile free: https://blog.cloudflare.com/turnstile-ga/ · https://www.cloudflare.com/products/turnstile/
- Apple Developer Program ($99/yr): https://developer.apple.com/programs/

Anonymous users and linking:
- Firebase anonymous auth (web) and auto-cleanup: https://firebase.google.com/docs/auth/web/anonymous-auth
- Firebase account linking and merge: https://firebase.google.com/docs/auth/web/account-linking
- Firebase anonymous best practices: https://firebase.blog/posts/2023/07/best-practices-for-anonymous-authentication/
- Supabase anonymous sign-ins: https://supabase.com/docs/guides/auth/auth-anonymous
- Supabase identity linking: https://supabase.com/docs/guides/auth/auth-identity-linking
- Better Auth anonymous plugin: https://better-auth.com/docs/plugins/anonymous · bug fix: https://github.com/better-auth/better-auth/pull/9548
- Cognito guest → authenticated: https://docs.aws.amazon.com/cognito/latest/developerguide/switching-identities.html
- Auth0 anonymous users (community, no native feature): https://community.auth0.com/t/anonymous-users/65009 · linking: https://auth0.com/docs/users/user-account-linking/link-user-accounts

Passkeys and status of libraries:
- Supabase passkeys beta: https://supabase.com/changelog/46458-passkeys-for-supabase-auth-beta · https://supabase.com/docs/guides/auth/passkeys
- Firebase passkeys via extensions only: https://extensions.dev/extensions/gavinsawyer/firebase-web-authn · feature request: https://github.com/firebase/firebase-ios-sdk/issues/11548
- Firebase Extensions shutdown FAQ: https://firebase.google.com/docs/extensions/faq-and-troubleshooting
- Better Auth passkey / magic link / JWT plugins: https://better-auth.com/docs/plugins/passkey · https://better-auth.com/docs/plugins/magic-link · https://better-auth.com/docs/plugins/jwt
- Lucia deprecation: https://github.com/lucia-auth/lucia/discussions/1714 · https://lucia-auth.com/
- Auth.js joins Better Auth (secondary): https://www.wisp.blog/blog/lucia-auth-is-dead-whats-next-for-auth · https://dev.to/pipipi-dev/nextauthjs-to-better-auth-why-i-switched-auth-libraries-31h3
- Firebase Dynamic Links shutdown / email link: https://firebase.google.com/support/dynamic-links-faq · https://firebase.google.com/docs/auth/web/email-link-auth

SPA security and sessions:
- RFC 10017, OAuth 2.0 for Browser-Based Applications (BCP 212): https://www.rfc-editor.org/info/rfc10017/ · https://oauth.net/2/browser-based-apps/
- Firebase redirect best practices (third-party storage): https://firebase.google.com/docs/auth/web/redirect-best-practices
- Firebase persistence: https://firebase.google.com/docs/auth/web/auth-state-persistence
- Firebase sessions / revocation: https://firebase.google.com/docs/auth/admin/manage-sessions
- Supabase sessions and refresh rotation: https://supabase.com/docs/guides/auth/sessions
- Supabase PKCE / storage: https://supabase.com/docs/guides/auth/sessions/pkce-flow
- Supabase signOut scopes: https://supabase.com/docs/reference/javascript/auth-signout
- Supabase signing keys / JWKS: https://supabase.com/docs/guides/auth/signing-keys
- Supabase + Firebase Auth (third-party): https://supabase.com/docs/guides/auth/third-party/firebase-auth
- Supabase SMTP limits: https://supabase.com/docs/guides/auth/auth-smtp · https://supabase.com/docs/guides/auth/rate-limits
- Clerk session architecture: https://clerk.com/docs/guides/how-clerk-works/overview
- Clerk user export with hashes: https://clerk.com/changelog/2024-10-23-export-users
- auth0-spa-js (in-memory cache, rotation): https://github.com/auth0/auth0-spa-js · https://auth0.com/docs/tokens/refresh-tokens/refresh-token-rotation/use-refresh-token-rotation
- Cognito hash export limitation (secondary): https://mojoauth.com/blog/checklist-migrate-from-auth0-cognito-azure-ad-b2c
- SQL Connect authorization (`@auth`): https://firebase.google.com/docs/sql-connect/authorization-and-security
- Firestore free quota: https://firebase.google.com/docs/firestore/quotas
- Google Identity Services FedCM: https://developers.google.com/identity/gsi/web/guides/fedcm-migration

Privacy and age:
- FTC COPPA FAQ (mixed audience, neutral age screen): https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- COPPA amended Rule (Federal Register, 2025-04-22): https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule
- COPPA compliance date analysis: https://www.hunton.com/privacy-and-cybersecurity-law-blog/coppa-rule-amendment-compliance-deadline-approaches · https://securiti.ai/ftc-coppa-final-rule-amendments/
- GDPR Art. 8: https://gdpr-info.eu/art-8-gdpr/ · per-country ages (secondary, verify): https://euconsent.eu/digital-age-of-consent-under-the-gdpr/
- EDPB Guidelines 2/2023 on Art. 5(3) ePrivacy (adopted v2): https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf
- CCPA thresholds (secondary, verify): https://www.clym.io/blog/ccpa-applicability-guide · https://calawyers.org/intellectual-property-law/new-ccpa-requirements-for-2026/
- UK ICO Children's Code (not fetched, verify): https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/

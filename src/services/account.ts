import { stores } from "../stores";
import { semanticEngine } from "./semanticEngine";
import { ApiClient, ApiRequestError } from "../account/apiClient";
import { createDevAuth, createFirebaseAuth, firebaseConfigFromEnv, type AuthService, type AuthUser } from "../account/authService";
import { syncOnce, SyncConflictError } from "../account/syncService";
import { activeAccount, applySwitch, knownAccounts, planSwitch, touchAccount, type KnownAccount } from "../account/profiles";
import { canHaveAccount } from "../game/privacyRules";
import { logger } from "../utils/logger";

/**
 * Accounts and sync use cases (Epic 3 · Feature 3.8, Epic 6 · Features 6.4, 6.7).
 *   - Sign-in is optional: without Firebase config there is no Google button and nothing changes.
 *   - Several accounts per device: each has its own local database; switching reloads into it.
 *   - Local development and tests never need Google: dev builds offer test personas whenever the local
 *     API has dev sign-in on (it does by default). The persona survives reloads (session storage).
 * Sync runs on sign-in, every 30 s while signed in, when the browser comes back online, and shortly
 * after each play.
 */
const SYNC_INTERVAL_MS = 30_000;
const AFTER_PLAY_DELAY_MS = 3_000;
const DEV_SESSION_KEY = "lexical.devSession";
const DEV_BUILD = import.meta.env.DEV || import.meta.env.MODE === "e2e";

let auth: AuthService | undefined;
let googleAuth: AuthService | undefined;
let unsubscribe: (() => void) | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let afterPlay: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | undefined;
const api = new ApiClient(async () => auth?.getToken());

export async function bootAccount(): Promise<void> {
    stores.accountStore.setAccounts(knownAccounts());
    const config = firebaseConfigFromEnv();
    if (config) {
        try {
            googleAuth = await createFirebaseAuth(config);
            stores.accountStore.setGoogleAvailable(true);
        } catch (error) {
            logger.error("Google sign-in unavailable", error);
        }
    }
    if (DEV_BUILD) await detectDevPersonas();
    const devSubject = DEV_BUILD ? sessionStorage.getItem(DEV_SESSION_KEY) : null;
    if (devSubject && stores.accountStore.devPersonas) {
        use(createDevAuth(devSubject));
        await auth!.signIn();
    } else if (googleAuth) {
        use(googleAuth);
    } else if (activeAccount()) {
        // An account's database is active but nothing can sign it in here (e.g. a dev persona after the
        // tab closed): return to the guest's database.
        switchTo(undefined);
    }
}

async function detectDevPersonas(): Promise<void> {
    try {
        const health = await (await fetch("/api/v1/health")).json();
        stores.accountStore.setDevPersonas(Boolean(health?.devAuth));
    } catch {
        stores.accountStore.setDevPersonas(false); // no local API running
    }
}

function use(service: AuthService): void {
    unsubscribe?.();
    auth = service;
    unsubscribe = service.onChange(user => onUser(user));
}

function toKnown(user: AuthUser): KnownAccount {
    return { uid: user.uid, label: user.email ?? user.displayName ?? user.uid, provider: user.provider, lastUsedAt: Date.now() };
}

/** Reloads into another account's database when the signed-in user changes. */
function switchTo(user: AuthUser | undefined): boolean {
    const plan = planSwitch(activeAccount(), user, knownAccounts());
    if (!plan.reload) return false;
    applySwitch(user ? toKnown(user) : undefined, plan);
    window.location.reload();
    return true;
}

function onUser(user: AuthUser | undefined): void {
    if (timer) clearInterval(timer);
    timer = undefined;
    if (switchTo(user)) return; // the page reloads into the right database
    stores.accountStore.setUser(user);
    if (user) {
        touchAccount(toKnown(user));
        stores.accountStore.setAccounts(knownAccounts());
        void syncNow();
        timer = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    }
}

if (typeof window !== "undefined") window.addEventListener("online", () => void syncNow());

/** Google sign-in; accounts need an age band of 13 or older (the UI asks the age question first). */
export async function signIn(): Promise<void> {
    if (!googleAuth) return;
    if (!canHaveAccount(stores.privacyStore.ageBand)) {
        stores.accountStore.setStatus("error", "Accounts are for players 13 and older.");
        return;
    }
    try {
        await googleAuth.signIn(); // popup first; then listen, so the switch sees the new user
        if (DEV_BUILD) sessionStorage.removeItem(DEV_SESSION_KEY);
        use(googleAuth);
    } catch (error) {
        logger.warn("Sign-in cancelled or failed", error);
        stores.accountStore.setStatus("error", "Sign-in didn't complete.");
    }
}

/** Signing out returns to the guest's database; the account's data stays on this device. */
export async function signOut(): Promise<void> {
    if (DEV_BUILD) sessionStorage.removeItem(DEV_SESSION_KEY);
    if (auth) await auth.signOut();
    else switchTo(undefined);
}

/**
 * Dev builds only: sign in as a local test persona (no Google). Each persona is its own account with its
 * own local database, e.g. "novice", "intermediate", "expert".
 */
export async function devSignIn(subject: string): Promise<void> {
    if (!DEV_BUILD) throw new Error("Test personas exist only in dev and e2e builds");
    sessionStorage.setItem(DEV_SESSION_KEY, subject);
    use(createDevAuth(subject));
    await auth!.signIn();
    await syncNow();
}

export function syncSoon(): void {
    if (!stores.accountStore.user) return;
    if (afterPlay) clearTimeout(afterPlay);
    afterPlay = setTimeout(() => void syncNow(), AFTER_PLAY_DELAY_MS);
}

/** One sync pass; concurrent calls share the pass already running. */
export function syncNow(): Promise<void> {
    const user = stores.accountStore.user;
    if (!user) return Promise.resolve();
    if (running) return running;
    running = (async () => {
        const { accountStore, menuStore, gameStore } = stores;
        accountStore.setStatus("syncing");
        try {
            await semanticEngine.start(); // after a reload, sign-in can finish before the local data is open
            const report = await syncOnce(api, semanticEngine.syncPort(), user.uid);
            await semanticEngine.indexSyncedWords();
            menuStore.setCorpusStats(await semanticEngine.stats());
            gameStore.setHintMode(semanticEngine.hintMode);
            gameStore.setBestScore(await semanticEngine.bestGameScore());
            accountStore.setStatus("synced", report.pulled || report.merged ? `Updated from your other devices (${report.pulled + report.merged})` : "");
        } catch (error) {
            const message = error instanceof SyncConflictError ? error.message
                : error instanceof ApiRequestError && error.code === "offline" ? "Offline: will sync when you're back online."
                    : "Sync failed; will retry.";
            if (!(error instanceof ApiRequestError && error.code === "offline")) logger.warn("Sync failed", error);
            accountStore.setStatus("error", message);
        } finally {
            running = undefined;
        }
    })();
    return running;
}

/** Downloads everything the server holds for this account (the GDPR export, Epic 6 · Task 6.5.1). */
export async function downloadAccountData(): Promise<void> {
    const data = await api.exportAccount();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `lexical-fountain-account-${data.exportedAt.slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Deletes the account and everything the server holds for it, then signs out (Epic 6 · Task 6.5.2). */
export async function deleteAccount(): Promise<string> {
    const { receipt } = await api.deleteAccount();
    await semanticEngine.syncPort().setAccount({ accountUid: undefined, syncCursor: undefined });
    await signOut();
    return receipt;
}

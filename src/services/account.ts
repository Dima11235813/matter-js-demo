import { stores } from "../stores";
import { semanticEngine } from "./semanticEngine";
import { ApiClient, ApiRequestError } from "../account/apiClient";
import { createDevAuth, createFirebaseAuth, firebaseConfigFromEnv, type AuthService } from "../account/authService";
import { syncOnce, SyncConflictError } from "../account/syncService";
import { canHaveAccount } from "../game/privacyRules";
import { logger } from "../utils/logger";

/**
 * Accounts and sync use cases (Epic 3 · Feature 3.8, Epic 6 · Feature 6.4). Sign-in is optional:
 * without Firebase config in the build there is no sign-in button and nothing changes.
 * Sync runs on sign-in, every 30 s while signed in, when the browser comes back online, and shortly
 * after each play.
 */
const SYNC_INTERVAL_MS = 30_000;
const AFTER_PLAY_DELAY_MS = 3_000;

let auth: AuthService | undefined;
let unsubscribe: (() => void) | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let afterPlay: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | undefined;
const api = new ApiClient(async () => auth?.getToken());

export async function bootAccount(): Promise<void> {
    const config = firebaseConfigFromEnv();
    if (!config) return; // sign-in not configured: the game works exactly as before
    try {
        use(await createFirebaseAuth(config));
    } catch (error) {
        logger.error("Sign-in unavailable", error);
    }
}

function use(service: AuthService): void {
    unsubscribe?.();
    auth = service;
    stores.accountStore.setAvailable(true);
    unsubscribe = service.onChange(user => {
        stores.accountStore.setUser(user);
        if (timer) clearInterval(timer);
        timer = undefined;
        if (user) {
            void syncNow();
            timer = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
        }
    });
}

if (typeof window !== "undefined") window.addEventListener("online", () => void syncNow());

/** Google sign-in; accounts need an age band of 13 or older (the UI asks the age question first). */
export async function signIn(): Promise<void> {
    if (!auth) return;
    if (!canHaveAccount(stores.privacyStore.ageBand)) {
        stores.accountStore.setStatus("error", "Accounts are for players 13 and older.");
        return;
    }
    try {
        await auth.signIn();
    } catch (error) {
        logger.warn("Sign-in cancelled or failed", error);
        stores.accountStore.setStatus("error", "Sign-in didn't complete.");
    }
}

/** Signing out keeps this device's data (it still works offline). */
export async function signOut(): Promise<void> {
    await auth?.signOut();
}

export function syncSoon(): void {
    if (!stores.accountStore.user) return;
    if (afterPlay) clearTimeout(afterPlay);
    afterPlay = setTimeout(() => void syncNow(), AFTER_PLAY_DELAY_MS);
}

/** One sync pass; concurrent calls share the pass already running. */
export function syncNow(): Promise<void> {
    const user = stores.accountStore.user;
    if (!user || !semanticEngine.isReady) return Promise.resolve();
    if (running) return running;
    running = (async () => {
        const { accountStore, menuStore, gameStore } = stores;
        accountStore.setStatus("syncing");
        try {
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

/** Dev and e2e only: sign in with a server-minted token (see devtools.ts). */
export async function devSignIn(subject: string): Promise<void> {
    use(createDevAuth(subject));
    await auth!.signIn();
    await syncNow();
}

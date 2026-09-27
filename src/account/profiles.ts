/**
 * Several accounts on one device (Epic 6 · Feature 6.7). Each account keeps its own local database, so
 * personas (for example test players at different skill levels) never mix; the signed-out guest keeps
 * the original database. Switching accounts selects the active database and reloads.
 *
 * The first account ever signed in on a device adopts the guest's progress (the familiar "sign in to
 * keep your game" flow); later accounts start fresh. The guest's own database is left as it was.
 */
export const GUEST_DB_NAME = "lexical-fountain";
const ACTIVE_KEY = "lexical.activeAccount";
const ACCOUNTS_KEY = "lexical.accounts";
const ADOPT_KEY = "lexical.adoptGuestInto";

export interface KnownAccount {
    uid: string;
    label: string;
    provider: "google" | "dev";
    lastUsedAt: number;
}

/** Minimal storage interface (localStorage in the app, a Map in tests). */
export interface KeyValueStore {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

function browserStorage(): KeyValueStore | undefined {
    try {
        return typeof localStorage === "undefined" ? undefined : localStorage;
    } catch {
        return undefined; // storage blocked: behave as a guest-only device
    }
}

export function dbNameFor(uid: string | undefined): string {
    return uid ? `${GUEST_DB_NAME}@${uid}` : GUEST_DB_NAME;
}

export function activeAccount(storage = browserStorage()): string | undefined {
    return storage?.getItem(ACTIVE_KEY) ?? undefined;
}

export function knownAccounts(storage = browserStorage()): KnownAccount[] {
    try {
        const parsed = JSON.parse(storage?.getItem(ACCOUNTS_KEY) ?? "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/** The guest's progress is adopted into this account on its next start (then the flag is cleared). */
export function pendingAdoption(storage = browserStorage()): string | undefined {
    return storage?.getItem(ADOPT_KEY) ?? undefined;
}

export function clearAdoption(storage = browserStorage()): void {
    storage?.removeItem(ADOPT_KEY);
}

export interface SwitchPlan {
    /** The page must reload into a different database. */
    reload: boolean;
    /** The newly active account should adopt the guest's progress. */
    adoptGuest: boolean;
}

/**
 * What to do when the signed-in user changes. Pure: `current` is the active account (undefined for the
 * guest); `user` is who is signed in now; `known` lists accounts seen on this device before.
 */
export function planSwitch(current: string | undefined, user: { uid: string } | undefined, known: readonly KnownAccount[]): SwitchPlan {
    const target = user?.uid;
    if (target === current) return { reload: false, adoptGuest: false };
    const firstAccountOnDevice = target !== undefined && known.length === 0;
    return { reload: true, adoptGuest: firstAccountOnDevice && current === undefined };
}

/** Applies a switch: records the account, sets it active, and marks guest adoption when planned. */
export function applySwitch(user: KnownAccount | undefined, plan: SwitchPlan, storage = browserStorage()): void {
    if (!storage) return;
    if (user) {
        const others = knownAccounts(storage).filter(a => a.uid !== user.uid);
        storage.setItem(ACCOUNTS_KEY, JSON.stringify([user, ...others].slice(0, 20)));
        storage.setItem(ACTIVE_KEY, user.uid);
        if (plan.adoptGuest) storage.setItem(ADOPT_KEY, user.uid);
    } else {
        storage.removeItem(ACTIVE_KEY);
    }
}

/** Remembers when an already-active account was used (keeps the list's order fresh). */
export function touchAccount(user: KnownAccount, storage = browserStorage()): void {
    if (!storage) return;
    const others = knownAccounts(storage).filter(a => a.uid !== user.uid);
    storage.setItem(ACCOUNTS_KEY, JSON.stringify([user, ...others].slice(0, 20)));
}

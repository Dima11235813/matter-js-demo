import { action, computed, makeObservable, observable } from "mobx";
import { CommonStore } from "./CommonStore";
import { RootStore } from "./RootStore";
import type { AuthUser } from "../account/authService";
import type { KnownAccount } from "../account/profiles";

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

/** Sign-in, accounts on this device, and sync state for the UI (Epic 6 · Features 6.4, 6.7). */
export class AccountStore extends CommonStore {
    /** Google sign-in is configured for this build (Firebase config present). */
    googleAvailable = false
    /** Dev builds with a local API that has dev sign-in on: offer test personas (never in production). */
    devPersonas = false
    user: AuthUser | undefined = undefined
    accounts: KnownAccount[] = []
    status: SyncStatus = "idle"
    lastSyncAt: number | undefined = undefined
    message = ""

    constructor(store: RootStore) {
        super(store)
        makeObservable(this, {
            googleAvailable: observable,
            devPersonas: observable,
            user: observable.ref,
            accounts: observable.ref,
            status: observable,
            lastSyncAt: observable,
            message: observable,
            available: computed,
            setGoogleAvailable: action,
            setDevPersonas: action,
            setUser: action,
            setAccounts: action,
            setStatus: action,
        })
    }

    /** Any way to sign in exists (the account section is shown). */
    get available(): boolean {
        return this.googleAvailable || this.devPersonas || this.user !== undefined
    }

    setGoogleAvailable = (available: boolean) => {
        this.googleAvailable = available
    }

    setDevPersonas = (available: boolean) => {
        this.devPersonas = available
    }

    setUser = (user: AuthUser | undefined) => {
        this.user = user
        if (!user) {
            this.status = "idle"
            this.message = ""
        }
    }

    setAccounts = (accounts: KnownAccount[]) => {
        this.accounts = accounts
    }

    setStatus = (status: SyncStatus, message = "") => {
        this.status = status
        this.message = message
        if (status === "synced") this.lastSyncAt = Date.now()
    }
}

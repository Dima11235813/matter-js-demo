import { action, makeObservable, observable } from "mobx";
import { CommonStore } from "./CommonStore";
import { RootStore } from "./RootStore";
import type { AuthUser } from "../account/authService";

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

/** Sign-in and sync state for the UI (Epic 6 · Feature 6.4); services/account.ts drives it. */
export class AccountStore extends CommonStore {
    /** Sign-in is configured for this build (Firebase config present) or a dev session is active. */
    available = false
    user: AuthUser | undefined = undefined
    status: SyncStatus = "idle"
    lastSyncAt: number | undefined = undefined
    message = ""

    constructor(store: RootStore) {
        super(store)
        makeObservable(this, {
            available: observable,
            user: observable.ref,
            status: observable,
            lastSyncAt: observable,
            message: observable,
            setAvailable: action,
            setUser: action,
            setStatus: action,
        })
    }

    setAvailable = (available: boolean) => {
        this.available = available
    }

    setUser = (user: AuthUser | undefined) => {
        this.user = user
        if (!user) {
            this.status = "idle"
            this.message = ""
        }
    }

    setStatus = (status: SyncStatus, message = "") => {
        this.status = status
        this.message = message
        if (status === "synced") this.lastSyncAt = Date.now()
    }
}

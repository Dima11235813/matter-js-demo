import { action, computed, makeObservable, observable } from "mobx";
import { CommonStore } from "./CommonStore";
import { RootStore } from "./RootStore";
import type { AgeBand, ConsentState } from "../persistence/db";
import { shouldPromptConsent } from "../game/privacyRules";

export interface PrivacySnapshot {
    consent?: ConsentState;
    ageBand?: AgeBand;
    ageAnsweredAt?: number;
    consentPromptDismissedAt?: number;
}

/**
 * The device's privacy state for the UI (Epic 6 · Feature 6.2): consent, age band, and whether to
 * show the consent prompt. The repository is the source of truth; services/privacy.ts writes both.
 */
export class PrivacyStore extends CommonStore {
    consent: ConsentState | undefined = undefined
    ageBand: AgeBand | undefined = undefined
    ageAnsweredAt: number | undefined = undefined
    promptDismissedAt: number | undefined = undefined
    sessionPlays = 0
    roundsFinished = 0
    /** The prompt's age step is open (the player said yes before answering the age question). */
    askingAge = false
    now = Date.now()

    constructor(store: RootStore) {
        super(store)
        makeObservable(this, {
            consent: observable.ref,
            ageBand: observable,
            ageAnsweredAt: observable,
            promptDismissedAt: observable,
            sessionPlays: observable,
            roundsFinished: observable,
            askingAge: observable,
            promptVisible: computed,
            load: action,
            notePlay: action,
            noteRoundFinished: action,
            setAskingAge: action,
        })
    }

    get promptVisible(): boolean {
        return this.askingAge || shouldPromptConsent({
            consent: this.consent,
            ageBand: this.ageBand,
            dismissedAt: this.promptDismissedAt,
            sessionPlays: this.sessionPlays,
            roundsFinished: this.roundsFinished,
            now: this.now,
        })
    }

    load = (snapshot: PrivacySnapshot) => {
        this.consent = snapshot.consent
        this.ageBand = snapshot.ageBand
        this.ageAnsweredAt = snapshot.ageAnsweredAt
        this.promptDismissedAt = snapshot.consentPromptDismissedAt
        this.now = Date.now()
    }

    notePlay = () => {
        this.sessionPlays++
        this.now = Date.now()
    }

    noteRoundFinished = () => {
        this.roundsFinished++
        this.now = Date.now()
    }

    setAskingAge = (asking: boolean) => {
        this.askingAge = asking
    }
}

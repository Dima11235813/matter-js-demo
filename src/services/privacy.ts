import { stores } from "../stores";
import { semanticEngine } from "./semanticEngine";
import { ageBandFor, canAnswerAge, canShareResearch, newConsent } from "../game/privacyRules";
import { logger } from "../utils/logger";

/**
 * Privacy use cases (Epic 6 · Features 6.2, 6.3): consent, the age question, export, and erase.
 * Nothing here sends data anywhere: research upload arrives with telemetry ingest (Epic 3 · 3.6),
 * and it will only run for devices with consent.
 */

export async function loadPrivacy(): Promise<void> {
    stores.privacyStore.load(semanticEngine.privacyState());
}

export type AgeOutcome = { status: "shared" | "local-only" | "cooldown" | "invalid"; message: string };

/** Answers the age question (only the band is stored). Used before research sharing and before sign-in. */
export async function answerAge(birthYear: number): Promise<{ ok: true } | { ok: false; outcome: AgeOutcome }> {
    const { privacyStore } = stores;
    const now = Date.now();
    if (!canAnswerAge(privacyStore.ageAnsweredAt, now) && privacyStore.ageBand) {
        return { ok: false, outcome: { status: "cooldown", message: "You answered recently. Try again tomorrow." } };
    }
    const answer = ageBandFor(birthYear);
    if (!answer.ok) return { ok: false, outcome: { status: "invalid", message: answer.message } };
    await semanticEngine.updatePrivacy({ ageBand: { band: answer.band, at: now } });
    await loadPrivacy();
    return { ok: true };
}

/** Answers the age question, then grants consent when the band allows it. */
export async function answerAgeAndConsent(birthYear: number): Promise<AgeOutcome> {
    const { privacyStore } = stores;
    const answered = await answerAge(birthYear);
    if (!answered.ok) return answered.outcome;
    const now = Date.now();
    const band = privacyStore.ageBand!;
    if (!canShareResearch(band)) {
        await semanticEngine.updatePrivacy({ consentPromptDismissedAt: now });
        privacyStore.setAskingAge(false);
        await loadPrivacy();
        return { status: "local-only", message: "Thanks! Your plays stay on this device." };
    }
    await grantConsent();
    if (!stores.privacyStore.consent) return { status: "invalid", message: "Could not save your choice. Please try again." };
    return { status: "shared", message: "Thank you! Your plays will help research." };
}

/** Grants research consent (the age band must already allow it). */
export async function grantConsent(): Promise<void> {
    const { privacyStore } = stores;
    if (!canShareResearch(privacyStore.ageBand)) {
        privacyStore.setAskingAge(true);
        return;
    }
    await semanticEngine.updatePrivacy({ consent: newConsent(Date.now()) });
    privacyStore.setAskingAge(false);
    await loadPrivacy();
}

/** Withdraws consent: a later re-consent gets a fresh research id. */
export async function withdrawConsent(): Promise<void> {
    await semanticEngine.updatePrivacy({ consent: undefined });
    await loadPrivacy();
}

export async function dismissConsentPrompt(): Promise<void> {
    stores.privacyStore.setAskingAge(false);
    await semanticEngine.updatePrivacy({ consentPromptDismissedAt: Date.now() });
    await loadPrivacy();
}

/** Saves everything this device holds about the player as one JSON file (the future GDPR export). */
export async function downloadAllData(): Promise<void> {
    const data = await semanticEngine.exportAllData();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `lexical-fountain-my-data-${data.exportedAt.slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Erases every store on this device, then reloads into a fresh profile. */
export async function eraseThisDevice(): Promise<void> {
    try {
        await semanticEngine.eraseDevice();
    } catch (error) {
        logger.error("Erase failed", error);
        throw error;
    }
    window.location.reload();
}

import type { AgeBand, ConsentState } from "../persistence/db";

/**
 * Privacy rules (Epic 6 · Feature 6.2; platform-plan §5 decision D5). Pure, so the rules are
 * unit-tested and easy to read in one place:
 *   - the age question is neutral (birth year, no default) and asked only before sign-in or
 *     research sharing, never before play; only the band is stored;
 *   - under 13: local-only play (US COPPA); 13–15: no research sharing (EU consent ages run up to 16,
 *     and the player's country isn't known), accounts allowed later; 16+: may share;
 *   - the consent prompt appears after a few plays or a finished round, never as a wall.
 */
export const RESEARCH_POLICY_VERSION = "research-2026-09-draft";
export const RESEARCH_SCOPES = ["plays"] as const;
/** "Not now" hides the prompt for this long. */
export const PROMPT_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
/** An answered age question can't be re-answered with a different year for this long. */
export const AGE_RETRY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** Plays in one session before the consent prompt appears (or one finished timed round). */
export const PROMPT_AFTER_PLAYS = 3;

export type AgeAnswer = { ok: true; band: AgeBand } | { ok: false; message: string };

export function ageBandFor(birthYear: number, now: Date = new Date()): AgeAnswer {
    const year = now.getFullYear();
    if (!Number.isInteger(birthYear) || birthYear < year - 120 || birthYear > year) {
        return { ok: false, message: `Enter a year between ${year - 120} and ${year}` };
    }
    // Without a birth date, age is year - birthYear or one less: count the younger case.
    const age = year - birthYear - 1;
    if (age < 13) return { ok: true, band: "under13" };
    if (age < 16) return { ok: true, band: "13to15" };
    return { ok: true, band: "16plus" };
}

export function canShareResearch(band: AgeBand | undefined): boolean {
    return band === "16plus";
}

export function canHaveAccount(band: AgeBand | undefined): boolean {
    return band === "13to15" || band === "16plus";
}

export function canAnswerAge(answeredAt: number | undefined, now: number): boolean {
    return answeredAt === undefined || now - answeredAt >= AGE_RETRY_COOLDOWN_MS;
}

export interface PromptContext {
    consent: ConsentState | undefined;
    ageBand: AgeBand | undefined;
    dismissedAt: number | undefined;
    sessionPlays: number;
    roundsFinished: number;
    now: number;
}

export function shouldPromptConsent({ consent, ageBand, dismissedAt, sessionPlays, roundsFinished, now }: PromptContext): boolean {
    if (consent) return false;
    if (ageBand && !canShareResearch(ageBand)) return false;
    if (dismissedAt !== undefined && now - dismissedAt < PROMPT_SNOOZE_MS) return false;
    return sessionPlays >= PROMPT_AFTER_PLAYS || roundsFinished >= 1;
}

export function newConsent(now: number, researchId: string = crypto.randomUUID()): ConsentState {
    return { policyVersion: RESEARCH_POLICY_VERSION, grantedAt: now, scopes: [...RESEARCH_SCOPES], researchId };
}

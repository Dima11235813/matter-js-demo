import profanityList from "../utils/Dictionary/corporaExplitives";
import extraList from "../../data/vocab/profanity-extra.txt?raw";

export interface ProfanityPolicy {
    readonly enabled: boolean;
    isAllowed(word: string): boolean;
}

/** Parses a one-word-per-line list with # comments. */
export function parseWordList(text: string): string[] {
    return text.split(/\r?\n/).map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith("#"));
}

const listedWords: ReadonlySet<string> = new Set([
    ...Object.keys(profanityList).map(w => w.toLowerCase()),
    ...parseWordList(extraList),
]);

/**
 * Production builds always filter profanity. Local development shows the full, unfiltered
 * embedding space by default; set VITE_PROFANITY_FILTER=on (e.g. in .env.local) to preview
 * what players will see.
 */
export function isProfanityFilterEnabled(env: { DEV?: boolean; VITE_PROFANITY_FILTER?: string } = import.meta.env): boolean {
    if (!env.DEV) return true;
    return env.VITE_PROFANITY_FILTER === "on";
}

/** `flagged` adds vocabulary words the build script marked profane to the shipped list. */
export function createProfanityPolicy(enabled: boolean, flagged: Iterable<string> = []): ProfanityPolicy {
    const blocked = new Set(listedWords);
    for (const word of flagged) blocked.add(word);
    return {
        enabled,
        isAllowed: (word: string) => !enabled || !blocked.has(word.toLowerCase()),
    };
}

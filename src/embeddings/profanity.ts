import profanityList from "../utils/Dictionary/corporaExplitives";

export interface ProfanityPolicy {
    readonly enabled: boolean;
    isAllowed(word: string): boolean;
}

const listedWords: ReadonlySet<string> = new Set(Object.keys(profanityList).map(w => w.toLowerCase()));

/**
 * The filter is always on in production builds. In local development it can be switched off with
 * VITE_PROFANITY_FILTER=off (e.g. in .env.local) to inspect the full, unfiltered embedding space.
 */
export function isProfanityFilterEnabled(env: { DEV?: boolean; VITE_PROFANITY_FILTER?: string } = import.meta.env): boolean {
    if (!env.DEV) return true;
    return env.VITE_PROFANITY_FILTER !== "off";
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

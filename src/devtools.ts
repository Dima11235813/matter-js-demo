import deps from "./matterJsComp/Deps";
import { stores } from "./stores";
import { semanticEngine } from "./services/semanticEngine";
import { layoutFidelity, LayoutFidelity } from "./physics/layoutMetrics";
import { devSignIn, signOut, syncNow } from "./services/account";
import { playGuess } from "./services/playground";
import { gradeGuess } from "./game/relationPairs";

export interface WordBoxProbe {
    text: string
    x: number
    y: number
}

/**
 * Dev-only console/e2e handle: `window.__lexical.wordBoxes()` lists word positions in canvas
 * coordinates, `semanticEngine.neighbors("king")` explores the space, and `layoutFidelity()`
 * measures how well on-screen distance mirrors similarity (-1 is perfect). Not in prod builds.
 */
export function installDevtools(): void {
    const handle = {
        deps,
        stores,
        semanticEngine,
        /** Word positions in canvas pixels (3D: projected through the camera), for clicking. */
        wordBoxes: (): WordBoxProbe[] =>
            (deps.activeWorld?.wordProbes() ?? []).map(({ text, x, y }) => ({ text, x, y })),
        /** The local play log (research telemetry): counts by type, hints, and verdicts. */
        playLog: () => semanticEngine.playLogSummary(),
        /** The export a player can download: events without device id or sync bookkeeping. */
        exportPlays: () => semanticEngine.exportPlayLog(),
        /** Dev and e2e only: sign in with a token from the local API (DEV_AUTH_SECRET), sync, sign out. */
        account: {
            devSignIn: (subject: string) => devSignIn(subject),
            syncNow: () => syncNow(),
            signOut: () => signOut(),
            state: () => ({ user: stores.accountStore.user, status: stores.accountStore.status, message: stores.accountStore.message }),
        },
        /**
         * Dev and e2e only: plays a correct guess from the running round's deal through the real use case
         * (tests that need points, like sync and personas, earn them this way). Null outside a round.
         */
        guess: {
            playCorrect: async (): Promise<string[] | null> => {
                const pairs = stores.gameStore.relationDeal?.pairs ?? [];
                for (const p of pairs) for (const q of pairs) {
                    if (p === q || !gradeGuess(pairs, p.x, p.y, q.x, q.y).correct) continue;
                    await playGuess(stores, p.x, p.y, q.x, q.y);
                    return [p.x, p.y, q.x, q.y];
                }
                return null;
            },
        },
        /** Dev and e2e only: seed the current account's (persona's) Guess rating (Feature 2.12). */
        rating: {
            set: async (value: number) => { await semanticEngine.setRating(value); stores.gameStore.setRating(value); },
            get: () => stores.gameStore.rating,
        },
        /** Words currently highlighted by focus (new words, HUD links, the analogies panel). */
        focusedWords: (): string[] => deps.activeWorld?.focusedWords() ?? [],
        /** Fidelity in the world's own space: 2D pixels or 3D world units. */
        layoutFidelity: (): LayoutFidelity => {
            const probes = deps.activeWorld?.wordProbes() ?? []
            return layoutFidelity(probes.map(p => p.position), probes.map(p => semanticEngine.lookup(p.text)!))
        },
    };
    (window as unknown as { __lexical: typeof handle }).__lexical = handle;
}

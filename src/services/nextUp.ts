import deps from "../matterJsComp/Deps";
import type { RootStore } from "../stores/RootStore";
import { NextUpQueue } from "../game/nextUp";
import { semanticEngine } from "./semanticEngine";

/**
 * Next-up preview (Epic 2 · Feature 2.16): Discovery's + taps in 2D and 3D draw from one queue, so the
 * "next" chip shows exactly the word the next tap drops, whichever view is open. The queue runs whether
 * or not the chip is shown (same random words either way); the toggle is a per-device preference.
 * Letters mode keeps the original game's own next-letter box.
 */
const STORAGE_KEY = "lexical-fountain.nextWordPreview";

export function loadNextWordPreview(): boolean {
    try {
        return window.localStorage.getItem(STORAGE_KEY) === "on";
    } catch {
        return false;
    }
}

function saveNextWordPreview(on: boolean): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    } catch {
        /* storage blocked: the choice still applies for this session */
    }
}

const queue = new NextUpQueue(() => (semanticEngine.isReady ? semanticEngine.randomWords(1)[0] : undefined));

/** A word can come next unless it is already on the board (a board holds each word once). */
function notOnBoard(): (word: string) => boolean {
    const onBoard = new Set(deps.activeWorld?.wordTexts() ?? []);
    return word => !onBoard.has(word);
}

/** The word the next + tap drops, as the chip shows it; refreshed if it reached the board another way. */
export function refreshNextWord(stores: RootStore): string | undefined {
    const word = queue.peek(notOnBoard());
    stores.gameStore.setNextWord(word);
    return word;
}

/** A + tap in Discovery: the previewed word, and the chip moves on to the following one. */
export function takeNextWord(stores: RootStore): string | undefined {
    const word = queue.take(notOnBoard());
    stores.gameStore.setNextWord(queue.peek());
    return word;
}

export function toggleNextWordPreview(stores: RootStore): void {
    const on = !stores.gameStore.nextWordPreview;
    stores.gameStore.setNextWordPreview(on);
    saveNextWordPreview(on);
    if (on) void semanticEngine.start().then(() => refreshNextWord(stores));
}

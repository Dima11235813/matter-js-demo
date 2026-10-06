import deps from "../matterJsComp/Deps";
import { RootStore } from "../stores/RootStore";
import { semanticEngine } from "./semanticEngine";
import { isWordView } from "../stores/MenuStore";
import {
    addedWords, defaultSessionName, parsePlayLogFile, parseSessionFile, SavedAnalogy, SavedSession, SESSION_SCHEMA, sessionFile,
} from "../game/sessions";

/**
 * Saved sessions and uploads (owner, 2026-10-05). A session is the board as it is: its words where they
 * sit, its analogies, and in letters mode the letter board. Sessions live in this account's database
 * (each persona has its own), can be downloaded as files, and files can be uploaded on any device.
 */

/** Saves the board on screen; returns the new session. */
export async function saveCurrentSession(stores: RootStore, name?: string): Promise<SavedSession | undefined> {
    if (!semanticEngine.isReady) return undefined;
    const { menuStore } = stores;
    const world = deps.activeWorld;
    const letters = menuStore.view === "sandbox" ? world?.letterSnapshot?.() : undefined;
    const words = (world?.wordProbes() ?? []).map(({ text, x, y, color }) => ({ word: text, x, y, color }));
    const analogies: SavedAnalogy[] = menuStore.boardAnalogies.map(({ a, b, c, answer, points, similarity, guess }) => ({ a, b, c, answer, points, similarity, guess }));
    const session: SavedSession = {
        id: crypto.randomUUID(),
        name: name?.trim() || defaultSessionName(letters ? letters.map(l => l.text) : words.map(w => w.word)),
        savedAt: Date.now(),
        schema: SESSION_SCHEMA,
        view: letters ? "sandbox" : "fountain",
        words,
        analogies,
        ...(letters ? { letters } : {}),
    };
    await semanticEngine.saveSession(session);
    menuStore.setSessionsMessage(`Saved "${session.name}"`);
    await refreshSessions(stores);
    return session;
}

export async function refreshSessions(stores: RootStore): Promise<void> {
    if (semanticEngine.isReady) stores.menuStore.setSessions(await semanticEngine.listSessions());
}

/**
 * Puts a saved board back: letters boards in letters mode, word boards in Discovery (a Guess round is
 * timed and can't be resumed). Words this account doesn't know yet (a friend's file) are embedded first.
 */
export async function loadSession(stores: RootStore, id: string): Promise<void> {
    const session = await semanticEngine.getSession(id);
    if (!session) return;
    const { menuStore } = stores;
    if (!session.letters) {
        for (const { word } of session.words) {
            if (!semanticEngine.lookup(word)) await semanticEngine.addWord(word);
        }
    }
    const words = session.words.filter(w => session.letters || semanticEngine.lookup(w.word));
    const target = session.letters ? "sandbox" : "fountain";
    const restore = { view: target, words: words.map(({ word, x, y, color }) => ({ word, x, y, color })), letters: session.letters };
    if (menuStore.view === target && deps.activeWorld) {
        // Same view: replace the board in place.
        if (session.letters) deps.activeWorld.replaceLetterBoard?.(session.letters);
        else {
            deps.activeWorld.clearWordBoxes();
            restore.words.forEach(w => deps.pendingWordSpawns.push(w));
        }
    } else {
        // Another view: the new world takes the session instead of a fresh or carried board.
        deps.pendingRestore = restore;
        menuStore.setView(target);
    }
    menuStore.restoreBoardAnalogies(session.analogies.map(a => ({ ...a, isNewQuestion: false, alternatives: [] })));
    const skipped = session.words.length - words.length;
    menuStore.setSessionsMessage(`Loaded "${session.name}"${skipped ? ` · ${skipped} words couldn't be embedded` : ""}`);
}

export async function deleteSession(stores: RootStore, id: string): Promise<void> {
    await semanticEngine.deleteSession(id);
    await refreshSessions(stores);
}

export async function downloadSession(id: string): Promise<void> {
    const session = await semanticEngine.getSession(id);
    if (!session) return;
    const name = session.name.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "session";
    saveFile(`lexical-fountain-session-${name}.json`, sessionFile(session));
}

/** Uploads a session file into this account's saved sessions (it doesn't replace the board until loaded). */
export async function uploadSessionFile(stores: RootStore, file: File): Promise<void> {
    const parsed = parseSessionFile(await readJson(file));
    if (!parsed.ok) return stores.menuStore.setSessionsMessage(parsed.error);
    const session: SavedSession = { ...parsed.value, id: crypto.randomUUID() };
    await semanticEngine.saveSession(session);
    await refreshSessions(stores);
    stores.menuStore.setSessionsMessage(`Added "${session.name}"${parsed.dropped ? ` · ${parsed.dropped} invalid entries skipped` : ""}`);
}

/**
 * Uploads a play log: its events join this device's log (duplicates skipped, score unchanged) and the
 * words the player had added come back to the corpus.
 */
export async function uploadPlayLogFile(stores: RootStore, file: File): Promise<void> {
    const parsed = parsePlayLogFile(await readJson(file));
    if (!parsed.ok) return stores.menuStore.setSessionsMessage(parsed.error);
    const { added, skipped } = await semanticEngine.importPlayEvents(parsed.value);
    let restored = 0;
    for (const word of addedWords(parsed.value)) {
        if (semanticEngine.lookup(word)) continue;
        const outcome = await semanticEngine.addWord(word);
        if (outcome.status === "added") restored++;
    }
    stores.menuStore.setSessionsMessage(`Play log: ${added} plays added${skipped ? `, ${skipped} already here` : ""}${restored ? ` · ${restored} words restored` : ""}${parsed.dropped ? ` · ${parsed.dropped} invalid skipped` : ""}`);
    if (restored > 0) stores.menuStore.setCorpusStats(await semanticEngine.stats());
}

export function canSaveSession(view: string): boolean {
    return view === "sandbox" || isWordView(view as Parameters<typeof isWordView>[0]);
}

async function readJson(file: File): Promise<unknown> {
    if (file.size > 20 * 1024 * 1024) return undefined;
    try {
        return JSON.parse(await file.text());
    } catch {
        return undefined;
    }
}

function saveFile(filename: string, data: unknown): void {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

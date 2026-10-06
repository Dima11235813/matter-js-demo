/**
 * Saved sessions and uploaded files (owner, 2026-10-05: "since we can download our play log it would be
 * good to be able to upload it as well as save it to local storage so on device you can save sessions
 * and reload them"). Pure: the session format, the file wrappers, and validation of uploaded files,
 * which are untrusted input (sizes are capped and malformed entries dropped or refused).
 */
export const SESSION_SCHEMA = 1;
const MAX_WORDS = 400;
const MAX_ANALOGIES = 300;
const MAX_LETTERS = 600;
const MAX_EVENTS = 50_000;
const WORD = /^[\p{L}][\p{L}'-]{0,39}$/u;

export interface SavedWord {
    word: string;
    /** Canvas pixels when saved (2D body position or the 3D projection). */
    x: number;
    y: number;
    color?: string;
}

/** An analogy on the saved board (enough to list it and focus its words). */
export interface SavedAnalogy {
    a: string;
    b: string;
    c: string;
    answer: string;
    points: number;
    similarity: number;
    guess?: boolean;
}

/** A letters-mode box (same shape as the world's LetterSnapshot). */
export interface SavedLetter {
    text: string;
    x: number;
    y: number;
    angle: number;
    w: number;
    h: number;
    color: string;
    type: number;
}

export interface SavedSession {
    id: string;
    name: string;
    savedAt: number;
    schema: number;
    /** The view it was saved from (it reopens in Discovery, or letters mode for a letters board). */
    view: string;
    words: SavedWord[];
    analogies: SavedAnalogy[];
    letters?: SavedLetter[];
}

export interface SessionFile {
    kind: "lexical-fountain-session";
    exportedAt: string;
    session: Omit<SavedSession, "id">;
}

export function sessionFile(session: SavedSession, now = new Date()): SessionFile {
    const { id: _id, ...rest } = session;
    return { kind: "lexical-fountain-session", exportedAt: now.toISOString(), session: rest };
}

/** "dog, puppy, cat +5 · Oct 5, 10:41 PM": the first words and the time. */
export function defaultSessionName(words: readonly string[], now = new Date()): string {
    const head = words.slice(0, 3).join(", ") || "empty board";
    const more = words.length > 3 ? ` +${words.length - 3}` : "";
    const when = now.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    return `${head}${more} · ${when}`;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const isWord = (v: unknown): v is string => typeof v === "string" && WORD.test(v);
const color = (v: unknown) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined);

export type Parsed<T> = { ok: true; value: T; dropped: number } | { ok: false; error: string };

/** Validates an uploaded session file; keeps valid words, analogies, and letters, and counts what it dropped. */
export function parseSessionFile(input: unknown): Parsed<Omit<SavedSession, "id">> {
    if (!isObject(input) || input.kind !== "lexical-fountain-session" || !isObject(input.session)) {
        return { ok: false, error: "Not a Lexical Fountain session file" };
    }
    const s = input.session;
    if (!Array.isArray(s.words)) return { ok: false, error: "The session has no word list" };
    let dropped = 0;
    const words: SavedWord[] = [];
    for (const w of s.words.slice(0, MAX_WORDS)) {
        if (isObject(w) && isWord(w.word) && finite(w.x) && finite(w.y)) words.push({ word: w.word.toLowerCase(), x: w.x, y: w.y, color: color(w.color) });
        else dropped++;
    }
    const analogies: SavedAnalogy[] = [];
    for (const a of (Array.isArray(s.analogies) ? s.analogies : []).slice(0, MAX_ANALOGIES)) {
        if (isObject(a) && isWord(a.a) && isWord(a.b) && isWord(a.c) && isWord(a.answer) && finite(a.points) && finite(a.similarity)) {
            analogies.push({ a: a.a, b: a.b, c: a.c, answer: a.answer, points: a.points, similarity: a.similarity, guess: a.guess === true || undefined });
        } else dropped++;
    }
    let letters: SavedLetter[] | undefined;
    if (Array.isArray(s.letters)) {
        letters = [];
        for (const l of s.letters.slice(0, MAX_LETTERS)) {
            if (isObject(l) && text(l.text, 12) && /^[a-zA-Z]+$/.test(l.text) && [l.x, l.y, l.angle, l.w, l.h, l.type].every(finite) && color(l.color)) {
                letters.push({ text: l.text, x: l.x as number, y: l.y as number, angle: l.angle as number, w: l.w as number, h: l.h as number, color: l.color as string, type: l.type as number });
            } else dropped++;
        }
    }
    const view = s.view === "sandbox" ? "sandbox" : "fountain";
    return {
        ok: true,
        dropped,
        value: {
            name: text(s.name, 120) ? s.name : "Uploaded session",
            savedAt: finite(s.savedAt) ? s.savedAt : Date.now(),
            schema: SESSION_SCHEMA,
            view,
            words,
            analogies,
            ...(letters ? { letters } : {}),
        },
    };
}

/** A play-log event as the download writes it (no device id or sync bookkeeping). */
export interface UploadedPlayEvent {
    id: string;
    type: "analogy" | "expression" | "word" | "import" | "puzzle";
    schema: number;
    at: number;
    sessionId: string;
    vocabVersion: string;
    context: Record<string, unknown>;
    payload: Record<string, unknown>;
}

const EVENT_TYPES = new Set(["analogy", "expression", "word", "import", "puzzle"]);

/** Validates an uploaded play log (the "Download my play log" file); drops malformed events. */
export function parsePlayLogFile(input: unknown): Parsed<UploadedPlayEvent[]> {
    if (!isObject(input) || input.kind !== "lexical-fountain-play-log" || !Array.isArray(input.events)) {
        return { ok: false, error: "Not a Lexical Fountain play log" };
    }
    let dropped = 0;
    const events: UploadedPlayEvent[] = [];
    for (const e of input.events.slice(0, MAX_EVENTS)) {
        if (isObject(e) && text(e.id, 64) && EVENT_TYPES.has(e.type as string) && finite(e.schema) && finite(e.at)
            && text(e.sessionId, 64) && typeof e.vocabVersion === "string" && isObject(e.context) && isObject(e.payload)) {
            events.push({ id: e.id, type: e.type as UploadedPlayEvent["type"], schema: e.schema, at: e.at, sessionId: e.sessionId, vocabVersion: e.vocabVersion, context: e.context, payload: e.payload });
        } else dropped++;
    }
    return { ok: true, value: events, dropped: dropped + Math.max(0, input.events.length - MAX_EVENTS) };
}

/** Words the player added to the corpus in a play log (word events that were new), to restore them. */
export function addedWords(events: readonly UploadedPlayEvent[]): string[] {
    const words = new Set<string>();
    for (const e of events) {
        if (e.type === "word" && e.payload.status === "added" && isWord(e.payload.word)) words.add((e.payload.word as string).toLowerCase());
    }
    return [...words];
}

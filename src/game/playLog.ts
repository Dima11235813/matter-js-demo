import type { PlayEventRecord } from "../persistence/db";
import type { RelationHint, RelationStats } from "./relationHint";
import type { PlayVerdict } from "./relationPairs";

/**
 * Play-log payloads and the research export (Epic 2 · Task 2.11.5). Pure, so the event format is
 * unit-tested and stays stable for the analysis that will read it. Data minimization: payloads hold
 * the words that were played and the model's numbers, never pasted or typed free text.
 */
export interface RankedWord {
    word: string;
    similarity: number;
}

export interface AnalogyPlayInput {
    a: string;
    b: string;
    c: string;
    answer: string;
    /** The solver's first choice, when a dealt word from its top 3 was taken instead. */
    modelAnswer?: string;
    ranked: readonly RankedWord[];
    input: "click" | "typed";
    stats?: RelationStats;
    hint?: RelationHint;
    verdict?: PlayVerdict;
    /** Timed rounds: whether a → b and c were a designed play (two dealt pairs of one relation). */
    designed?: boolean;
    points: number;
    duplicate?: boolean;
    /** Guess mode: `answer` is the player's fourth pick and `modelAnswer` the solver's choice. */
    guess?: boolean;
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

export function analogyPayload(play: AnalogyPlayInput): Record<string, unknown> {
    const { stats, ranked, ...rest } = play;
    return {
        ...rest,
        top: ranked.slice(0, 3).map(r => ({ word: r.word, similarity: round3(r.similarity) })),
        stats: stats && Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, round3(v)])),
    };
}

export function expressionPayload(terms: readonly { word: string; sign: number }[], ranked: readonly RankedWord[]): Record<string, unknown> {
    return {
        terms: terms.map(t => ({ word: t.word, sign: t.sign })),
        answer: ranked[0]?.word,
        top: ranked.slice(0, 3).map(r => ({ word: r.word, similarity: round3(r.similarity) })),
    };
}

export interface PlayLogSummary {
    events: number;
    byType: Record<string, number>;
    analogies: {
        played: number;
        hints: Record<string, number>;
        verdicts: Record<string, number>;
        /** Timed rounds: designed plays found and completed. */
        designedPlays: number;
        designedCompleted: number;
    };
    sessions: number;
    firstAt?: number;
    lastAt?: number;
}

const count = (into: Record<string, number>, key: string | undefined) => {
    if (key) into[key] = (into[key] ?? 0) + 1;
};

export function summarizePlayLog(events: readonly Pick<PlayEventRecord, "type" | "at" | "sessionId" | "payload">[]): PlayLogSummary {
    const byType: Record<string, number> = {};
    const hints: Record<string, number> = {};
    const verdicts: Record<string, number> = {};
    let played = 0, designedPlays = 0, designedCompleted = 0;
    for (const event of events) {
        count(byType, event.type);
        if (event.type !== "analogy") continue;
        played++;
        const payload = event.payload as Partial<AnalogyPlayInput>;
        count(hints, payload.hint);
        count(verdicts, payload.verdict);
        if (payload.designed) {
            designedPlays++;
            if (payload.verdict === "full") designedCompleted++;
        }
    }
    const times = events.map(e => e.at);
    return {
        events: events.length,
        byType,
        analogies: { played, hints, verdicts, designedPlays, designedCompleted },
        sessions: new Set(events.map(e => e.sessionId)).size,
        firstAt: times.length ? Math.min(...times) : undefined,
        lastAt: times.length ? Math.max(...times) : undefined,
    };
}

export interface PlayLogExport {
    kind: "lexical-fountain-play-log";
    exportedAt: string;
    summary: PlayLogSummary;
    events: Omit<PlayEventRecord, "deviceId" | "syncState" | "createdAt" | "updatedAt">[];
}

/** The file a player can download and share for research: no device id, no sync bookkeeping. */
export function playLogExport(events: readonly PlayEventRecord[], now = new Date()): PlayLogExport {
    return {
        kind: "lexical-fountain-play-log",
        exportedAt: now.toISOString(),
        summary: summarizePlayLog(events),
        events: events.map(({ deviceId: _device, syncState: _sync, createdAt: _created, updatedAt: _updated, ...event }) => event),
    };
}

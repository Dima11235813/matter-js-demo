import deps from "../matterJsComp/Deps";
import { MenuStore } from "../stores/MenuStore";
import { RootStore } from "../stores/RootStore";
import { stores as rootStores } from "../stores";
import { logger } from "../utils/logger";
import { semanticEngine } from "./semanticEngine";
import { isRoundRunning, recordRoundAnalogy, recordRoundGuess } from "./timedGameController";
import { applyTheme, saveThemePreference } from "../theme/palette";
import { saveLayout3d } from "../physics/layoutPresets";
import { handoffQueue } from "../space/handoff";
import { expressionAsAnalogy, ExpressionTerm, formatExpression } from "../game/wordEntry";
import { Keyword } from "../game/keywords";
import { relationHint } from "../game/relationHint";
import { analogyPayload, expressionPayload } from "../game/playLog";
import { categoryLabel, designedAnswer } from "../game/relationPairs";
import { TIMED_RULES_VERSION } from "../game/timedGame";
import type { PlayContext } from "../persistence/db";
import { syncSoon } from "./account";

/**
 * Use cases that connect the semantic engine, the MobX stores, and the physics world.
 * Physics receives words through deps.pendingWordSpawns, drained by the live CustomWorld on its
 * next frame, so a world that was torn down mid-request never receives stray bodies.
 */

/** Where and how a play happened, recorded with every play-log event. */
function playContext(stores: RootStore): PlayContext {
    const { menuStore, gameStore } = stores;
    const isGame = menuStore.view === "game";
    return {
        view: menuStore.view,
        dimension: deps.activeWorld?.dimension ?? gameStore.dimension,
        hintMode: gameStore.hintMode,
        ...(isGame ? { rulesVersion: TIMED_RULES_VERSION, relation: gameStore.relationDeal?.category } : {}),
    };
}

async function refreshStats(store: MenuStore): Promise<void> {
    store.setCorpusStats(await semanticEngine.stats());
}

export async function bootSemanticPlayground(stores: RootStore): Promise<void> {
    const { menuStore, gameStore } = stores;
    menuStore.setEngineStatus("loading", "Loading vocabulary...");
    try {
        await semanticEngine.start();
        gameStore.setHintMode(semanticEngine.hintMode);
        gameStore.setDimension(semanticEngine.dimension);
        gameStore.setBestScore(await semanticEngine.bestGameScore());
        await refreshStats(menuStore);
        stores.privacyStore.load(semanticEngine.privacyState());
        menuStore.setEngineStatus("ready");
    } catch (error) {
        logger.error("Semantic engine failed to start", error);
        menuStore.setEngineStatus("error", error instanceof Error ? error.message : String(error));
    }
}

/** Hint mode is one flag for both the sandbox and the timed game, persisted per device. */
export function toggleHintMode(stores: RootStore): void {
    const next = !stores.gameStore.hintMode;
    stores.gameStore.setHintMode(next);
    if (semanticEngine.isReady) void semanticEngine.setHintMode(next);
}

/** Dark/light theme: a per-device UI preference, applied to CSS variables and the p5 canvas. */
export function toggleTheme(stores: RootStore): void {
    const next = stores.menuStore.theme === "dark" ? "light" : "dark";
    stores.menuStore.setTheme(next);
    applyTheme(next);
    saveThemePreference(next);
}

export async function submitPlayerWord(store: MenuStore, input: string): Promise<void> {
    if (!semanticEngine.isReady) return;
    store.setWordInputMessage(`Embedding "${input.trim()}"...`);
    const outcome = await semanticEngine.addWord(input);
    if (outcome.status === "added" || outcome.status === "known") {
        void semanticEngine.logPlay("word", playContext(rootStores), { word: outcome.word, status: outcome.status, source: "typed" });
        syncSoon();
    }
    switch (outcome.status) {
        case "added":
            store.setWordInputMessage(`"${outcome.word}" joined the corpus`);
            deps.pendingWordSpawns.push({ word: outcome.word, focus: true });
            await refreshStats(store);
            break;
        case "known":
            store.setWordInputMessage(`"${outcome.word}" is already known`);
            deps.pendingWordSpawns.push({ word: outcome.word, focus: true });
            break;
        default:
            store.setWordInputMessage(outcome.reason);
    }
}

/** Words a play takes: Discovery asks the model for the fourth word; Guess mode picks all four (Feature 2.13). */
export function picksFor(view: string): number {
    return view === "game" ? 4 : 3;
}

/**
 * Word selection shared by the 2D and 3D worlds: free in Discovery, only while the clock runs in a
 * Guess round. In Discovery the third pick asks "a is to b as c is to ?" and the answer lands on the
 * board; in Guess mode the fourth pick is graded and nothing spawns. Returns whether the click was
 * consumed by selection.
 */
export function selectWordForAnalogy(stores: RootStore, id: number, text: string): boolean {
    const { menuStore } = stores;
    const isGuess = menuStore.view === "game";
    const canSelect = menuStore.view === "fountain" || (isGuess && isRoundRunning(stores));
    if (!canSelect) return false;
    const picks = picksFor(menuStore.view);
    menuStore.toggleWordSelection(id, text, picks);
    if (menuStore.selectedWordTexts.length === picks) {
        const [a, b, c, d] = menuStore.selectedWordTexts;
        menuStore.clearWordSelection();
        void (isGuess ? playGuess(stores, a, b, c, d) : playAnalogy(stores, a, b, c));
    }
    return true;
}

/**
 * Guess mode: grades a : b :: c : d against the round's dealt pairs (+100 for a real analogy, else 0)
 * and shows the model's own answer and the relation hint as feedback. Nothing spawns.
 */
export async function playGuess(stores: RootStore, a: string, b: string, c: string, d: string): Promise<void> {
    const { menuStore } = stores;
    const round = recordRoundGuess(stores, a, b, c, d);
    if (!round) return;
    const result = await semanticEngine.playGuess(a, b, c, round.points);
    const stats = semanticEngine.relationStats(a, b, c, d);
    const { p90, p95, p99 } = semanticEngine.calibration;
    const hint = stats ? relationHint(stats, { related: p90, near: p95, link: p99 }) : undefined;
    const ranked = result ? [{ word: result.answer, similarity: result.similarity }, ...result.alternatives] : [];
    const lastPlay = {
        a, b, c,
        answer: d,
        similarity: ranked.find(n => n.word === d)?.similarity ?? stats?.dc ?? 0,
        alternatives: ranked.filter(n => n.word !== d).slice(0, 3),
        points: round.points,
        isNewQuestion: !round.duplicate,
        hint,
        verdict: round.duplicate ? undefined : round.correct ? "full" as const : "none" as const,
        modelAnswer: result && result.answer !== d ? result.answer : undefined,
        guess: true,
        relation: round.category ? categoryLabel(round.category) : undefined,
    };
    menuStore.setLastPlay(lastPlay);
    menuStore.addBoardAnalogy(lastPlay);
    stores.privacyStore.notePlay();
    syncSoon();
    void semanticEngine.logPlay("analogy", playContext(stores), analogyPayload({
        a, b, c, answer: d, modelAnswer: lastPlay.modelAnswer,
        ranked, input: "click", stats, hint, verdict: lastPlay.verdict,
        designed: round.correct, points: round.points, duplicate: round.duplicate, guess: true,
    }));
    menuStore.setLastAnalogy(`${a} is to ${b} as ${c} is to ${d}: ${round.correct ? `a real analogy (+${round.points} pts)` : "not an analogy from this round"}`);
    await refreshStats(menuStore);
}

/** Saves the local play log as a JSON file the player can share for research. */
export async function downloadPlayLog(): Promise<void> {
    if (!semanticEngine.isReady) return;
    const data = await semanticEngine.exportPlayLog();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `lexical-fountain-plays-${data.exportedAt.slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Brings words into view in whichever world (2D or 3D) is live. */
export function focusWords(words: readonly string[]): void {
    deps.activeWorld?.focusWords(words);
}

/** Takes the board (and queued spawns) handed over by the previous world if it showed the same view. */
export function takeHandoff(view: string) {
    const handoff = deps.worldHandoff;
    deps.worldHandoff = undefined;
    return handoffQueue(handoff, view);
}

/** 2D <-> 3D; only meaningful with hint mode on. Persisted per device like hint mode. */
export function toggleDimension(stores: RootStore): void {
    const next = stores.gameStore.dimension === "3d" ? "2d" : "3d";
    stores.gameStore.setDimension(next);
    if (semanticEngine.isReady) void semanticEngine.setDimension(next);
}

/** 3D layout: embedding-shaped ("shape") vs the Phase 2 orbital model ("orbits"). Per device. */
export function toggleLayout3d(stores: RootStore): void {
    const next = stores.gameStore.layout3d === "shape" ? "orbits" : "shape";
    stores.gameStore.setLayout3d(next);
    saveLayout3d(next);
}

/**
 * A typed expression (Feature 2.9). `b - a + c` plays the analogy a : b :: c exactly like clicking the
 * three words; any other sum drops the nearest word. Words new to the corpus are embedded first.
 * Operands not on the board are spawned, and the whole expression takes focus.
 */
export async function playExpression(stores: RootStore, terms: readonly ExpressionTerm[]): Promise<void> {
    const { menuStore } = stores;
    if (!semanticEngine.isReady) return;
    const words = terms.map(t => t.word);
    if (menuStore.view === "game") {
        const onBoard = new Set(deps.activeWorld?.wordTexts() ?? []);
        const missing = words.filter(w => !onBoard.has(w));
        if (missing.length > 0) {
            menuStore.setWordInputMessage(`In a timed round, use words on the board (not: ${missing.join(", ")})`);
            return;
        }
    }
    let outcome = semanticEngine.evaluateExpression(terms);
    if (outcome.kind === "unknown") {
        for (const word of outcome.words) {
            menuStore.setWordInputMessage(`Embedding "${word}"...`);
            const added = await semanticEngine.addWord(word);
            if ("reason" in added) {
                menuStore.setWordInputMessage(`"${word}": ${added.reason}`);
                return;
            }
        }
        await refreshStats(menuStore);
        outcome = semanticEngine.evaluateExpression(terms);
    }
    switch (outcome.kind) {
        case "analogy": {
            const { a, b, c } = expressionAsAnalogy(terms)!;
            await playAnalogy(stores, a, b, c, { spawnOperands: true });
            menuStore.setWordInputMessage("");
            return;
        }
        case "sum": {
            const [best, ...rest] = outcome.neighbors;
            void semanticEngine.logPlay("expression", playContext(stores), expressionPayload(terms, outcome.neighbors));
            words.forEach(word => deps.pendingWordSpawns.push({ word }));
            deps.pendingWordSpawns.push({ word: best.word, focusGroup: [...words, best.word] });
            const also = rest.slice(0, 3).map(n => n.word).join(", ");
            menuStore.setWordInputMessage(`${formatExpression(terms)} ≈ ${best.word} (${best.similarity.toFixed(2)})${also ? ` · also ${also}` : ""}`);
            return;
        }
        case "blocked":
            menuStore.setWordInputMessage(`Blocked by profanity filter: ${outcome.words.join(", ")}`);
            return;
        default:
            menuStore.setWordInputMessage(`No answer for ${formatExpression(terms)}`);
    }
}

/**
 * Drops the chosen keywords of a pasted text (Feature 2.8). New words are embedded and join the
 * player corpus; the set lands one after another and is focused together at the end.
 */
export async function importKeywords(stores: RootStore, keywords: readonly Keyword[]): Promise<void> {
    const { menuStore } = stores;
    if (!semanticEngine.isReady || keywords.length === 0) return;
    const words: string[] = [];
    let added = 0;
    for (const keyword of keywords) {
        if (!keyword.isNew) {
            words.push(keyword.word);
            continue;
        }
        menuStore.setWordInputMessage(`Embedding "${keyword.word}"...`);
        const outcome = await semanticEngine.addWord(keyword.word);
        if (outcome.status === "added" || outcome.status === "known") {
            words.push(outcome.word);
            if (outcome.status === "added") added++;
        }
    }
    words.forEach((word, i) => deps.pendingWordSpawns.push(i === words.length - 1 ? { word, focusGroup: words } : { word }));
    const skipped = keywords.length - words.length;
    // Only the chosen words: the pasted text itself is never stored (data minimization).
    void semanticEngine.logPlay("import", playContext(stores), { chosen: words, newWords: added, skipped });
    menuStore.setWordInputMessage(
        `Dropped ${words.length} ${words.length === 1 ? "word" : "words"} from your text` +
        (added > 0 ? ` · ${added} new to the corpus` : "") +
        (skipped > 0 ? ` · ${skipped} could not be embedded` : "")
    );
    if (added > 0) await refreshStats(menuStore);
}

export async function playAnalogy(stores: RootStore, a: string, b: string, c: string, options: { spawnOperands?: boolean } = {}): Promise<void> {
    const { menuStore } = stores;
    const play = await semanticEngine.playAnalogy(a, b, c);
    if (!play) {
        menuStore.setLastAnalogy(`No answer for ${a} : ${b} :: ${c}`);
        return;
    }
    const { result, isNewQuestion } = play;
    // In a timed round the round rules decide the points (repeats score 0); lifetime score still accrues.
    const round = menuStore.view === "game" ? recordRoundAnalogy(stores, result) : undefined;
    const points = round ? round.points : play.points;
    // A dealt word in the solver's top 3 completes a designed play: the play lands on that word.
    const answer = round?.answer ?? result.answer;
    const stats = semanticEngine.relationStats(a, b, c, answer);
    const { p90, p95, p99 } = semanticEngine.calibration;
    const hint = stats ? relationHint(stats, { related: p90, near: p95, link: p99 }) : undefined;
    if (options.spawnOperands) {
        // Typed: the question words may not be on the board yet; focus all four together.
        [a, b, c].forEach(word => deps.pendingWordSpawns.push({ word }));
        deps.pendingWordSpawns.push({ word: answer, focusGroup: [a, b, c, answer] });
    } else {
        deps.pendingWordSpawns.push({ word: answer, focus: true });
    }
    const lastPlay = {
        ...result,
        answer,
        points,
        isNewQuestion: round ? !round.duplicate : isNewQuestion,
        hint,
        verdict: round && !round.duplicate ? round.verdict : undefined,
        modelAnswer: answer !== result.answer ? result.answer : undefined,
    };
    menuStore.setLastPlay(lastPlay);
    menuStore.addBoardAnalogy(lastPlay);
    stores.privacyStore.notePlay();
    syncSoon();
    const deal = stores.gameStore.relationDeal;
    void semanticEngine.logPlay("analogy", playContext(stores), analogyPayload({
        a, b, c, answer, modelAnswer: lastPlay.modelAnswer,
        ranked: [{ word: result.answer, similarity: result.similarity }, ...result.alternatives],
        input: options.spawnOperands ? "typed" : "click",
        stats, hint, verdict: lastPlay.verdict,
        designed: round ? designedAnswer(deal?.pairs ?? [], a, b, c) !== undefined : undefined,
        points, duplicate: round?.duplicate,
    }));
    menuStore.setLastAnalogy(`${a} is to ${b} as ${c} is to ${answer} (${points >= 0 ? "+" : ""}${points} pts)`);
    await refreshStats(menuStore);
}

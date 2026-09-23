import deps from "../matterJsComp/Deps";
import { MenuStore } from "../stores/MenuStore";
import { RootStore } from "../stores/RootStore";
import { logger } from "../utils/logger";
import { semanticEngine } from "./semanticEngine";
import { recordRoundAnalogy } from "./timedGameController";

/**
 * Use cases that connect the semantic engine, the MobX stores, and the physics world.
 * Physics receives words through deps.pendingWordSpawns, drained by the live CustomWorld on its
 * next frame, so a world that was torn down mid-request never receives stray bodies.
 */

async function refreshStats(store: MenuStore): Promise<void> {
    store.setCorpusStats(await semanticEngine.stats());
}

export async function bootSemanticPlayground(stores: RootStore): Promise<void> {
    const { menuStore, gameStore } = stores;
    menuStore.setEngineStatus("loading", "Loading vocabulary...");
    try {
        await semanticEngine.start();
        gameStore.setHintMode(semanticEngine.hintMode);
        gameStore.setBestScore(await semanticEngine.bestGameScore());
        await refreshStats(menuStore);
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

export async function submitPlayerWord(store: MenuStore, input: string): Promise<void> {
    if (!semanticEngine.isReady) return;
    store.setWordInputMessage(`Embedding "${input.trim()}"...`);
    const outcome = await semanticEngine.addWord(input);
    switch (outcome.status) {
        case "added":
            store.setWordInputMessage(`"${outcome.word}" joined the corpus`);
            deps.pendingWordSpawns.push({ word: outcome.word });
            await refreshStats(store);
            break;
        case "known":
            store.setWordInputMessage(`"${outcome.word}" is already known`);
            deps.pendingWordSpawns.push({ word: outcome.word });
            break;
        default:
            store.setWordInputMessage(outcome.reason);
    }
}

export async function playAnalogy(stores: RootStore, a: string, b: string, c: string): Promise<void> {
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
    deps.pendingWordSpawns.push({ word: result.answer });
    menuStore.setLastPlay({ ...result, points, isNewQuestion: round ? !round.duplicate : isNewQuestion });
    menuStore.setLastAnalogy(`${a} is to ${b} as ${c} is to ${result.answer} (+${points} pts)`);
    await refreshStats(menuStore);
}

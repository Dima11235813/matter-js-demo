import { action, makeObservable, observable } from 'mobx';
import { CommonStore } from "./CommonStore"
import { RootStore } from "./RootStore";
import { AppModes } from '../matterJsComp/models/appMode';
import { Neighbor } from '../embeddings/VectorIndex';
import { CorpusStats } from '../services/semanticEngine';
import { loadThemePreference, ThemeName } from '../theme/palette';
import { prependBoardAnalogy } from '../game/boardAnalogies';
import type { SavedSession } from '../game/sessions';

export type EngineStatus = "loading" | "ready" | "error"
export type AppView = "sandbox" | "fountain" | "game" | "puzzle"

/** Views that hold embedding word boxes: the free-play sandbox ("fountain") and the timed game. */
export function isWordView(view: AppView): boolean {
    return view === "fountain" || view === "game" || view === "puzzle"
}

import type { RelationHint } from "../game/relationHint"
import type { PlayVerdict } from "../game/relationPairs"

export interface LastPlay {
    a: string
    b: string
    c: string
    answer: string
    similarity: number
    points: number
    isNewQuestion: boolean
    alternatives: Neighbor[]
    /** Learning hint: did the relation a → b carry over to c → answer? (both modes) */
    hint?: RelationHint
    /** Timed rounds: how the play scored against the dealt relation pairs. */
    verdict?: PlayVerdict
    /** Timed rounds: the solver's first choice when a dealt word from its top 3 was taken instead. */
    modelAnswer?: string
    /** Guess mode: the fourth word was the player's pick (graded, nothing spawned), not the model's answer. */
    guess?: boolean
    /** Guess mode: the relation both pairs share, when the guess was correct. */
    relation?: string
    /** Guess mode: correct, but with an obvious pair (heavy → heavier), so it counts as an easier find. */
    easy?: boolean
    /** Guess mode: the right pairs of one relation, but one reversed (+25). */
    nearMiss?: boolean
}

/** An analogy played on the current board (newest first in `boardAnalogies`). */
export interface BoardAnalogy extends LastPlay {
    id: number
    playedAt: number
}

export class MenuStore extends CommonStore {
    engineStatus: EngineStatus = "loading"
    engineMessage: string = ""
    corpusStats: CorpusStats | null = null
    lastPlay: LastPlay | null = null
    boardAnalogies: BoardAnalogy[] = []
    privacyOpen = false
    /** Saved sessions panel (owner, 2026-10-05). */
    sessionsOpen = false
    sessions: SavedSession[] = []
    sessionsMessage = ""
    analogiesOpen: boolean = false
    private nextAnalogyId = 1
    wordInputMessage: string = ""
    theme: ThemeName = loadThemePreference()

    mode: AppModes
    view: AppView
    role: "admin" | "user" | "anon"
    score: number
    selectedWordIds: number[]
    selectedWordTexts: string[]
    lastAnalogy: string
    winThreshold: number
    loseThreshold: number

    constructor(store: RootStore) {
        super(store);
        this.mode = AppModes.CREATE;
        this.view = "fountain";
        this.role = "admin";
        this.score = 0;
        this.selectedWordIds = [];
        this.selectedWordTexts = [];
        this.lastAnalogy = "";
        this.winThreshold = 0.42;
        this.loseThreshold = 0.20;
        
        makeObservable(this, {
            mode: observable,
            view: observable,
            role: observable,
            score: observable,
            selectedWordIds: observable,
            selectedWordTexts: observable,
            lastAnalogy: observable,
            setMode: action,
            setView: action,
            setRole: action,
            addScore: action,
            toggleWordSelection: action,
            clearWordSelection: action,
            setLastAnalogy: action,
            engineStatus: observable,
            engineMessage: observable,
            corpusStats: observable.ref,
            lastPlay: observable.ref,
            wordInputMessage: observable,
            setEngineStatus: action,
            setScore: action,
            setCorpusStats: action,
            setLastPlay: action,
            privacyOpen: observable,
            setPrivacyOpen: action,
            sessionsOpen: observable,
            sessions: observable.ref,
            sessionsMessage: observable,
            setSessionsOpen: action,
            setSessions: action,
            setSessionsMessage: action,
            restoreBoardAnalogies: action,
            clearLastPlay: action,
            boardAnalogies: observable.ref,
            analogiesOpen: observable,
            addBoardAnalogy: action,
            clearBoardAnalogies: action,
            setAnalogiesOpen: action,
            setWordInputMessage: action,
            theme: observable,
            setTheme: action
        });
    }
    setMode = (newMode: AppModes) => {
        this.mode = newMode
    }
    setView = (newView: AppView) => {
        // A play card belongs to the mode it was played in (a Guess verdict showed on in Connect).
        if (newView !== this.view) this.lastPlay = null
        this.view = newView
    }
    setRole = (newRole: "admin" | "user" | "anon") => {
        this.role = newRole
    }
    addScore = (points: number) => {
        this.score += points
    }
    /** Selects or deselects a word; at most `maxPicks` (3 in Discovery, 4 in Guess mode) are held. */
    toggleWordSelection = (id: number, text: string, maxPicks: number = 3) => {
        const idIndex = this.selectedWordIds.indexOf(id)
        if (idIndex > -1) {
            this.selectedWordIds.splice(idIndex, 1)
            const textIndex = this.selectedWordTexts.indexOf(text)
            if (textIndex > -1) {
                this.selectedWordTexts.splice(textIndex, 1)
            }
        } else {
            if (this.selectedWordIds.length < maxPicks) {
                this.selectedWordIds.push(id)
                this.selectedWordTexts.push(text)
            }
        }
    }
    clearWordSelection = () => {
        this.selectedWordIds = []
        this.selectedWordTexts = []
    }
    setLastAnalogy = (text: string) => {
        this.lastAnalogy = text
    }
    setEngineStatus = (status: EngineStatus, message: string = "") => {
        this.engineStatus = status
        this.engineMessage = message
    }
    setScore = (score: number) => {
        this.score = score
    }
    setCorpusStats = (stats: CorpusStats) => {
        this.corpusStats = stats
        this.score = stats.score
    }
    setSessionsOpen = (open: boolean) => {
        this.sessionsOpen = open
        // The sessions and analogies panels share the top-left corner: one at a time.
        if (open) this.analogiesOpen = false
    }
    setSessions = (sessions: SavedSession[]) => {
        this.sessions = sessions
    }
    setSessionsMessage = (message: string) => {
        this.sessionsMessage = message
    }
    /** A loaded session's analogies, oldest last (the list is newest first). */
    restoreBoardAnalogies = (plays: LastPlay[]) => {
        this.boardAnalogies = plays.map(play => ({ ...play, id: this.nextAnalogyId++, playedAt: Date.now() }))
    }
    setPrivacyOpen = (open: boolean) => {
        this.privacyOpen = open
    }
    setLastPlay = (play: LastPlay) => {
        this.lastPlay = play
    }
    /** Records an analogy played on this board; the list is newest first and capped. */
    addBoardAnalogy = (play: LastPlay, playedAt: number = Date.now()) => {
        const entry: BoardAnalogy = { ...play, id: this.nextAnalogyId++, playedAt }
        this.boardAnalogies = prependBoardAnalogy(this.boardAnalogies, entry)
    }
    /** A new board (new round, new view) starts a new list; a 2D <-> 3D switch keeps it. */
    clearBoardAnalogies = () => {
        this.boardAnalogies = []
    }
    setAnalogiesOpen = (open: boolean) => {
        this.analogiesOpen = open
        if (open) this.sessionsOpen = false
    }
    clearLastPlay = () => {
        this.lastPlay = null
        this.lastAnalogy = ""
    }
    setWordInputMessage = (message: string) => {
        this.wordInputMessage = message
    }
    setTheme = (theme: ThemeName) => {
        this.theme = theme
    }
}

import { action, makeObservable, observable } from 'mobx';
import { CommonStore } from "./CommonStore"
import { RootStore } from "./RootStore";
import { AppModes } from '../matterJsComp/models/appMode';
import { Neighbor } from '../embeddings/VectorIndex';
import { CorpusStats } from '../services/semanticEngine';
import { loadThemePreference, ThemeName } from '../theme/palette';
import { prependBoardAnalogy } from '../game/boardAnalogies';

export type EngineStatus = "loading" | "ready" | "error"
export type AppView = "sandbox" | "fountain" | "game"

/** Views that hold embedding word boxes: the free-play sandbox ("fountain") and the timed game. */
export function isWordView(view: AppView): boolean {
    return view === "fountain" || view === "game"
}

export interface LastPlay {
    a: string
    b: string
    c: string
    answer: string
    similarity: number
    points: number
    isNewQuestion: boolean
    alternatives: Neighbor[]
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
        this.view = newView
    }
    setRole = (newRole: "admin" | "user" | "anon") => {
        this.role = newRole
    }
    addScore = (points: number) => {
        this.score += points
    }
    toggleWordSelection = (id: number, text: string) => {
        const idIndex = this.selectedWordIds.indexOf(id)
        if (idIndex > -1) {
            this.selectedWordIds.splice(idIndex, 1)
            const textIndex = this.selectedWordTexts.indexOf(text)
            if (textIndex > -1) {
                this.selectedWordTexts.splice(textIndex, 1)
            }
        } else {
            if (this.selectedWordIds.length < 3) {
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

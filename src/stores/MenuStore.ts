import { action, makeObservable, observable } from 'mobx';
import { CommonStore } from "./CommonStore"
import { RootStore } from "./RootStore";
import { AppModes } from '../matterJsComp/models/appMode';

export class MenuStore extends CommonStore {
    mode: AppModes
    view: "sandbox" | "fountain" | "game"
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
            setLastAnalogy: action
        });
    }
    setMode = (newMode: AppModes) => {
        this.mode = newMode
    }
    setView = (newView: "sandbox" | "fountain" | "game") => {
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
}

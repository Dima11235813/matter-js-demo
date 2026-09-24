import { action, computed, makeObservable, observable } from 'mobx';
import { CommonStore } from './CommonStore';
import { RootStore } from './RootStore';
import { defaultTimedRules, remainingMs, TimedGameRules, TimedGameState } from '../game/timedGame';
import { Layout3d, loadLayout3d } from '../physics/layoutPresets';

/**
 * UI state for the embedding modes: the hint-mode flag (shared by sandbox and timed game) and
 * the current timed round. Rules live in game/timedGame.ts; this store only holds snapshots.
 */
export class GameStore extends CommonStore {
    hintMode = true
    dimension: "2d" | "3d" = "2d"
    /** 3D layout model: "shape" (embedding-shaped, default) or "orbits" (Phase 2 model). */
    layout3d: Layout3d = loadLayout3d()
    game: TimedGameState | null = null
    now = Date.now()
    bestScore = 0
    lastRoundWasBest = false
    lastRoundPoints: { points: number, duplicate: boolean } | null = null
    readonly rules: TimedGameRules = defaultTimedRules

    constructor(store: RootStore) {
        super(store)
        makeObservable(this, {
            hintMode: observable,
            dimension: observable,
            layout3d: observable,
            setLayout3d: action,
            spaceActive: computed,
            setDimension: action,
            game: observable.ref,
            now: observable,
            bestScore: observable,
            lastRoundWasBest: observable,
            lastRoundPoints: observable.ref,
            remainingMs: computed,
            setHintMode: action,
            setGame: action,
            setNow: action,
            setBestScore: action,
            setLastRoundPoints: action,
        })
    }

    /** 3D renders only in word views with hint mode on (Epic 5 decision). */
    get spaceActive(): boolean {
        const { view } = this.store.menuStore
        return this.dimension === "3d" && this.hintMode && (view === "fountain" || view === "game")
    }

    setDimension = (dimension: "2d" | "3d") => {
        this.dimension = dimension
    }

    setLayout3d = (layout: Layout3d) => {
        this.layout3d = layout
    }

    get remainingMs(): number {
        return this.game ? remainingMs(this.game, this.now) : 0
    }

    setHintMode = (hintMode: boolean) => {
        this.hintMode = hintMode
    }
    setGame = (game: TimedGameState | null) => {
        this.game = game
        if (game?.phase === "running") this.lastRoundWasBest = false
    }
    setNow = (now: number) => {
        this.now = now
    }
    setBestScore = (bestScore: number, lastRoundWasBest = false) => {
        this.bestScore = bestScore
        this.lastRoundWasBest = lastRoundWasBest
    }
    setLastRoundPoints = (value: { points: number, duplicate: boolean } | null) => {
        this.lastRoundPoints = value
    }
}

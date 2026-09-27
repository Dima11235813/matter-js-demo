import type p5 from "p5"
import { AppModes } from "./models/appMode"
import type { Box } from "./Shapes/Box"
import type { WordWorld } from "./wordWorld"
import type { BoardHandoff } from "../space/handoff"

export interface BrowserInfo {
    width: number
    height: number
}


/** A screen overlay (the dashboard) in canvas coordinates; words are kept out from under it. */
export interface OverlayRect {
    left: number
    top: number
    right: number
    bottom: number
}

export interface WordSpawnRequest {
    word: string
    x?: number
    y?: number
    color?: string
    /** Focus the word once it is on the board (new player words and analogy answers). */
    focus?: boolean
    /**
     * Focus these words together when this request is processed (an analogy's four words, an
     * import's keywords). Queue it last: requests spawn in order, so the others are on the board.
     */
    focusGroup?: readonly string[]
}

const MENU_LEFT_PADDING = 60
class Deps {
    public boxLastClicked: Box | undefined
    /** Words queued by UI/services; drained by the active CustomWorld each frame. */
    public pendingWordSpawns: WordSpawnRequest[] = []
    /** The live world (2D or 3D); replaced when the view or dimension changes. */
    public activeWorld: WordWorld | undefined
    /**
     * Words captured from the world being torn down, in canvas pixels. A new world of the same
     * view adopts them, so switching 2D <-> 3D keeps the board instead of restarting it.
     */
    public worldHandoff: BoardHandoff | undefined
    public overlayRect: OverlayRect | undefined
    browserInfo: BrowserInfo
    p: p5 | undefined
    engine: Matter.Engine | undefined
    world: Matter.World | undefined

    constructor() {
        this.browserInfo = {
            width: window.innerWidth - MENU_LEFT_PADDING,
            height: window.innerHeight
        }
    }
}
const deps = new Deps()
export default deps
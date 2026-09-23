import p5 from "p5"
import { AppModes } from "./models/appMode"
import { Box } from "./Shapes/Box"
import type { CustomWorld } from "./CustomWorld"

export interface BrowserInfo {
    width: number
    height: number
}


export interface WordSpawnRequest {
    word: string
    x?: number
    y?: number
}

const MENU_LEFT_PADDING = 60
class Deps {
    public boxLastClicked: Box | undefined
    /** Words queued by UI/services; drained by the active CustomWorld each frame. */
    public pendingWordSpawns: WordSpawnRequest[] = []
    /** The world currently driven by p5; replaced when the view changes. */
    public activeWorld: CustomWorld | undefined
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
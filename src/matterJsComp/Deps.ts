import p5 from "p5"
import { AppModes } from "./models/appMode"
import { Box } from "./Shapes/Box"

export interface BrowserInfo {
    width: number
    height: number
}


const MENU_LEFT_PADDING = 60
class Deps {
    public boxLastClicked: Box | undefined
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
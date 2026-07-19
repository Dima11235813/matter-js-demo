import p5 from "p5"
import { CustomWorld, EventClickType } from './CustomWorld';
import deps from "./Deps";
import { stores } from "../stores";
import { AppModes } from "./models/appMode";
import Matter from "matter-js";

export class SketchHandler {
    canvas: p5.Renderer | undefined
    customWorld: CustomWorld | undefined
    constructor() {
        const { p } = deps
        p!.setup = () => {
            const { width, height } = deps.browserInfo
            this.canvas = p!.createCanvas(width, height)
            this.customWorld = new CustomWorld()
        }
        p!.draw = () => {
            this.customWorld!.draw()
        }
        p!.windowResized = () => {
            const hasSideMenu = window.innerWidth > 768
            const width = window.innerWidth - (hasSideMenu ? 60 : 0)
            const height = window.innerHeight
            deps.browserInfo.width = width
            deps.browserInfo.height = height
            p!.resizeCanvas(width, height)
            this.customWorld?.handleWindowResize(width, height)
        }
        p!.mouseDragged = () => {
            const { mode } = stores.menuStore
            if (mode === AppModes.MOVE && deps.boxLastClicked) {
                this.customWorld?.moveBoxIfOneSelected(p!.mouseX, p!.mouseY)
            }
            this.conditionallyHandleClickOrDrag(p!.mouseX, p!.mouseY)
        }
        p!.mousePressed = () => {
            this.customWorld?.catogorizeClickType(p!.mouseX, p!.mouseY)
            const { mode } = stores.menuStore
            if (mode === AppModes.CREATE) {
                this.conditionallyHandleClickOrDrag(p!.mouseX, p!.mouseY)
            }
        }
        p!.mouseMoved = () => {
            // Check hover states or dynamic tooltips if needed
        }
        p!.mouseReleased = () => {
            const { mode } = stores.menuStore
            if (mode === AppModes.MOVE && deps.boxLastClicked) {
                if (deps.boxLastClicked.body) {
                    Matter.Body.setStatic(deps.boxLastClicked.body, false)
                }
                deps.boxLastClicked = undefined
            }
        }
    }
    conditionallyHandleClickOrDrag = (x: number, y: number) => {
        const { mode } = stores.menuStore
        if (
            mode === AppModes.CREATE && this.customWorld?.clickType === EventClickType.CREATE_LETTER_BOX
        ) {
            this.customWorld?.addShape(x, y)
        }
    }
}
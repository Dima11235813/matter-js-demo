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
            // The side menu is always 60 px wide, phones included (see App.css).
            const width = window.innerWidth - 60
            const height = window.innerHeight
            deps.browserInfo.width = width
            deps.browserInfo.height = height
            p!.resizeCanvas(width, height)
            this.customWorld?.handleWindowResize(width, height)
        }
        p!.mouseDragged = (event?: MouseEvent) => {
            if (!this.isCanvasEvent(event)) return
            const { mode } = stores.menuStore
            if (mode === AppModes.MOVE && deps.boxLastClicked) {
                this.customWorld?.moveBoxIfOneSelected(p!.mouseX, p!.mouseY)
            }
            this.conditionallyHandleClickOrDrag(p!.mouseX, p!.mouseY)
        }
        p!.mousePressed = (event?: MouseEvent) => {
            // p5 listens on window, so clicks on overlay UI (inputs, menu) would otherwise spawn boxes.
            if (!this.isCanvasEvent(event)) return
            this.customWorld?.catogorizeClickType(p!.mouseX, p!.mouseY)
            const { mode } = stores.menuStore
            if (mode === AppModes.CREATE) {
                this.conditionallyHandleClickOrDrag(p!.mouseX, p!.mouseY)
            }
        }
        p!.mouseMoved = (event?: MouseEvent) => {
            if (!this.isCanvasEvent(event)) return
            this.customWorld?.handleHover(p!.mouseX, p!.mouseY)
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
    isCanvasEvent = (event?: Event): boolean => {
        if (!event || !this.canvas) return true
        return event.target === this.canvas.elt
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
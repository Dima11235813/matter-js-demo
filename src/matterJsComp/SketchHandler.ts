import p5 from "p5"
import { CustomWorld, EventClickType } from './CustomWorld';
import deps from "./Deps";
import { stores } from "../stores";
import { AppModes } from "./models/appMode";
import Matter from "matter-js";

export class SketchHandler {
    /** Extra hit margin around words for a finger (px), so a slightly-off tap still grabs or selects. */
    static readonly touchSlop = 14
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
            this.drag(p!.mouseX, p!.mouseY)
        }
        p!.mousePressed = (event?: MouseEvent) => {
            // p5 listens on window, so clicks on overlay UI (inputs, menu) would otherwise spawn boxes.
            if (!this.isCanvasEvent(event)) return
            this.press(p!.mouseX, p!.mouseY)
        }
        // Phones: p5 1.x does not turn a touchstart into mousePressed, so without these a finger never
        // grabbed a word (Move mode) and only quick taps worked, through the browser's emulated mouse
        // events. Returning false on the canvas cancels those emulated events (a tap would otherwise
        // press twice) and the browser's own pan and zoom; touches on the menu or dashboard pass through.
        p!.touchStarted = (event?: TouchEvent) => {
            if (!this.isCanvasEvent(event)) return
            const { x, y } = this.touchPoint(event) ?? { x: p!.mouseX, y: p!.mouseY }
            this.press(x, y, SketchHandler.touchSlop)
            return false
        }
        p!.touchMoved = (event?: TouchEvent) => {
            if (!this.isCanvasEvent(event)) return
            const { x, y } = this.touchPoint(event) ?? { x: p!.mouseX, y: p!.mouseY }
            this.drag(x, y)
            return false
        }
        p!.touchEnded = (event?: TouchEvent) => {
            this.release()
            if (this.isCanvasEvent(event)) return false
        }
        p!.mouseMoved = (event?: MouseEvent) => {
            if (!this.isCanvasEvent(event)) return
            this.customWorld?.handleHover(p!.mouseX, p!.mouseY)
        }
        p!.mouseReleased = () => this.release()
    }
    press = (x: number, y: number, slop: number = 0) => {
        this.customWorld?.catogorizeClickType(x, y, slop)
        if (stores.menuStore.mode === AppModes.CREATE) this.conditionallyHandleClickOrDrag(x, y, false)
    }
    drag = (x: number, y: number) => {
        if (stores.menuStore.mode === AppModes.MOVE && deps.boxLastClicked) {
            this.customWorld?.moveBoxIfOneSelected(x, y)
        }
        this.conditionallyHandleClickOrDrag(x, y, true)
    }
    release = () => {
        if (stores.menuStore.mode === AppModes.MOVE && deps.boxLastClicked) {
            if (deps.boxLastClicked.body) {
                Matter.Body.setStatic(deps.boxLastClicked.body, false)
            }
            deps.boxLastClicked = undefined
        }
    }
    /** The first touch in canvas coordinates (touchend has none left, so it falls back to p5's mouse). */
    touchPoint = (event?: TouchEvent): { x: number, y: number } | undefined => {
        const touch = event?.touches?.[0] ?? event?.changedTouches?.[0]
        if (!touch || !this.canvas) return undefined
        const rect = (this.canvas.elt as HTMLCanvasElement).getBoundingClientRect()
        return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
    }
    isCanvasEvent = (event?: Event): boolean => {
        if (!event || !this.canvas) return true
        return event.target === this.canvas.elt
    }
    conditionallyHandleClickOrDrag = (x: number, y: number, dragging: boolean = false) => {
        const { mode } = stores.menuStore
        if (
            mode === AppModes.CREATE && this.customWorld?.clickType === EventClickType.CREATE_LETTER_BOX
        ) {
            this.customWorld?.addShape(x, y, dragging)
        }
    }
}
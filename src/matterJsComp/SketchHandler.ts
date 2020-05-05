import p5 from "p5"
import { CustomWorld, EventClickType } from './CustomWorld';
import deps from "./Deps";
import { stores } from "../stores";
import { AppModes } from "./models/appMode";

export class SketchHandler {

    canvas: p5.Renderer | undefined
    customWorld: CustomWorld | undefined
    constructor() {
        const { p } = deps
        p!.setup = () => {
            //create the canvas
            const { width, height } = deps.browserInfo
            this.canvas = p!.createCanvas(width, height)
            // this.canvas = this.p.createCanvas(this.width, this.height, this.p.WEBGL)

            //create the world
            this.customWorld = new CustomWorld()
        }
        p!.draw = () => {
            this.customWorld!.draw()
        }
        p!.mouseDragged = (event: any) => {
            const { mode } = stores.menuStore
            console.log("mouse dragged")
            if (mode === AppModes.MOVE && deps.boxLastClicked) {
                this.customWorld?.moveBoxIfOneSelected(p!.mouseX, p!.mouseY)
            }
            this.conditionallyHandleClickOrDrag(p!.mouseX, p!.mouseY)
        }
        p!.mousePressed = (event: any) => {
            //check if user clicked on preview shape - or box shape
            this.customWorld?.catogorizeClickType(p!.mouseX, p!.mouseY)
            const { mode } = stores.menuStore
            console.log("mouse clicked")
            if (mode === AppModes.CREATE) {
                //if so this outcome is handle in the method
                this.conditionallyHandleClickOrDrag(p!.mouseX, p!.mouseY)
            }
        }
        p!.mouseMoved = (event: any) => {
            const { mode } = stores.menuStore
            console.log("mouse moved")
            // if (mode === AppModes.MOVE && deps.boxLastClicked) {
            //     this.customWorld?.moveBoxIfOneSelected(p!.mouseX, p!.mouseY)
            // }
            //check if user clicked on preview shape - 
            // this.customWorld?.setMouseMoveCoordinates(p!.mouseX, p!.mouseY)
        }
        p!.mouseReleased = (event: any) => {
            const x = p?.mouseX
            const y = p?.mouseY
            const { mode } = stores.menuStore
            if (mode === AppModes.MOVE && deps.boxLastClicked) {
                console.log(`Updating matterjs body to x${x} y${y} and setting last box clicked to undefined`)
                deps.boxLastClicked = undefined
            }
        }
    }
    conditionallyHandleClickOrDrag = (x: number, y: number) => {
        const { mode } = stores.menuStore
        if (
            mode === AppModes.CREATE && this.customWorld?.clickType === EventClickType.CREATE_LETTER_BOX
        ) {
            //otherwise create a shape where the user clicked
            this.customWorld?.addShape(x, y)
        }

    }
}
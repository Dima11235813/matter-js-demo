import p5 from "p5"
import { CustomWorld, EventClickType } from './CustomWorld';
import deps from "./Deps";

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
            console.log("mouse dragged")
            this.conditionallyHandleClickOrDrag(p!.mouseX, p!.mouseY)
        }
        p!.mouseClicked = (event: any) => {
            console.log("mouse clicked")
            //check if user clicked on preview shape - 
            this.customWorld?.catogorizeClickType(p!.mouseX, p!.mouseY)
            //if so this outcome is handle in the method
            this.conditionallyHandleClickOrDrag(p!.mouseX, p!.mouseY)
        }
        p!.mouseMoved = (event: any) => {
            console.log("mouse moved")
            //check if user clicked on preview shape - 
            // this.customWorld?.setMouseMoveCoordinates(p!.mouseX, p!.mouseY)
        }
    }
    conditionallyHandleClickOrDrag = (x: number, y: number) => {
        if (
            this.customWorld?.clickType === EventClickType.CREATE_LETTER_BOX
        ) {
            //otherwise create a shape where the user clicked
            this.customWorld?.addShape(x, y)
        }

    }
}
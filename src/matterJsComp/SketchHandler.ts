import p5 from "p5"
import { CustomWorld } from './CustomWorld';
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
            this.customWorld?.addShape(p!.mouseX, p!.mouseY)
        }
    }
}
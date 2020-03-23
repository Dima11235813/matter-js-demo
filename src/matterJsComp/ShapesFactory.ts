import { Box } from "./Shapes/Box";
import { BoxOptions } from "./models/boxOptions";
import p5 from "p5";
import { World } from "matter-js";
import deps from "./Deps";
import { BaseHTMLAttributes } from "react";

export class ShapesFactory {
    boxes: Box[];
    ground: Box | undefined

    constructor() {
        this.boxes = []
    }
    createBox = (boxOptions: BoxOptions) => {
        this.boxes.push(new Box(boxOptions))
    }
    createGround = () => {
        const { width, height } = deps.browserInfo
        const groundHeight = 50
        //create the ground
        let groundBox: BoxOptions = {
            x: 0, y: height - groundHeight, w: width, h: groundHeight, options: { isStatic: true }
        }
        this.ground = new Box(groundBox)
    }
}
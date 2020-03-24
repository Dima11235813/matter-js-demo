import { Box } from "./Shapes/Box";
import { BoxOptions } from "./models/boxOptions";
import p5 from "p5";
import { World } from "matter-js";
import deps from "./Deps";
import { BaseHTMLAttributes } from "react";

export class ShapesFactory {
    boxes: Box[];
    ground: Box | undefined
    totalCount: number = 0

    constructor() {
        this.boxes = []
    }
    createBox = (boxOptions: BoxOptions) => {
        this.boxes.push(new Box(boxOptions))
        this.totalCount += 1
    }
    createGround = () => {
        const { width, height } = deps.browserInfo
        const groundHeight = 50
        const leftAndRightPadding = 400
        //create the ground
        let groundBox: BoxOptions = {
            x: width / 2, 
            y: height - groundHeight, w: width  - leftAndRightPadding, h: groundHeight, options: { isStatic: true }
        }
        this.ground = new Box(groundBox)
    }
}
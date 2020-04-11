import { Box } from "./Shapes/Box";
import { BoxOptions, FloorOptions, ShapeTypes } from "./models/boxOptions";
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
        //create the world's ground
        this.createGround()
    }
    createBox = (boxOptions: BoxOptions) => {
        this.boxes.push(new Box(boxOptions))
        this.totalCount += 1
    }
    createGround = () => {
        const { width, height } = deps.browserInfo
        const groundHeight = 50
        const leftAndRightPadding = width / 5
        //create the ground
        let floor: FloorOptions = {
            x: width / 2,
            y: height - groundHeight,
            w: width - leftAndRightPadding,
            h: groundHeight,
            options: { isStatic: true },
            type: ShapeTypes.FLOOR
        }
        this.ground = new Box(floor)
    }
}
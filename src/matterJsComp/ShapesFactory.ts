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
    public boxIdToLeterIdLookup: any = {}
    public boxIdToType: any = {}
    constructor() {
        this.boxes = []
        //create the world's ground
        this.createGround()
    }
    createBox = (boxOptions: BoxOptions) => {
        let newBox = new Box(boxOptions)
        this.boxes.push(newBox)
        this.boxIdToLeterIdLookup[newBox.matterId] = newBox.text
        this.boxIdToType[newBox.matterId] = newBox.boxOptions.type
        this.totalCount += 1
    }
    removeBody = (id: number) => {
        this.boxes = this.boxes.filter(box => box.matterId !== id)
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
        this.boxIdToLeterIdLookup[this.ground.matterId] = this.ground.text
        this.boxIdToType[this.ground.matterId] = this.ground.boxOptions.type
    }
}
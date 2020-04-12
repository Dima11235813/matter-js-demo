import { Box } from "./Shapes/Box";
import { BoxOptions, FloorOptions, ShapeTypes, decordateWithTextProps } from "./models/boxOptions";
import p5 from "p5";
import { World } from "matter-js";
import deps from "./Deps";
import { BaseHTMLAttributes } from "react";
import { BaseOptions } from "vm";

export class ShapesFactory {
    nextUpBox: Box;
    boxes: Box[];
    ground: Box | undefined
    totalCount: number = 0
    public boxIdToLeterIdLookup: any = {}
    public boxIdToType: any = {}
    constructor() {
        this.boxes = []
        //create the world's ground
        this.createGround()
        this.nextUpBox = this.createTheNextBoxPreview()
    }
    createTheNextBoxPreview = (): Box => {
        let previewBox = new Box({
            boxOptions: {
                x: 0,
                y: 0,
                w: 50,
                h: 50
            },
            noMatter: true
        })
        this.boxes.push(previewBox)
        this.totalCount += 1
        return previewBox
    }
    createBoxFromTwoBodies = (bodyA: Matter.Body, bodyB: Matter.Body, newText: string, type: ShapeTypes = ShapeTypes.TWO_LETTER_BOX) => {
        let boxA_Ref = this.boxes.find(box => box.matterId === bodyA.id)
        let boxB_Ref = this.boxes.find(box => box.matterId === bodyB.id)
        if (!boxA_Ref || !boxB_Ref) {
            // console.log(`
            // Not creating two letter box 
            // ${newText} 
            // because one was removed`)
            return
        }
        // let newWidth,
        // newHeight,
        // newX,
        // newY
        const {
            x: boxA_x,
            y: boxA_y,
            w: boxA_w,
            h: boxA_h,
        } = boxA_Ref?.boxOptions
        const {
            x: boxB_x,
            y: boxB_y,
            w: boxB_w,
            h: boxB_h,
        } = boxB_Ref?.boxOptions
        let newBoxOptions = {
            x: (boxA_x + boxB_x) / 2,
            y: (boxA_y + boxB_y) / 2,
            w: boxA_w + boxB_w,
            h: boxA_h + boxB_h,
            options: {}
        }
        let newBox = new Box(decordateWithTextProps(newBoxOptions), newText)
        
        //save the type in the new box options
        newBox.boxOptions.type = type
        
        //save the new box in the collection
        this.boxes.push(newBox)

        //update lookups for this box for it's text and type
        const { matterId, text } = newBox
        this.addNewBoxDataToLookUps(matterId, text, type)
        
        //Keep track of how many boxes we have
        this.totalCount += 1
    }
    addNewBoxDataToLookUps = (matterId: number, text: string, type: ShapeTypes) => {
        this.boxIdToLeterIdLookup[matterId] = text
        this.boxIdToType[matterId] = type
    }
    createBox = (boxOptions: BoxOptions) => {
        let newBox = new Box(boxOptions)
        this.boxes.push(newBox)
        const { matterId, text } = newBox
        const { type } = newBox.boxOptions
        this.addNewBoxDataToLookUps(matterId, text, type)
        this.totalCount += 1
    }
    removeBody = (id: number) => {
        this.boxes = this.boxes.filter(box => box.matterId !== id)
        this.totalCount -= 1
    }
    createGround = () => {
        const { width, height } = deps.browserInfo
        const groundHeight = 50
        const leftAndRightPadding = width / 5
        //create the ground
        let floor: FloorOptions = {
            x: width / 2,
            y: height - groundHeight,
            w: width * 4,
            h: groundHeight * 2,
            options: { isStatic: true },
            type: ShapeTypes.FLOOR
        }
        this.ground = new Box(floor)
        this.boxIdToLeterIdLookup[this.ground.matterId] = this.ground.text
        this.boxIdToType[this.ground.matterId] = this.ground.boxOptions.type
    }
}
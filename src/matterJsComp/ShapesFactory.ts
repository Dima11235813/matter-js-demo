import { Box } from "./Shapes/Box";
import { BoxOptions, HardBodyOptions, ShapeTypes, decordateWithTextProps, ShapeBase } from "./models/boxOptions";
import p5 from "p5";
import { World } from "matter-js";
import deps from "./Deps";
import { BaseHTMLAttributes } from "react";
import { BaseOptions } from "vm";

export class ShapesFactory {
    private static readonly growthFactor = .66
    nextUpBox: Box;
    boxes: Box[];
    hardBodies: Box[];
    totalCount: number = 0
    public boxIdToTextLookup: any = {}
    public boxIdToType: any = {}
    constructor() {
        this.boxes = []
        this.hardBodies = []
        this.createHardBodies()
        this.nextUpBox = this.createTheNextBoxPreview()
    }
    createTheNextBoxPreview = (): Box => {
        const { width, height } = deps.browserInfo
        let previewBoxOptions: ShapeBase = {
            x: width / 2,
            y: 0,
            w: 50,
            h: 50,
            options: {}
        }
        previewBoxOptions = decordateWithTextProps(previewBoxOptions)
        let previewBox = new Box({
            boxOptions: previewBoxOptions,
            noMatter: true
        })
        previewBox.previewBox = true
        this.totalCount += 1
        return previewBox
    }
    createBoxFromTwoBodies = (
        bodyA: Matter.Body,
        bodyB: Matter.Body,
        newText: string,
        type: ShapeTypes = ShapeTypes.TWO_LETTER_BOX
    ) => {
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
            y: (boxA_h + boxB_h) / 2,//(boxA_y + boxB_y) / 2,
            w: (boxA_w + boxB_w) * ShapesFactory.growthFactor,
            h: (boxA_h + boxB_h) * ShapesFactory.growthFactor,
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
        this.boxIdToTextLookup[matterId] = text
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
    createHardBodies = () => {
        //create the ground
        this.createGround()
        this.createLeftWall()
        this.createRightWall()

    }
    createLeftWall = () => {
        const { width, height } = deps.browserInfo
        const wallWidth = 5
        this.createHardBody(
            0,
            height / 2,
            wallWidth,
            height
        )

    }
    createRightWall = () => {
        const { width, height } = deps.browserInfo
        const wallWidth = 5
        this.createHardBody(
            width,
            height / 2,
            wallWidth,
            height
        )

    }
    createGround = () => {
        const { width, height } = deps.browserInfo
        const groundHeight = 50
        this.createHardBody(
            width / 2,
            height - groundHeight,
            width * 4,
            groundHeight * 2
        )
    }
    createHardBody = (
        x: number,
        y: number,
        w: number,
        h: number,

    ) => {
        let body: HardBodyOptions = {
            x, y, w, h,
            options: { isStatic: true },
            type: ShapeTypes.FLOOR
        }
        let newBody = new Box(body)
        this.hardBodies.push(newBody)
        this.boxIdToTextLookup[newBody.matterId] = newBody.text
        this.boxIdToType[newBody.matterId] = newBody.boxOptions.type
    }
}
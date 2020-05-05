import { Box } from "./Shapes/Box";
import { BoxOptions, HardBodyOptions, ShapeTypes, decordateWithTextProps, ShapeBase } from "./models/boxOptions";
import p5 from "p5";
import { World } from "matter-js";
import deps from "./Deps";
import { BaseHTMLAttributes } from "react";
import { BaseOptions } from "vm";
import { getRandomLetterOrSpace, alphabet } from "../utils/textUtils";

export class ShapesFactory {
    public static readonly defaultPreviewTextBoxSize = 12
    public static readonly defaultBorder = 5
    public static readonly growthFactor = .66
    public static readonly previewBoxSize = 50
    nextUpBox: Box;
    previewBoxes: Box[];
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
        this.previewBoxes = this.createPreviewBoxes()
    }
    setLetterBasedOnXy(text: string) {
        this.nextUpBox.text = text
        this.updateBorderBasedOnLetter()
    }
    createPreviewBoxes = (): Box[] => {
        let xLocationStart = 50
        const { width } = deps.browserInfo
        let shouldShrinkBoxes = alphabet.length * xLocationStart < width
        if (shouldShrinkBoxes) {
            //change x location start based on how far under we are
        }


        return alphabet.split('').map((letter: string) => {
            xLocationStart += ShapesFactory.previewBoxSize

            //set up options and create the preview box
            let newPreviewBoxOptions = this.getPreviewBoxProps(xLocationStart)
            let newPreviewBox = new Box(newPreviewBoxOptions)

            //update its letter to be this iterations alphabet letter
            newPreviewBox.text = letter
            newPreviewBox.boxOptions.type = ShapeTypes.LETTER_PREVIEW_BOX

            return newPreviewBox

        })
    }
    getPreviewBoxProps = (x: number): any => {
        return {
            x: x,
            y: ShapesFactory.previewBoxSize / 2,
            w: ShapesFactory.previewBoxSize,
            h: ShapesFactory.previewBoxSize,
            border: ShapesFactory.defaultBorder,
            options: { isStatic: true, color: "grey" }
        }
    }
    createTheNextBoxPreview = (): Box => {
        const { width, height } = deps.browserInfo
        const previewBoxSize = 50
        let previewBoxOptions: any = {
            x: width / 2,
            y: previewBoxSize / 2,
            w: previewBoxSize,
            h: previewBoxSize,
            options: { isStatic: true }
        }
        previewBoxOptions = decordateWithTextProps(previewBoxOptions)
        let previewBox = new Box(previewBoxOptions)
        previewBox.previewBox = true
        return previewBox
    }
    getNewTextForNextBoxPreview = () => {
        this.nextUpBox.text = getRandomLetterOrSpace()
    }
    updateBorderBasedOnLetter = () => {
        //todo extract to box class logic
        this.previewBoxes.forEach((box: Box) => {
            if (
                box.text.toLowerCase() === this.nextUpBox.text.toLowerCase()
            ) {
                box.boxOptions.textSize = ShapesFactory.defaultPreviewTextBoxSize * 2
                // box.boxOptions.border = ShapesFactory.defaultBorder * 3
            } else {
                box.boxOptions.textSize = ShapesFactory.defaultPreviewTextBoxSize
                // box.boxOptions.border = ShapesFactory.defaultBorder

            }
        })
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
            y: (boxA_y + boxB_y) / 2,//(boxA_y + boxB_y) / 2,
            w: (boxA_w + boxB_w) * ShapesFactory.growthFactor,
            h: (boxA_h + boxB_h) * ShapesFactory.growthFactor,
            border: (boxA_h + boxB_h) * ShapesFactory.defaultBorder,
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
        //Update the text in the box to be the next up box
        newBox.text = this.nextUpBox.text
        //create a new next up box
        this.getNewTextForNextBoxPreview()
        this.updateBorderBasedOnLetter()

        //This was a bad idea as it added an extra body to matter js every time

        // this.nextUpBox = this.createTheNextBoxPreview()
        this.boxes.push(newBox)
        const { matterId, text } = newBox
        const { type } = newBox.boxOptions
        this.addNewBoxDataToLookUps(matterId, text, type)
        this.totalCount += 1
    }
    removeBody = (id: number) => {
        this.boxes = this.boxes.filter(box => box.matterId !== id)
        //TODO Optimize by removing 
        this.boxIdToTextLookup[id] = ""
        this.boxIdToType[id] = -1
        this.totalCount -= 1
    }
    createHardBodies = () => {
        //create the ground
        this.createGround()
        this.createCeiling()
        this.createLeftWall()
        this.createRightWall()

    }
    createLeftWall = () => {
        const { width, height } = deps.browserInfo
        const wallWidth = 5
        this.createHardBody(
            0,
            (height / 2),
            wallWidth,
            height
        )

    }
    createRightWall = () => {
        const { width, height } = deps.browserInfo
        const wallWidth = 5
        this.createHardBody(
            width - wallWidth,
            (height / 2),
            wallWidth,
            height
        )

    }
    createGround = () => {
        const { width, height } = deps.browserInfo
        const groundHeight = 5
        this.createHardBody(
            0,
            height - groundHeight,
            width * 2,
            groundHeight
        )
    }
    createCeiling = () => {
        const { width, height } = deps.browserInfo
        const groundHeight = 5
        this.createHardBody(
            0,
            0,
            width * 2,
            groundHeight
        )
    }
    createHardBody = (
        x: number,
        y: number,
        w: number,
        h: number,

    ) => {
        let body: HardBodyOptions = {
            x, y, w, h, border: ShapesFactory.defaultBorder,
            options: { isStatic: true },
            type: ShapeTypes.FLOOR
        }
        let newBody = new Box(body)
        this.hardBodies.push(newBody)
        this.boxIdToTextLookup[newBody.matterId] = newBody.text
        this.boxIdToType[newBody.matterId] = newBody.boxOptions.type
    }
}
import { Box } from "./Shapes/Box";
import { BoxOptions, HardBodyOptions, ShapeTypes, decordateWithTextProps, ShapeBase } from "./models/boxOptions";
import p5 from "p5";
import { World } from "matter-js";
import Matter from "matter-js";
import deps from "./Deps";
import type { LetterSnapshot } from "./wordWorld";
import { getRandomLetterOrSpace, alphabet } from "../utils/textUtils";
import { semanticEngine } from "../services/semanticEngine";
import { stores } from "../stores";

export class ShapesFactory {
    public static readonly defaultPreviewTextBoxSize = 12
    public static readonly defaultBorder = 4
    public static readonly growthFactor = .66
    public static readonly previewBoxSize = 50
    public nextUpBox: Box;
    public previewBoxes: Box[];
    public boxes: Box[];
    public hardBodies: Box[];
    public totalCount: number = 0
    public boxIdToTextLookup: Record<number, string> = {}
    public boxIdToType: Record<number, ShapeTypes> = {}
    constructor() {
        this.boxes = []
        this.hardBodies = []
        this.createHardBodies()
        
        const isFountain = stores.menuStore.view === "fountain"
        this.nextUpBox = isFountain ? (null as unknown as Box) : this.createTheNextBoxPreview()
        this.previewBoxes = isFountain ? [] : this.createPreviewBoxes()
    }
    setLetterBasedOnXy(text: string) {
        if (!this.nextUpBox) return
        this.nextUpBox.text = text
        this.updateBorderBasedOnLetter()
    }
    createPreviewBoxes = (): Box[] => {
        const { width } = deps.browserInfo
        const isMobile = width < 768
        const cols = isMobile ? 13 : 26
        const gap = isMobile ? 6 : 3
        const totalPadding = 16
        const availableWidth = width - totalPadding
        const previewBoxSize = Math.max(16, Math.min(40, (availableWidth / cols) - gap))
        
        const previewBoxes: Box[] = []
        alphabet.split('').forEach((letter: string, index: number) => {
            const row = Math.floor(index / cols)
            const col = index % cols
            
            const rowCount = Math.min(cols, alphabet.length - row * cols)
            const rowWidth = rowCount * (previewBoxSize + gap) - gap
            const xLocationStart = (width - rowWidth) / 2 + previewBoxSize / 2
            
            const xPos = xLocationStart + col * (previewBoxSize + gap)
            const yPos = 12 + previewBoxSize / 2 + row * (previewBoxSize + gap + 4)
            
            const newPreviewBoxOptions = this.getPreviewBoxProps(xPos, yPos, previewBoxSize)
            const newPreviewBox = new Box(newPreviewBoxOptions)
            newPreviewBox.text = letter
            newPreviewBox.boxOptions.type = ShapeTypes.LETTER_PREVIEW_BOX
            previewBoxes.push(newPreviewBox)
        })
        return previewBoxes
    }
    getPreviewBoxProps = (x: number, y: number, size: number): HardBodyOptions => {
        return {
            x: x,
            y: y,
            w: size,
            h: size,
            border: ShapesFactory.defaultBorder,
            options: { isStatic: true },
            type: ShapeTypes.LETTER_PREVIEW_BOX
        }
    }
    createTheNextBoxPreview = (): Box => {
        const { width } = deps.browserInfo
        const isMobile = width < 768
        const previewBoxSize = 40
        const yPos = isMobile ? 90 : 50
        const baseOptions: ShapeBase = {
            x: width / 2,
            y: yPos,
            w: previewBoxSize,
            h: previewBoxSize,
            border: ShapesFactory.defaultBorder,
            options: { isStatic: true }
        }
        const previewBoxOptions = decordateWithTextProps(baseOptions)
        let previewBox = new Box(previewBoxOptions)
        previewBox.previewBox = true
        return previewBox
    }
    getNewTextForNextBoxPreview = () => {
        if (!this.nextUpBox) return
        this.nextUpBox.text = getRandomLetterOrSpace()
    }
    updateBorderBasedOnLetter = () => {
        if (!this.nextUpBox) return
        this.previewBoxes.forEach((box: Box) => {
            const boxOpts = box.boxOptions as BoxOptions
            if (
                box.text.toLowerCase() === this.nextUpBox.text.toLowerCase()
            ) {
                boxOpts.textSize = 18
            } else {
                boxOpts.textSize = 12
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
            return
        }
        const {
            x: boxA_x,
            y: boxA_y,
        } = boxA_Ref.boxOptions
        const {
            x: boxB_x,
            y: boxB_y,
        } = boxB_Ref.boxOptions
        
        let newLen = newText.length
        let newWidth = newLen * 30 + 18
        let newHeight = 48

        let newBoxOptions = {
            x: (boxA_x + boxB_x) / 2,
            y: (boxA_y + boxB_y) / 2,
            w: newWidth,
            h: newHeight,
            border: ShapesFactory.defaultBorder,
            options: {}
        }
        let newBox = new Box(decordateWithTextProps(newBoxOptions), newText)
        // Letter merges only gain an embedding when they spell a known word; no model call per merge.
        newBox.embedding = semanticEngine.lookup(newText)

        newBox.boxOptions.type = type
        this.boxes.push(newBox)

        const { matterId, text } = newBox
        this.addNewBoxDataToLookUps(matterId, text, type)
        this.totalCount += 1
    }
    addNewBoxDataToLookUps = (matterId: number, text: string, type: ShapeTypes) => {
        this.boxIdToTextLookup[matterId] = text
        this.boxIdToType[matterId] = type
    }
    createBox = (boxOptions: BoxOptions) => {
        let newBox = new Box(boxOptions)
        if (this.nextUpBox) {
            newBox.text = this.nextUpBox.text
            this.getNewTextForNextBoxPreview()
            this.updateBorderBasedOnLetter()
        }
        this.boxes.push(newBox)
        const { matterId, text } = newBox
        const { type } = newBox.boxOptions
        this.addNewBoxDataToLookUps(matterId, text, type)
        this.totalCount += 1
    }
    /** Recreates a letters-mode box where it was left (Feature 2.14). */
    restoreLetterBox = (snapshot: LetterSnapshot): Box => {
        const { text, x, y, w, h, color, angle, type } = snapshot
        const newBox = new Box(decordateWithTextProps({ x, y, w, h, border: ShapesFactory.defaultBorder, options: {} }), text)
        newBox.setColor(color)
        newBox.embedding = semanticEngine.lookup(text)
        newBox.boxOptions.type = type
        if (newBox.body) Matter.Body.setAngle(newBox.body, angle)
        this.boxes.push(newBox)
        this.addNewBoxDataToLookUps(newBox.matterId, text, type)
        this.totalCount += 1
        return newBox
    }
    createWordBox = (text: string, x: number, y: number): Box => {
        let newWidth = text.length * 20 + 20
        let newHeight = 44
        let newBoxOptions = {
            x: x,
            y: y,
            w: newWidth,
            h: newHeight,
            border: ShapesFactory.defaultBorder,
            options: { friction: 0.1, restitution: 0.3 }
        }
        let newBox = new Box(decordateWithTextProps(newBoxOptions), text)
        newBox.embedding = semanticEngine.lookup(text)
        newBox.boxOptions.type = ShapeTypes.BOX
        this.boxes.push(newBox)
        
        const { matterId } = newBox
        this.addNewBoxDataToLookUps(matterId, text, ShapeTypes.BOX)
        this.totalCount += 1
        return newBox
    }
    removeBody = (id: number) => {
        this.boxes = this.boxes.filter(box => box.matterId !== id)
        this.boxIdToTextLookup[id] = ""
        this.boxIdToType[id] = -1 as unknown as ShapeTypes
        this.totalCount -= 1
    }
    createHardBodies = () => {
        this.createGround()
        this.createCeiling()
        this.createLeftWall()
        this.createRightWall()
    }
    updateHardBodies = () => {
        const { world } = deps
        if (world) {
            this.hardBodies.forEach(body => {
                if (body && body.body) {
                    World.remove(world, body.body)
                }
            })
        }
        this.hardBodies = []
        this.createHardBodies()
    }
    updatePreviewBoxes = () => {
        this.previewBoxes = this.createPreviewBoxes()
        const { width } = deps.browserInfo
        const isMobile = width < 768
        const yPos = isMobile ? 90 : 50
        if (this.nextUpBox && this.nextUpBox.body) {
            Matter.Body.setPosition(this.nextUpBox.body, { x: width / 2, y: yPos })
        }
    }
    createLeftWall = () => {
        const { height } = deps.browserInfo
        const wallWidth = 10
        this.createHardBody(
            0,
            (height / 2),
            wallWidth,
            height
        )
    }
    createRightWall = () => {
        const { width, height } = deps.browserInfo
        const wallWidth = 10
        this.createHardBody(
            width,
            (height / 2),
            wallWidth,
            height
        )
    }
    createGround = () => {
        const { width, height } = deps.browserInfo
        const groundHeight = 10
        this.createHardBody(
            width / 2,
            height - groundHeight / 2,
            width * 2,
            groundHeight
        )
    }
    createCeiling = () => {
        const { width } = deps.browserInfo
        const groundHeight = 10
        this.createHardBody(
            width / 2,
            groundHeight / 2,
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
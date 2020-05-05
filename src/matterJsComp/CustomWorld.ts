import Matter, { IPair, IEventCollision } from "matter-js";
import { ShapesFactory } from "./ShapesFactory";
import { BoxOptions, ShapeTypes, ShapeBase, decordateWithTextProps } from "./models/boxOptions";
import deps from "./Deps";
import shapeOptions from "./Shapes/shapeOptions";
import { Box } from "./Shapes/Box";
import { TypographyDisplay } from "./TypographyDisplay";
import { DictionaryTools } from "../utils/textUtils";
import { CollisionHandler } from "./CollisionHandler";
import { stores } from "../stores";
import { AppModes } from "./models/appMode";
import App from "../App";

export enum EventClickType {
    CREATE_LETTER_BOX, DRAG_BOX, SELECT_LETTER
}


export class CustomWorld {
    shapesFac: ShapesFactory;
    collisionHandler: CollisionHandler;
    typographyDisplay: TypographyDisplay;
    //TODO Move to interaction store
    clickType: EventClickType = EventClickType.CREATE_LETTER_BOX
    constructor() {
        let Engine = Matter.Engine

        // create an engine
        deps.engine = Engine.create();
        deps.world = deps.engine.world

        //test bounds
        deps.world.bounds.min.x = 0
        deps.world.bounds.min.y = 0
        deps.world.bounds.max.x = deps.browserInfo.width
        deps.world.bounds.max.y = deps.browserInfo.height

        // create a shapes factory
        this.shapesFac = new ShapesFactory()
        this.collisionHandler = new CollisionHandler(this.shapesFac)

        //create a class that applies text to the canvas
        this.typographyDisplay = new TypographyDisplay(this.shapesFac)

        //TODO Refactor into event handler
        //bind sleep event end
        // Matter.Events.on(this.body, "sleepEnd", this.sleepEndHandler)
        const { engine } = deps
        Matter.Events.on(
            engine,
            'collisionStart',
            (event: IEventCollision<Matter.Engine>) => {
                // console.log(event)
                let pairs: IPair[] = event.pairs;
                pairs.forEach((pair: IPair) => {
                    this.collisionHandler.hanldeCollision(pair)
                })
            });

        // run the engine
        Engine.run(deps.engine);

    }
    // setMouseMoveCoordinates = (x: number, y: number) => {
    //     this.mouseX
    // }
    catogorizeClickType = (x: number, y: number) => {
        const { mode } = stores.menuStore!
        //If handling click while moving around a box, drop that box

        let clickedOnPreviewBox = false
        //todo refactor to exit if finds click target
        this.shapesFac.previewBoxes.forEach((box: Box) => {
            //check if box is in click
            if (this.checkLocationIsInBox(box, x, y)) {
                this.shapesFac.setLetterBasedOnXy(box.text)
            }
        })
        if (mode === AppModes.MOVE) {
            //if in move mode we need to save which box we click everytime we click
            this.shapesFac.boxes.forEach((box: Box) => {
                if (this.checkLocationIsInBox(box, x, y)) {
                    deps.boxLastClicked = box
                }
            })
        }
        if (clickedOnPreviewBox) {
            this.clickType = EventClickType.SELECT_LETTER
        } else {
            this.clickType = EventClickType.CREATE_LETTER_BOX
        }
    }
    moveBoxIfOneSelected = (x: number, y: number) => {
        //Update the current box's locaiton
        if (deps.boxLastClicked && deps.boxLastClicked!.body && deps.boxLastClicked!.body!.position) {
            deps.boxLastClicked!.body!.position.x = x
            deps.boxLastClicked!.body!.position.y = y
        }
    }
    //TODO move to box util class or inner class fun
    checkLocationIsInBox = (box: Box, x: number, y: number): boolean => {
        const { x: boxX, y: boxY, w: boxW, h: boxH } = box.boxOptions
        const { position, angle } = box.body!
        const { x: xPos, y: yPos } = position!
        if (
            x < xPos + boxW / 2 &&
            x > xPos - boxW / 2 &&
            y < yPos + boxH / 2 &&
            y > yPos - boxH / 2

        ) {
            // debugger
            console.log("clcked on a preview box")
            return true
        }
        return false
    }
    addShape = (mx: number, my: number) => {
        //todo extract to create util in factory
        if (mx > 50 && mx < 50 * 26 + 100 && my < 75) return
        // console.log(`Adding shape at x:${mx} y:${my}`)
        const { rectWidth, rectHeight } = shapeOptions.getNewShapeOptions()
        //todo move all creation logic to encapsulated within the factory class
        let newBoxOptions: ShapeBase = {
            x: mx, y: my, w: rectWidth, h: rectHeight, options: {}, border: 1
        }
        this.shapesFac.createBox(decordateWithTextProps(newBoxOptions))

    }
    draw = () => {
        const { p } = deps
        p?.background(177)
        this.shapesFac.hardBodies.forEach(body => body ? body.show() : null)
        // console.log(`Boxes length before filter ${this.shapesFac.boxes.length}`)
        this.shapesFac.boxes = this.shapesFac.boxes.filter((box: Box) => box.body)
        // console.log(`Boxes length after filter ${this.shapesFac.boxes.length}`)
        this.shapesFac.boxes.forEach((box: Box, index: number) => {
            box && box.outOfBounds ? delete this.shapesFac.boxes[index] : box.show()
        })
        // this.shapesFac.nextUpBox.show()
        this.shapesFac.previewBoxes.forEach((previewBox: Box, index: number) => previewBox.show())
        this.shapesFac.boxes.forEach(box => box.show())
        this.typographyDisplay.show()
    }
}
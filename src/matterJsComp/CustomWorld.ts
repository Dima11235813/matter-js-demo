import Matter, { Pair, IEventCollision } from "matter-js";
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
        deps.world.bounds = deps.world.bounds || {
            min: { x: 0, y: 0 },
            max: { x: deps.browserInfo.width, y: deps.browserInfo.height }
        };
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
                let pairs: Pair[] = event.pairs;
                pairs.forEach((pair: Pair) => {
                    this.collisionHandler.handleCollision(pair)
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
        let clickedOnPreviewBox = false
        this.shapesFac.previewBoxes.forEach((box: Box) => {
            if (this.checkLocationIsInBox(box, x, y)) {
                this.shapesFac.setLetterBasedOnXy(box.text)
                clickedOnPreviewBox = true
            }
        })
        if (mode === AppModes.MOVE) {
            this.shapesFac.boxes.forEach((box: Box) => {
                if (this.checkLocationIsInBox(box, x, y)) {
                    deps.boxLastClicked = box
                    if (box.body) {
                        Matter.Body.setStatic(box.body, true)
                    }
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
        if (deps.boxLastClicked && deps.boxLastClicked.body) {
            Matter.Body.setPosition(deps.boxLastClicked.body, { x, y })
            Matter.Body.setVelocity(deps.boxLastClicked.body, { x: 0, y: 0 })
        }
    }
    handleWindowResize = (width: number, height: number) => {
        if (deps.world) {
            deps.world.bounds.max.x = width
            deps.world.bounds.max.y = height
        }
        this.shapesFac.updateHardBodies()
        this.shapesFac.updatePreviewBoxes()
    }
    checkLocationIsInBox = (box: Box, x: number, y: number): boolean => {
        const { w: boxW, h: boxH } = box.boxOptions
        if (!box.body) return false
        const { position } = box.body
        const { x: xPos, y: yPos } = position
        if (
            x < xPos + boxW / 2 &&
            x > xPos - boxW / 2 &&
            y < yPos + boxH / 2 &&
            y > yPos - boxH / 2
        ) {
            return true
        }
        return false
    }
    addShape = (mx: number, my: number) => {
        const previewTopBarHeight = 75
        if (my < previewTopBarHeight) return
        const { rectWidth, rectHeight } = shapeOptions.getNewShapeOptions()
        let newBoxOptions: ShapeBase = {
            x: mx, y: my, w: rectWidth, h: rectHeight, options: {}, border: 1
        }
        this.shapesFac.createBox(decordateWithTextProps(newBoxOptions))
    }
    draw = () => {
        const { p } = deps
        if (p) {
            p.background("#0c0c0e")
            this.shapesFac.hardBodies.forEach(body => body && body.show())
            this.shapesFac.boxes = this.shapesFac.boxes.filter((box: Box) => box && box.body && !box.outOfBounds)
            this.shapesFac.boxes.forEach(box => box.show())
            this.shapesFac.previewBoxes.forEach(previewBox => previewBox.show())
            this.typographyDisplay.show()
        }
    }
}
import Matter, { IPair, IEventCollision } from "matter-js";
import { ShapesFactory } from "./ShapesFactory";
import { BoxOptions, ShapeTypes, ShapeBase, decordateWithTextProps } from "./models/boxOptions";
import deps from "./Deps";
import shapeOptions from "./Shapes/shapeOptions";
import { Box } from "./Shapes/Box";
import { TypographyDisplay } from "./TypographyDisplay";
import { DictionaryTools } from "../utils/textUtils";
import { CollisionHandler } from "./CollisionHandler";

export class CustomWorld {
    shapesFac: ShapesFactory;
    collisionHandler: CollisionHandler;
    typographyDisplay: TypographyDisplay;
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
    addShape = (mx: number, my: number) => {
        // console.log(`Adding shape at x:${mx} y:${my}`)
        const { rectWidth, rectHeight } = shapeOptions.getNewShapeOptions()
        let newBoxOptions: ShapeBase = {
            x: mx, y: my, w: rectWidth, h: rectHeight, options: {}
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
        this.shapesFac.nextUpBox.show()
        // this.shapesFac.boxes.forEach(box => box.show())
        this.typographyDisplay.show()
    }
}
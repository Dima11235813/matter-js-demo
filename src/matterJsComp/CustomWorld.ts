import Matter, { IPair, IEventCollision } from "matter-js";
import { ShapesFactory } from "./ShapesFactory";
import { BoxOptions, ShapeTypes, ShapeBase, decordateWithTextProps } from "./models/boxOptions";
import deps from "./Deps";
import shapeOptions from "./Shapes/shapeOptions";
import { Box } from "./Shapes/Box";
import { TypographyDisplay } from "./TypographyDisplay";
import { DictionaryTools } from "../utils/textUtils";

export class CustomWorld {
    shapesFac: ShapesFactory;
    typographyDisplay: TypographyDisplay;
    tools: DictionaryTools = new DictionaryTools()
    lettersChecked: any = {}
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
                    this.pairExistenceValidityChecker(pair)
                })
            });

        // run the engine
        Engine.run(deps.engine);

    }

    pairExistenceValidityChecker = (pair: Matter.IPair) => {
        let seperationThreshold = 1
        if (pair.separation > seperationThreshold) return
        const { bodyA, bodyB } = pair

        let firstBoxId = bodyA.id
        let secondBoxId = bodyB.id
        let firstBoxType = this.shapesFac.boxIdToType[bodyA.id]
        let secondBoxType = this.shapesFac.boxIdToType[bodyB.id]

        //If colliding with currently singular floor return 
        //TODO Extract into class
        let firstBoxIsntRemovable = firstBoxType === ShapeTypes.FLOOR ||
            firstBoxType === ShapeTypes.TWO_LETTER_BOX
        let secondBoxIsntRemovable = secondBoxType === ShapeTypes.FLOOR ||
            secondBoxType === ShapeTypes.TWO_LETTER_BOX
        if (firstBoxIsntRemovable || secondBoxIsntRemovable) {
            return
        }
        let firstBoxLetter = this.shapesFac.boxIdToLeterIdLookup[firstBoxId]
        let secondBoxLetter = this.shapesFac.boxIdToLeterIdLookup[secondBoxId]

        //If a box has been kept in a collision check it can't be deleted anymore
        // if (this.lettersChecked[firstBoxLetter] || this.lettersChecked[secondBoxLetter]) return
        let twoLetterCombo = `${firstBoxLetter}${secondBoxLetter}`
        let indexOfTwoLetterCombo = this.tools.letterPairs.indexOf(twoLetterCombo)
        const removeBodies = (bodyA: Matter.Body, bodyB: Matter.Body) => {
            const { world } = deps
            if (world) {
                if (!firstBoxIsntRemovable) {
                    Matter.World.remove(world, bodyA);
                    this.shapesFac.removeBody(firstBoxId)
                }
                if (!secondBoxIsntRemovable) {
                    Matter.World.remove(world, bodyB);
                    this.shapesFac.removeBody(secondBoxId)
                }
            }
        }
        if (indexOfTwoLetterCombo === -1) {
            removeBodies(bodyA, bodyB)
        } else {
            this.lettersChecked[firstBoxLetter] = 1
            this.lettersChecked[secondBoxLetter] = 1
            // console.log(`
            // Letter ${firstBoxLetter} and ${secondBoxLetter}
            // are part of two letter combo
            // this two letter combo occurs ${this.tools.letterPairToFreqLookup[twoLetterCombo]} times
            // `)
            this.shapesFac.createBoxFromTwoBodies(bodyA, bodyB, twoLetterCombo)
            removeBodies(bodyA, bodyB)
        }
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
        this.shapesFac.ground?.show()
        // console.log(`Boxes length before filter ${this.shapesFac.boxes.length}`)
        this.shapesFac.boxes = this.shapesFac.boxes.filter((box: Box) => box.body)
        // console.log(`Boxes length after filter ${this.shapesFac.boxes.length}`)
        this.shapesFac.boxes.forEach((box: Box, index: number) => {
            box && box.outOfBounds ? delete this.shapesFac.boxes[index] : box.show()
        })
        this.shapesFac.boxes.forEach(box => box.show())
        this.typographyDisplay.show()
    }
}
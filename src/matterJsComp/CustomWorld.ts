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
        let seperationThreshold = .1//2//5 //set to 1 for most control over collision intensity
        if (pair.separation > seperationThreshold) return
        const { bodyA, bodyB } = pair

        let firstBoxId = bodyA.id
        let secondBoxId = bodyB.id
        let firstBoxType = this.shapesFac.boxIdToType[bodyA.id]
        let secondBoxType = this.shapesFac.boxIdToType[bodyB.id]

        //If colliding with currently singular floor return 
        //TODO Extract into class
        let firstBoxIsntRemovable = firstBoxType === ShapeTypes.FLOOR || firstBoxType === ShapeTypes.THREE_LETTER_BOX
        let secondBoxIsntRemovable = secondBoxType === ShapeTypes.FLOOR || secondBoxType === ShapeTypes.THREE_LETTER_BOX
        //TODO figure out how to make collision handling more dynamic
        if (firstBoxIsntRemovable || secondBoxIsntRemovable) {
            return
        } else if (
            //if the collision is between a two and three letter box - don't do anything for that collision
            firstBoxType === ShapeTypes.TWO_LETTER_BOX && secondBoxType === ShapeTypes.THREE_LETTER_BOX ||
            secondBoxType === ShapeTypes.THREE_LETTER_BOX && firstBoxType === ShapeTypes.TWO_LETTER_BOX ||
            //if the collision is between a one letter box and a three letter box don't do anything
            firstBoxType === ShapeTypes.BOX && secondBoxType === ShapeTypes.THREE_LETTER_BOX ||
            secondBoxType === ShapeTypes.BOX && firstBoxType === ShapeTypes.THREE_LETTER_BOX ||
            //if the collision is between a one letter box and a three letter box don't do anything
            firstBoxType === ShapeTypes.THREE_LETTER_BOX && secondBoxType === ShapeTypes.THREE_LETTER_BOX ||
            secondBoxType === ShapeTypes.THREE_LETTER_BOX && firstBoxType === ShapeTypes.THREE_LETTER_BOX 
            
        ) {

            return
        }
        let firstBoxLetter = this.shapesFac.boxIdToLeterIdLookup[firstBoxId]
        let secondBoxLetter = this.shapesFac.boxIdToLeterIdLookup[secondBoxId]

        //If a box has been kept in a collision check it can't be deleted anymore
        // if (this.lettersChecked[firstBoxLetter] || this.lettersChecked[secondBoxLetter]) return
        let twoLetterCombo = `${firstBoxLetter}${secondBoxLetter}`
        let twoLetterComboInverse = `${secondBoxLetter}${firstBoxLetter}`
        let indexOfTwoLetterCombo = this.tools.letterPairs.indexOf(twoLetterCombo)
        let indexOfTwoLetterComboInverse = this.tools.letterPairs.indexOf(twoLetterComboInverse)
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

        //If one of the boxes has one letter and the other has two
        if ((firstBoxType === ShapeTypes.BOX && secondBoxType === ShapeTypes.TWO_LETTER_BOX) ||
            (firstBoxType === ShapeTypes.TWO_LETTER_BOX && secondBoxType === ShapeTypes.BOX)
        ) {
            let letterAndTwoLetterCombo = `${firstBoxLetter}${secondBoxLetter}`.toLowerCase()
            let twoLetterComboAndLetter = `${secondBoxLetter}${firstBoxLetter}`.toLowerCase()
            let letterAndTwoLetterComboExistsInLookup = this.tools.letterCombos[3][letterAndTwoLetterCombo]
            let twoLetterComboAndLetterExistsInLookup = this.tools.letterCombos[3][twoLetterComboAndLetter]
            //If both variations exist, use the one with higher frequency
            if (letterAndTwoLetterComboExistsInLookup && twoLetterComboAndLetterExistsInLookup) {
                let textToUse: string
                if (twoLetterComboAndLetterExistsInLookup > letterAndTwoLetterComboExistsInLookup) {
                    textToUse = twoLetterComboAndLetter
                } else if (twoLetterComboAndLetterExistsInLookup < letterAndTwoLetterComboExistsInLookup) {
                    textToUse = letterAndTwoLetterCombo
                } else {
                    //if they're the same, then just use the first one
                    textToUse = letterAndTwoLetterCombo
                }
                //TODO extract code written three times here
                //add the new body
                this.shapesFac.createBoxFromTwoBodies(bodyA, bodyB, textToUse, ShapeTypes.TWO_LETTER_BOX)
                removeBodies(bodyA, bodyB)
            }
            else if (letterAndTwoLetterComboExistsInLookup) {
                //add the new body
                this.shapesFac.createBoxFromTwoBodies(bodyA, bodyB, letterAndTwoLetterCombo, ShapeTypes.TWO_LETTER_BOX)
                //remove the two old bodies
                removeBodies(bodyA, bodyB)
            } else if (twoLetterComboAndLetterExistsInLookup) {
                this.shapesFac.createBoxFromTwoBodies(bodyA, bodyB, twoLetterComboAndLetter, ShapeTypes.TWO_LETTER_BOX)
                removeBodies(bodyA, bodyB)
            }
        } else {
            //TODO Refactor for same handling of two letter and three letter combos
            if (indexOfTwoLetterCombo === -1 || indexOfTwoLetterComboInverse === -1) {
                removeBodies(bodyA, bodyB)
            } else {
                this.lettersChecked[firstBoxLetter] = 1
                this.lettersChecked[secondBoxLetter] = 1
                // console.log(`
                // Letter ${firstBoxLetter} and ${secondBoxLetter}
                // are part of two letter combo
                // this two letter combo occurs ${this.tools.letterPairToFreqLookup[twoLetterCombo]} times
                // `)
                if (indexOfTwoLetterCombo !== -1) {
                    this.shapesFac.createBoxFromTwoBodies(bodyA, bodyB, twoLetterCombo)
                } else if (indexOfTwoLetterComboInverse !== -1) {
                    this.shapesFac.createBoxFromTwoBodies(bodyA, bodyB, twoLetterComboInverse)
                }
                //todo Save off details of bodies to remove bodies before adding the new one
                removeBodies(bodyA, bodyB)
            }
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
        // this.shapesFac.boxes.forEach(box => box.show())
        this.typographyDisplay.show()
    }
}
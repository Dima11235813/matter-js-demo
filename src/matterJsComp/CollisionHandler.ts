import { ShapesFactory } from "./ShapesFactory";
import { ShapeTypes, getShapeTypeForLength } from "./models/boxOptions";
import { DictionaryTools, sizeOfLargestWord, determineMergeText, loadDictionaryTools } from "../utils/textUtils";
import Matter, { Body, World, Pair } from "matter-js";
import deps from "./Deps";
import { logger } from "../utils/logger";

export class CollisionHandler {
    /** Loaded on the first letter collision (see loadDictionaryTools). */
    tools: DictionaryTools | undefined
    lettersChecked: Record<string, number> = {}
    private static readonly seperationThresholdLowerBound = .02
    private static readonly seperationThresholdUpperBound = 10
    private static readonly maxAmountOfChecksForCombo = 25
    private static readonly minLettersToConsiderPointsForWord = 3


    private pair: Pair | undefined;

    private _firstBoxIsntRemovable: boolean = false;
    private _secondBoxIsntRemovable: boolean = false;

    private _firstBoxId: number = -1;
    private _secondBoxId: number = -1;

    private _firstBoxText: string = "";
    private _secondBoxText: string = "";

    private _firstBoxType: ShapeTypes | undefined;
    private _secondBoxType: ShapeTypes | undefined;

    private _bodyA: Body | undefined;
    private _bodyB: Body | undefined;

    private twoBoxTextCombo: string = "";
    private twoBoxTextComboInverse: string = "";

    private freqTwoBoxTextCombo: number = 0;
    private freqTwoBoxTextComboInverse: number = 0;

    private _potentialNewBoxTextSize: number = 1;
    private _textToUse: string = "";

    wordsFound: Record<string, number> = {}
    logInterval: NodeJS.Timeout;
    constructor(
        public shapesFac: ShapesFactory
    ) {

        this.logInterval = setInterval(() => this.logData(), 2500)

    }
    logData() {
        const shouldLog = true
        if (shouldLog && this.wordsFound && this.lettersChecked) {
            let wordsFound = Object.entries(this.wordsFound)
            let letterCombosChecked = Object.entries(this.lettersChecked)
            // console.log(`
            //         ${wordsFound.length}
            //         Number Of Words Found
            //         ${JSON.stringify(wordsFound)}
            //         Letter combos checker
            //         ${letterCombosChecked.length}
            //         ${JSON.stringify(letterCombosChecked)}
            //     `)
        }
    }
    resetValues = () => {
        this.twoBoxTextCombo = ""
        this.twoBoxTextComboInverse = ""
        this.freqTwoBoxTextCombo = 0
        this.freqTwoBoxTextComboInverse = 0
        this._potentialNewBoxTextSize = 1
        this._textToUse = ""
        this._firstBoxId = -1
        this._secondBoxId = -1
        this._firstBoxIsntRemovable = false
        this._secondBoxIsntRemovable = false
        this._firstBoxText = ""
        this._secondBoxText = ""
        this._firstBoxType = undefined
        this._secondBoxType = undefined
        this._bodyA = undefined
        this._bodyB = undefined
        this.pair = undefined

    }
    checkCollision = (pair: Pair): boolean => {
        this.pair = pair
        //if separation threshold aka collision stength 
        //isn't big enough ignore the collision
        // console.log(`Collision ${this.pair.separation}`)
        if (this.pair.separation < CollisionHandler.seperationThresholdLowerBound ||
            this.pair.separation > CollisionHandler.seperationThresholdUpperBound
        ) return false
        const { bodyA, bodyB } = this.pair

        //return if collision registered back to back
        if (this._firstBoxId === bodyA.id && this._secondBoxId === bodyB.id) return false
        this._bodyA = bodyA
        this._bodyB = bodyB

        this._firstBoxId = bodyA.id
        this._secondBoxId = bodyB.id
        if (deps.boxLastClicked &&
            (this._firstBoxId === deps.boxLastClicked.matterId ||
                this._secondBoxId === deps.boxLastClicked.matterId)
        ) {
            logger.log(`
    Ignoring collision with box being moved 
    this._firstBoxId ${this._firstBoxId}
    this._secondBoxId ${this._secondBoxId}
    deps.boxLastClicked.matterId ${deps.boxLastClicked.matterId}
                `
            )
            return false
        }

        this._firstBoxType = this.shapesFac.boxIdToType[bodyA.id]
        this._secondBoxType = this.shapesFac.boxIdToType[bodyB.id]

        this._firstBoxIsntRemovable = this._firstBoxType === ShapeTypes.FLOOR
        this._secondBoxIsntRemovable = this._secondBoxType === ShapeTypes.FLOOR

        //If colliding with floor return 
        if (this._firstBoxIsntRemovable || this._secondBoxIsntRemovable) return false
        logger.log(pair)

        this._firstBoxText = this.shapesFac.boxIdToTextLookup[this._firstBoxId]
        this._secondBoxText = this.shapesFac.boxIdToTextLookup[this._secondBoxId]

        if (!this.tools) {
            void loadDictionaryTools().then(tools => { this.tools = tools })
            return false
        }
        const mergeResult = determineMergeText(this._firstBoxText, this._secondBoxText, this.tools.letterCombos)
        if (!mergeResult.shouldMerge) return false

        this._textToUse = mergeResult.textToUse
        return true
    }
    handleCollision = (pair: Pair) => {
        let collisionIsOkayToHandle = this.checkCollision(pair)
        if (!collisionIsOkayToHandle) {
            this.resetValues()
            return false
        }
        let firstIsWord: number | undefined = this.tools?.wordLookup.get(this._firstBoxText)
        let secondIsWord: number | undefined = this.tools?.wordLookup.get(this._secondBoxText)

        if (firstIsWord &&
            this._firstBoxText.length >= CollisionHandler.minLettersToConsiderPointsForWord
        ) {
            if (this.wordsFound[this._firstBoxText]) {
                this.wordsFound[this._firstBoxText] += 1
            } else {
                this.wordsFound[this._firstBoxText] = 1
            }
        }
        if (secondIsWord &&
            this._secondBoxText.length >= CollisionHandler.minLettersToConsiderPointsForWord) {
            if (this.wordsFound[this._secondBoxText]) {
                this.wordsFound[this._secondBoxText] += 1
            } else {
                this.wordsFound[this._secondBoxText] = 1
            }
        }

        this.createNewBody()
        this.removeBothBodies()

        //keep track of how often we're checking combos
        if (!this.lettersChecked[this._firstBoxText]) {
            this.lettersChecked[this._firstBoxText] = 1
        } else {
            this.lettersChecked[this._firstBoxText] += 1
        }
        if (!this.lettersChecked[this._secondBoxText]) {
            this.lettersChecked[this._secondBoxText] = 1
        } else {
            this.lettersChecked[this._secondBoxText] += 1
        }

        let firstTextCheckFreq = this.lettersChecked[this._firstBoxText]
        let secondTextCheckFreq = this.lettersChecked[this._secondBoxText]
        if (
            (
                !firstIsWord ||
                this._firstBoxText.length < CollisionHandler.minLettersToConsiderPointsForWord
            ) &&
            firstTextCheckFreq > CollisionHandler.maxAmountOfChecksForCombo
        ) {
            if (this._bodyA) {
                this.removeBody(this._bodyA, false, this._firstBoxId)
            }
        }
        if (
            (!secondIsWord ||
                this._secondBoxText.length < CollisionHandler.minLettersToConsiderPointsForWord
            ) &&
            secondTextCheckFreq > CollisionHandler.maxAmountOfChecksForCombo
        ) {
            if (this._bodyB) {
                this.removeBody(this._bodyB, false, this._secondBoxId)
            }
        }
        this.resetValues()
        return true
    }
    logRemovedBodyData = (text: string, numberOfChecks: number) => {
        // console.log(`
        //         Removing Body
        //         ${text}
        //         Removed bodies because total combo check of ${numberOfChecks} exceeded ${CollisionHandler.maxAmountOfChecksForCombo}
        //         Number of Text Combos Checked ${Object.keys(this.lettersChecked).length}

        //     `)
    }
    createNewBody = () => {
        //if library doesn't provide two bodies in a pair collision return
        if (!this._bodyA || !this._bodyB) return
        // console.log(`
        // ${this._textToUse}
        // create new box from two bodies 
        // `
        // )
        //add the new body
        this.shapesFac.createBoxFromTwoBodies(
            this._bodyA,
            this._bodyB,
            this._textToUse,
            getShapeTypeForLength(this._potentialNewBoxTextSize)
        )
    }
    removeBody = (body: Body, isntRemovable: boolean, id: number) => {
        const { world } = deps
        if (world) {
            if (!isntRemovable) {
                World.remove(world, body);
                // console.log(`Removing id ${id}`)
                this.shapesFac.removeBody(id)
            }
        }
    }
    removeBothBodies() {
        if (this._bodyA) {
            this.removeBody(this._bodyA, this._firstBoxIsntRemovable, this._firstBoxId)
        }
        if (this._bodyB) {
            this.removeBody(this._bodyB, this._secondBoxIsntRemovable, this._secondBoxId)
        }
    }
}
import { ShapesFactory } from "./ShapesFactory";
import { ShapeTypes } from "./models/boxOptions";
import { DictionaryTools, sizeOfLargestWord } from "../utils/textUtils";
import Matter, { Body, World, IPair } from "matter-js";
import deps from "./Deps";

export class CollisionHandler {
    tools: DictionaryTools
    lettersChecked: any = {}
    private static readonly seperationThresholdLowerBound = .2
    private static readonly seperationThresholdUpperBound = 5
    private static readonly maxAmountOfChecksForCombo = 50
    private static readonly minLettersToConsiderPointsForWord = 3


    private pair: IPair | undefined;

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

    wordsFound: any = {}
    logInterval: NodeJS.Timeout;
    constructor(
        public shapesFac: ShapesFactory
    ) {
        this.tools = new DictionaryTools()

        this.logInterval = setInterval(() => this.logData(), 2500)

    }
    logData() {
        const shouldLog = true
        if (shouldLog && this.wordsFound && this.lettersChecked) {
            let wordsFound = Object.entries(this.wordsFound)
            let letterCombosChecked = Object.entries(this.lettersChecked)
            console.log(`
                    ${wordsFound.length}
                    Number Of Words Found
                    ${JSON.stringify(wordsFound)}
                    Letter combos checker
                    ${letterCombosChecked.length}
                    ${JSON.stringify(letterCombosChecked)}
                `)
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
    extractNeededData = (pair: IPair): boolean => {
        this.pair = pair
        //if separation threshold aka collision stength 
        //isn't big enough ignore the collision
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

        this._firstBoxType = this.shapesFac.boxIdToType[bodyA.id]
        this._secondBoxType = this.shapesFac.boxIdToType[bodyB.id]

        this._firstBoxIsntRemovable = this._firstBoxType === ShapeTypes.FLOOR
        this._secondBoxIsntRemovable = this._secondBoxType === ShapeTypes.FLOOR

        //If colliding with floor return 
        if (this._firstBoxIsntRemovable || this._secondBoxIsntRemovable) return false

        this._firstBoxText = this.shapesFac.boxIdToTextLookup[this._firstBoxId]
        this._secondBoxText = this.shapesFac.boxIdToTextLookup[this._secondBoxId]

        //return if the box letters combined are the same size as the largest letter'
        this._potentialNewBoxTextSize = this._firstBoxText.length + this._secondBoxText.length
        if (this._potentialNewBoxTextSize >= sizeOfLargestWord) return false

        //Set up the potential new box text
        this.twoBoxTextCombo = `${this._firstBoxText}${this._secondBoxText}`.toLowerCase()
        this.twoBoxTextComboInverse = `${this._secondBoxText}${this._firstBoxText}`.toLowerCase()

        //get the right lookup by size of new combo
        let lookUpToUse = this.tools.letterCombos[this._potentialNewBoxTextSize]

        //check if the letter pairs exist in the language
        this.freqTwoBoxTextCombo = lookUpToUse[this.twoBoxTextCombo]
        this.freqTwoBoxTextComboInverse = lookUpToUse[this.twoBoxTextComboInverse]

        return true
    }
    hanldeCollision = (pair: IPair) => {
        let allDataAvail = this.extractNeededData(pair)
        if (!allDataAvail) {
            this.resetValues()
            return false
        }
        //return if either of the box tests are already words
        let firstIsWord: number | undefined = this.tools.wordLookup.get(this._firstBoxText)
        let secondIsWord: number | undefined = this.tools.wordLookup.get(this._secondBoxText)

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

        let boxB_hasHigherFreq = this.freqTwoBoxTextComboInverse > this.freqTwoBoxTextCombo
        //If both variations exist, use the one with higher frequency
        if (this.freqTwoBoxTextCombo && this.freqTwoBoxTextComboInverse) {
            //if inverse has higher freq reassign text to use
            if (boxB_hasHigherFreq) {
                this._textToUse = this.twoBoxTextComboInverse
            }
        }
        if (this.freqTwoBoxTextCombo > 0) {
            this._textToUse = this.twoBoxTextCombo
            this.createNewBody()
            this.removeBothBodies()
            return true
        } else if (this.freqTwoBoxTextComboInverse > 0) {
            this._textToUse = this.twoBoxTextComboInverse
            this.createNewBody()
            this.removeBothBodies()
            return true
        }

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
                // this.logRemovedBodyData(this._firstBoxText, firstTextCheckFreq)
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
                // this.logRemovedBodyData(this._secondBoxText, secondTextCheckFreq)
            }
        }
        // console.log(JSON.stringify(this.lettersChecked))
        this.resetValues()
    }
    logRemovedBodyData = (text: string, numberOfChecks: number) => {
        console.log(`
                Removing Body
                ${text}
                Removed bodies because total combo check of ${numberOfChecks} exceeded ${CollisionHandler.maxAmountOfChecksForCombo}
                Number of Text Combos Checked ${Object.keys(this.lettersChecked).length}
            
            `)
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
            this._potentialNewBoxTextSize
        )
    }
    removeBody = (body: Body, isntRemovable: boolean, id: number) => {
        const { world } = deps
        if (world) {
            if (!isntRemovable) {
                World.remove(world, body);
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
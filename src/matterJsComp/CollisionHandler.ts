import { ShapesFactory } from "./ShapesFactory";
import { ShapeTypes, getShapeTypeForLength } from "./models/boxOptions";
import { sizeOfLargestWord, determineMergeText, loadDictionaryTools } from "../utils/textUtils";
import { LetterRules, prefixLetterRules } from "../game/letterRules";
import { semanticEngine } from "../services/semanticEngine";
import Matter, { Body, World, Pair } from "matter-js";
import deps from "./Deps";
import { logger } from "../utils/logger";

/** The parts of a Matter pair a merge needs; contacts made while the dictionary loads are kept as these. */
export type Contact = Pick<Pair, "bodyA" | "bodyB" | "separation">

export class CollisionHandler {
    /**
     * Merge rules, prepared when the letters world opens (or on the first letter collision): prefix rules
     * from the vocabulary, or the original dictionary when the vocabulary failed to load.
     */
    tools: LetterRules | undefined
    /** Restored boards rest in contact: no merges until this time (performance.now()). */
    quietUntil: number = 0
    /** Strong-enough letter contacts that arrived before the dictionary; merged as soon as it loads. */
    private deferredContacts: Contact[] = []
    private toolsRequested = false
    lettersChecked: Record<string, number> = {}
    private static readonly seperationThresholdLowerBound = .02
    // Was 10: a letter dropped from high onto another (overlap 10–27) never merged. At 40, 5 of 6 high
    // T/H/E drops spell "the" (1 of 5 at 10); sprinkled letters merge as before (Epic 4 · Task 4.5.9).
    private static readonly seperationThresholdUpperBound = 40
    private static readonly maxAmountOfChecksForCombo = 25
    private static readonly minLettersToConsiderPointsForWord = 3


    private pair: Contact | undefined;

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
        public shapesFac: ShapesFactory,
        preloadDictionary: boolean = false
    ) {

        this.logInterval = setInterval(() => this.logData(), 2500)
        if (preloadDictionary) this.requestTools()

    }
    /**
     * Starts loading the dictionary once. Letters resting on each other never collide again, so contacts
     * made while it loads are replayed instead of dropped (dropping them lost the first merges).
     */
    requestTools = () => {
        if (this.toolsRequested) return
        this.toolsRequested = true
        const { engine } = deps
        const rules: Promise<LetterRules> = semanticEngine.start()
            .then(() => prefixLetterRules(semanticEngine.letterWords(), sizeOfLargestWord))
            .catch(() => loadDictionaryTools())
        void rules.then(tools => {
            this.tools = tools
            const contacts = this.deferredContacts
            this.deferredContacts = []
            // A world torn down while loading (view switch) has nothing left to merge.
            if (deps.engine !== engine) return
            contacts.forEach(contact => this.handleCollision(contact))
        })
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
    checkCollision = (pair: Contact): boolean => {
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
        if (performance.now() < this.quietUntil) return false
        logger.log(pair)

        this._firstBoxText = this.shapesFac.boxIdToTextLookup[this._firstBoxId]
        this._secondBoxText = this.shapesFac.boxIdToTextLookup[this._secondBoxId]

        if (!this.tools) {
            // Copy: Matter reuses pair objects, so keep the bodies and the strength of this contact.
            this.deferredContacts.push({ bodyA, bodyB, separation: this.pair.separation })
            this.requestTools()
            return false
        }
        const mergeResult = determineMergeText(this._firstBoxText, this._secondBoxText, this.tools.letterCombos)
        if (!mergeResult.shouldMerge) return false

        this._textToUse = mergeResult.textToUse
        return true
    }
    handleCollision = (pair: Contact) => {
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
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
import { semanticEngine } from "../services/semanticEngine";
import { playAnalogy } from "../services/playground";
import { isRoundRunning, startTimedRound } from "../services/timedGameController";
import { isWordView } from "../stores/MenuStore";
import { SemanticPhysics } from "./SemanticPhysics";

export enum EventClickType {
    CREATE_LETTER_BOX, DRAG_BOX, SELECT_LETTER
}


export class CustomWorld {
    static readonly initialWordCount = 8
    static readonly maxSpawnsPerFrame = 2
    shapesFac: ShapesFactory;
    collisionHandler: CollisionHandler;
    typographyDisplay: TypographyDisplay;
    semanticPhysics: SemanticPhysics;
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

        this.semanticPhysics = new SemanticPhysics(this.shapesFac, engine!)
        deps.pendingWordSpawns = []
        deps.activeWorld = this
        const { view } = stores.menuStore
        if (isWordView(view)) {
            // StrictMode mounts twice; only the world whose engine is still live may seed words.
            semanticEngine.start()
                .then(() => {
                    if (deps.engine !== engine) return
                    if (view === "game") {
                        startTimedRound(stores)
                    } else {
                        semanticEngine.randomWords(CustomWorld.initialWordCount)
                            .forEach(word => deps.pendingWordSpawns.push({ word }))
                    }
                })
                .catch(() => { /* status surfaced by bootSemanticPlayground */ })
        }

        // run the engine
        Engine.run(deps.engine);
    }
    // setMouseMoveCoordinates = (x: number, y: number) => {
    //     this.mouseX
    // }
    catogorizeClickType = (x: number, y: number) => {
        const { mode, view } = stores.menuStore!

        let clickedOnWordBox = false
        const canSelect = view === "fountain" || (view === "game" && isRoundRunning(stores))
        if (canSelect) {
            const box = this.shapesFac.boxes.find(b => b.embedding !== undefined && this.checkLocationIsInBox(b, x, y))
            if (box) {
                clickedOnWordBox = true
                this.selectWordForAnalogy(box)
            }
        }

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
        if (clickedOnPreviewBox || clickedOnWordBox) {
            this.clickType = EventClickType.SELECT_LETTER
        } else {
            this.clickType = EventClickType.CREATE_LETTER_BOX
        }
    }
    /** Third selection completes "a is to b as c is to ?" and spawns the answer. */
    selectWordForAnalogy = (box: Box) => {
        const { menuStore } = stores
        menuStore.toggleWordSelection(box.matterId, box.text)
        if (menuStore.selectedWordTexts.length < 3) return
        const [wordA, wordB, wordC] = menuStore.selectedWordTexts
        menuStore.clearWordSelection()
        playAnalogy(stores, wordA, wordB, wordC)
    }
    /** Texts of the embedding word boxes currently in the world. */
    wordTexts = (): string[] => {
        return this.shapesFac.boxes.filter(b => b.embedding !== undefined && b.body).map(b => b.text)
    }
    /** Removes every word box (used when a timed round restarts in the same world). */
    clearWordBoxes = () => {
        deps.pendingWordSpawns = []
        this.shapesFac.boxes
            .filter(b => b.embedding !== undefined && b.body)
            .forEach(b => this.collisionHandler.removeBody(b.body!, false, b.matterId))
    }
    spawnQueuedWords = () => {
        const { width, height } = deps.browserInfo
        const batch = deps.pendingWordSpawns.splice(0, CustomWorld.maxSpawnsPerFrame)
        const onBoard = new Set(this.wordTexts())
        batch.forEach(({ word, x, y }) => {
            if (onBoard.has(word)) return
            // Spawn below the dashboard overlay so new words are never hidden behind it.
            const rx = x ?? 100 + Math.random() * Math.max(1, width - 200)
            const ry = y ?? 280 + Math.random() * Math.max(1, height - 360)
            this.shapesFac.createWordBox(word, rx, ry)
        })
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
        const { view } = stores.menuStore
        // Timed rounds have a scarce, dealt word supply: clicking empty space adds nothing.
        if (view === "game") return
        if (view === "fountain") {
            if (!semanticEngine.isReady) return
            const [randomWord] = semanticEngine.randomWords(1)
            if (randomWord) this.shapesFac.createWordBox(randomWord, mx, my)
        } else {
            const previewTopBarHeight = 75
            if (my < previewTopBarHeight) return
            const { rectWidth, rectHeight } = shapeOptions.getNewShapeOptions()
            let newBoxOptions: ShapeBase = {
                x: mx, y: my, w: rectWidth, h: rectHeight, options: {}, border: 1
            }
            this.shapesFac.createBox(decordateWithTextProps(newBoxOptions))
        }
    }
    draw = () => {
        const { p } = deps
        if (p) {
            p.background("#0c0c0e")
            
            const { view } = stores.menuStore
            if (isWordView(view)) {
                this.spawnQueuedWords()
                this.semanticPhysics.drawThreads(p)
            }
            
            this.shapesFac.hardBodies.forEach(body => body && body.show())
            this.shapesFac.boxes = this.shapesFac.boxes.filter((box: Box) => box && box.body && !box.outOfBounds)
            this.shapesFac.boxes.forEach(box => box.show())
            if (isWordView(view)) this.semanticPhysics.drawThreadLabels(p)
            
            if (view === "sandbox") {
                this.shapesFac.previewBoxes.forEach(previewBox => previewBox.show())
            }
            
            this.typographyDisplay.show()
        }
    }
}
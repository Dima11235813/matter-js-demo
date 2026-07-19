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
import { cosineSimilarity, findClosestAnalogy } from "../utils/embeddingService";

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

        const { view } = stores.menuStore
        if (view === "fountain") {
            const { width, height } = deps.browserInfo
            const randomWords = this.collisionHandler.tools.getRandomWords(6)
            randomWords.forEach((word: string) => {
                const rx = 100 + Math.random() * (width - 200)
                const ry = 100 + Math.random() * (height - 300)
                this.shapesFac.createWordBox(word, rx, ry)
            })
        }

        // run the engine
        Engine.run(deps.engine);
    }
    // setMouseMoveCoordinates = (x: number, y: number) => {
    //     this.mouseX
    // }
    catogorizeClickType = (x: number, y: number) => {
        const { mode, view } = stores.menuStore!

        if (view === "fountain") {
            this.shapesFac.boxes.forEach((box: Box) => {
                if (this.checkLocationIsInBox(box, x, y)) {
                    if (box.embedding !== undefined) {
                        stores.menuStore.toggleWordSelection(box.matterId, box.text)
                        
                        if (stores.menuStore.selectedWordTexts.length === 3) {
                            const [wordA, wordB, wordC] = stores.menuStore.selectedWordTexts
                            stores.menuStore.clearWordSelection()
                            
                            findClosestAnalogy(wordA, wordB, wordC).then(({ word: wordD, similarity }) => {
                                const rx = 100 + Math.random() * (deps.browserInfo.width - 200)
                                const ry = 100 + Math.random() * (deps.browserInfo.height - 300)
                                this.shapesFac.createWordBox(wordD, rx, ry)
                                
                                const points = Math.max(10, Math.round(similarity * 100))
                                stores.menuStore.addScore(points)
                                stores.menuStore.setLastAnalogy(`${wordA} is to ${wordB} as ${wordC} is to ${wordD} (+${points} pts)`)
                            })
                        }
                    }
                }
            })
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
        const { view } = stores.menuStore
        if (view === "fountain") {
            const randomWord = this.collisionHandler.tools.getRandomWords(1)[0]
            this.shapesFac.createWordBox(randomWord, mx, my)
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
    applyMagnetismForces = () => {
        const activeWordBoxes = this.shapesFac.boxes.filter(b => b.embedding !== undefined);
        for (let i = 0; i < activeWordBoxes.length; i++) {
            const boxA = activeWordBoxes[i];
            if (!boxA.body) continue;
            
            let forceX = 0;
            let forceY = 0;
            
            for (let j = 0; j < activeWordBoxes.length; j++) {
                if (i === j) continue;
                const boxB = activeWordBoxes[j];
                if (!boxB.body) continue;
                
                const dx = boxB.body.position.x - boxA.body.position.x;
                const dy = boxB.body.position.y - boxA.body.position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < 10) continue;
                
                const sim = cosineSimilarity(boxA.embedding!, boxB.embedding!);
                
                let magnitude = 0;
                if (sim > 0.4) {
                    // Attraction force (pulls similar concepts together)
                    magnitude = (sim - 0.4) * 0.0003;
                } else if (sim < 0.15) {
                    // Repulsion force (pushes different concepts apart, scaling down over distance)
                    magnitude = (sim - 0.15) * (150 / (distance + 1)) * 0.0003;
                }
                
                if (magnitude !== 0) {
                    forceX += (dx / distance) * magnitude;
                    forceY += (dy / distance) * magnitude;
                }
            }
            
            if (forceX !== 0 || forceY !== 0) {
                Matter.Body.applyForce(boxA.body, boxA.body.position, { x: forceX, y: forceY });
            }
        }
    }
    draw = () => {
        const { p } = deps
        if (p) {
            p.background("#0c0c0e")
            
            const { view } = stores.menuStore
            if (view === "fountain") {
                this.applyMagnetismForces()
            }
            
            this.shapesFac.hardBodies.forEach(body => body && body.show())
            this.shapesFac.boxes = this.shapesFac.boxes.filter((box: Box) => box && box.body && !box.outOfBounds)
            this.shapesFac.boxes.forEach(box => box.show())
            
            if (view === "sandbox") {
                this.shapesFac.previewBoxes.forEach(previewBox => previewBox.show())
            }
            
            this.typographyDisplay.show()
        }
    }
}
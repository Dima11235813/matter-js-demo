import Matter, { Pair, IEventCollision } from "matter-js";
import { ShapesFactory } from "./ShapesFactory";
import { BoxOptions, ShapeTypes, ShapeBase, decordateWithTextProps } from "./models/boxOptions";
import deps from "./Deps";
import shapeOptions from "./Shapes/shapeOptions";
import { Box } from "./Shapes/Box";
import { TypographyDisplay } from "./TypographyDisplay";
import { CollisionHandler } from "./CollisionHandler";
import { stores } from "../stores";
import { AppModes } from "./models/appMode";
import { semanticEngine } from "../services/semanticEngine";
import { colorHintPainter } from "../services/colorHints";
import { selectWordForAnalogy, startWordBoard, takeBoardTransfer } from "../services/playground";
import { focusTargets, LetterSnapshot, WordProbe, WordWorld } from "./wordWorld";
import { isWordView } from "../stores/MenuStore";
import { SemanticPhysics } from "./SemanticPhysics";
import { SemanticOverlay } from "./SemanticOverlay";
import { insideKeepOut } from "../physics/orbitalForces";
import { palettes } from "../theme/palette";

export enum EventClickType {
    CREATE_LETTER_BOX, DRAG_BOX, SELECT_LETTER
}


export class CustomWorld implements WordWorld {
    readonly dimension = "2d" as const
    static readonly initialWordCount = 8
    static readonly maxSpawnsPerFrame = 2
    static readonly focusMs = 2800
    shapesFac: ShapesFactory;
    collisionHandler: CollisionHandler;
    typographyDisplay: TypographyDisplay;
    semanticPhysics: SemanticPhysics;
    semanticOverlay: SemanticOverlay;
    runner: Matter.Runner | undefined;
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
        // Letters mode fetches its dictionary on open, so the first letters dropped can already merge.
        this.collisionHandler = new CollisionHandler(this.shapesFac, stores.menuStore.view === "sandbox")

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
        this.semanticOverlay = new SemanticOverlay(this.semanticPhysics, this.shapesFac)
        deps.pendingWordSpawns = []
        deps.activeWorld = this
        const { view } = stores.menuStore
        if (isWordView(view)) {
            // A 3D world of the same view hands over its whole board; another view (letters, Discovery,
            // Guess) carries its words over. Both keep their on-screen positions.
            const transfer = takeBoardTransfer(view)
            if (transfer?.kind === "continue") transfer.queue.forEach(request => deps.pendingWordSpawns.push(request))
            stores.menuStore.clearWordSelection()
            // StrictMode mounts twice; only the world whose engine is still live may seed words.
            semanticEngine.start()
                .then(() => {
                    if (deps.engine !== engine || transfer?.kind === "continue") return
                    startWordBoard(stores, transfer?.words ?? [], CustomWorld.initialWordCount)
                })
                .catch(() => { /* status surfaced by bootSemanticPlayground */ })
        }

        if (view === "sandbox" && deps.lettersBoard) {
            // Back in letters mode: the board as it was left. Restored boxes rest in contact, so hold
            // merges for a moment; otherwise they would merge into something the player never made.
            deps.lettersBoard.forEach(snapshot => this.shapesFac.restoreLetterBox(snapshot))
            deps.lettersBoard = undefined
            this.collisionHandler.quietUntil = performance.now() + 1000
        }

        // run the engine; the runner is stopped in WorldContainer.destroy()
        this.runner = Matter.Runner.run(deps.engine)
    }
    // setMouseMoveCoordinates = (x: number, y: number) => {
    //     this.mouseX
    // }
    catogorizeClickType = (x: number, y: number) => {
        const { mode, view } = stores.menuStore!

        let clickedOnWordBox = false
        if (isWordView(view)) {
            const box = this.shapesFac.boxes.find(b => b.embedding !== undefined && this.checkLocationIsInBox(b, x, y))
            if (box) clickedOnWordBox = selectWordForAnalogy(stores, box.matterId, box.text)
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
    /** Word boxes with canvas positions (hand-off, devtools, e2e). */
    wordProbes = (): WordProbe[] => {
        return this.shapesFac.boxes
            .filter(b => b.embedding !== undefined && b.body)
            .map(b => ({ text: b.text, x: b.body!.position.x, y: b.body!.position.y, position: [b.body!.position.x, b.body!.position.y], color: b.baseColor ?? b.color }))
    }
    /** Color hint mode (Feature 5.17): paint word boxes by meaning (molecules share a hue), or restore their own colors. */
    applyColorHints = () => {
        const boxes = this.shapesFac.boxes.filter(b => b.embedding !== undefined && b.body)
        if (!stores.gameStore.colorHints) {
            boxes.forEach(b => { if (b.baseColor) { b.setColor(b.baseColor); b.baseColor = undefined } })
            return
        }
        const byId = new Map(boxes.map(b => [b.body!.id, b.text]))
        const molecules = this.semanticPhysics.molecules.all()
            .map(m => [...m.offsets.keys()].map(id => byId.get(id)).filter((w): w is string => w !== undefined))
        const colors = colorHintPainter.colorsFor(boxes.map(b => b.text), molecules)
        boxes.forEach(b => {
            const color = colors.get(b.text)
            if (!color || color === b.color) return
            if (!b.baseColor) b.baseColor = b.color
            b.setColor(color)
        })
    }
    /** Letters mode: every box with its body state, captured when the view changes (Feature 2.14). */
    letterSnapshot = (): LetterSnapshot[] => {
        return this.shapesFac.boxes
            .filter(b => b.body)
            .map(b => ({
                text: b.text, x: b.body!.position.x, y: b.body!.position.y, angle: b.body!.angle,
                w: b.boxOptions.w, h: b.boxOptions.h, color: b.color, type: b.boxOptions.type as number,
            }))
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
        batch.forEach(({ word, x, y, color }) => {
            if (onBoard.has(word)) return
            // Handed-over positions can sit on the canvas edge (projected from 3D); a box spawned
            // there overlaps a wall, gets pushed outside, and is deleted, so keep it inside.
            const [rx, ry] = x !== undefined && y !== undefined
                ? [Math.min(Math.max(x, 80), width - 80), Math.min(Math.max(y, 60), height - 60)]
                : this.openSpawnPoint(width, height)
            const box = this.shapesFac.createWordBox(word, rx, ry)
            if (color) box.setColor(color)
        })
        // New player words, analogy words, and imports get focus, even if already on the board.
        const focus = focusTargets(batch)
        if (focus.length > 0) this.focusWords(focus)
    }
    /** 2D focus: the words pulse for a few seconds (no camera to move until 2D zoom, Task 5.7.1). */
    focusWords = (words: readonly string[]) => {
        const wanted = new Set(words)
        const until = performance.now() + CustomWorld.focusMs
        this.shapesFac.boxes.forEach(box => { if (box.embedding !== undefined && wanted.has(box.text)) box.focusUntil = until })
    }
    focusedWords = (): string[] => {
        const now = performance.now()
        return this.shapesFac.boxes.filter(box => box.embedding !== undefined && box.focusUntil > now).map(box => box.text)
    }
    /** Hover reveals the similarity numbers of the word under the pointer. */
    handleHover = (x: number, y: number) => {
        const box = this.shapesFac.boxes.find(b => b.embedding !== undefined && this.checkLocationIsInBox(b, x, y))
        this.semanticOverlay.setHovered(box)
    }
    /** A random point that is not under the dashboard overlay, wherever it has been moved. */
    openSpawnPoint = (width: number, height: number): [number, number] => {
        let point: [number, number] = [width / 2, height / 2]
        for (let attempt = 0; attempt < 20; attempt++) {
            point = [100 + Math.random() * Math.max(1, width - 200), 100 + Math.random() * Math.max(1, height - 180)]
            if (!deps.overlayRect || !insideKeepOut(point, deps.overlayRect, 60)) break
        }
        return point
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
        // Timed rounds have a scarce, dealt word supply, and Connect counts every word as a move:
        // clicking empty space adds nothing.
        if (view === "game" || view === "puzzle") return
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
            p.background(palettes[stores.menuStore.theme].canvas)
            
            const { view } = stores.menuStore
            if (isWordView(view)) {
                this.spawnQueuedWords()
                this.applyColorHints()
                this.semanticOverlay.drawThreads(p)
            }
            
            this.shapesFac.hardBodies.forEach(body => body && body.show())
            this.shapesFac.boxes = this.shapesFac.boxes.filter((box: Box) => box && box.body && !box.outOfBounds)
            this.shapesFac.boxes.forEach(box => box.show())
            if (isWordView(view)) this.semanticOverlay.drawThreadLabels(p)
            
            if (view === "sandbox") {
                this.shapesFac.previewBoxes.forEach(previewBox => previewBox.show())
            }
            
            this.typographyDisplay.show()
        }
    }
}
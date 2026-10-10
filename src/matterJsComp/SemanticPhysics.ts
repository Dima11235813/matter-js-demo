import Matter from "matter-js";
import deps from "./Deps";
import { Box } from "./Shapes/Box";
import { ShapesFactory } from "./ShapesFactory";
import { stores } from "../stores";
import { isWordView } from "../stores/MenuStore";
import { semanticEngine } from "../services/semanticEngine";
import { dot } from "../embeddings/vectorMath";
import { magnetismMagnitude } from "../embeddings/calibration";
import { MoleculeGraph } from "../physics/molecules";

const halfSize = (box: Box): Point => [box.boxOptions.w / 2, box.boxOptions.h / 2]
import {
    defaultOrbitalTuning, findLinks, keepOutAcceleration, orbitalAccelerations, OrbitalBody, OrbitalLink, OrbitalTuning, Point, scaleTuning, similarityMatrix,
} from "../physics/orbitalForces";

/** Matter integrates velocity += F / m * dt^2; orbital tuning is in px/step^2 at 60 Hz. */
const BASE_DELTA_SQUARED = (1000 / 60) ** 2;

// Low (not zero) gravity keeps a sense of weight; it must stay below the orbital centre pull.
const HINT = { gravity: 0.01, frictionAir: 0.06 };
const NORMAL = { gravity: 1, frictionAir: 0.01 };

/** Layout lengths are tuned for a ~560px-tall open area; shrink them on small screens. */
export function viewportScale(width: number, height: number): number {
    return Math.max(0.55, Math.min(1.3, Math.min(width, height - 240) / 560))
}

/**
 * Applies semantic forces to word bodies on every physics step (Matter's beforeUpdate), so each
 * step receives exactly one dose regardless of the sketch's frame timing.
 *
 * Hint mode: near-zero gravity, air damping, locked rotation (words stay readable), and orbital
 * forces from physics/orbitalForces.ts. Related words that touch bond into rigid molecules
 * (physics/molecules.ts). Normal mode: full gravity with the calibrated attract/repel magnetism.
 */
export class SemanticPhysics {
    /** Current p99 links and the boxes their indices refer to (read by SemanticOverlay). */
    links: OrbitalLink[] = []
    linkedBoxes: Box[] = []
    readonly molecules = new MoleculeGraph()
    /** Share of the layout's lengths in use: the board zooms out as it fills (boardLayout, Task 5.7.4). */
    lengthScale = 1
    /** Dev and research A/B: overrides on the hint tuning (e.g. molecule gravity off). */
    tuningOverrides: Partial<OrbitalTuning> = {}
    private readonly savedInertia = new WeakMap<Matter.Body, number>()
    /** Pair similarities only change when the set of words changes, not every step. */
    private simsKey = ""
    private sims: Float32Array = new Float32Array(0)

    constructor(private readonly shapesFac: ShapesFactory, private readonly engine: Matter.Engine) {
        Matter.Events.on(engine, "beforeUpdate", this.beforeUpdate)
        Matter.Events.on(engine, "afterUpdate", this.afterUpdate)
        Matter.Events.on(engine, "collisionStart", this.onCollisionStart)
    }

    private get hintActive(): boolean {
        return isWordView(stores.menuStore.view) && semanticEngine.isReady && stores.gameStore.hintMode
    }

    /** Two related words (a p99 link) pulled into contact bond into one molecule. */
    private onCollisionStart = (event: Matter.IEventCollision<Matter.Engine>) => {
        if (!this.hintActive) return
        // Every word with a body, the one being dragged (static) included: a molecule may hold it.
        const byBody = new Map(this.shapesFac.boxes.filter(b => b.embedding !== undefined && b.body).map(box => [box.body!.id, box]))
        const threshold = semanticEngine.calibration.p99
        for (const { bodyA, bodyB } of event.pairs) {
            const a = byBody.get(bodyA.id)
            const b = byBody.get(bodyB.id)
            if (!a || !b || dot(a.embedding!, b.embedding!) <= threshold) continue
            // A molecule member that left the board (solved, removed, healed) can't be laid out: skip.
            const members = [a, b].flatMap(box => [...(this.molecules.moleculeOf(box.body!.id)?.offsets.keys() ?? [])])
            if (members.some(id => !byBody.has(id))) continue
            const bonded = this.molecules.bond(
                a.body!.id,
                b.body!.id,
                id => this.positionOf(byBody, id),
                id => semanticEngine.rankOf(byBody.get(id)!.text),
                id => halfSize(byBody.get(id)!)
            )
            if (bonded) {
                const molecule = this.molecules.moleculeOf(a.body!.id)!
                for (const member of molecule.offsets.keys()) byBody.get(member)!.body!.collisionFilter.group = -molecule.id
            }
        }
    }

    /**
     * Snaps molecule members back to their fixed offsets so each molecule moves as one rigid body,
     * shifting the whole molecule if any member would end up outside the world.
     */
    private afterUpdate = () => {
        if (!this.hintActive || this.molecules.count === 0) return
        const byBody = new Map(this.shapesFac.boxes.filter(b => b.body).map(box => [box.body!.id, box]))
        const dragged = deps.boxLastClicked?.body?.id
        const targets = this.molecules.rigidTargets(id => this.positionOf(byBody, id), dragged)
        const { width, height } = deps.browserInfo
        for (const molecule of this.molecules.all()) {
            const pinnedId = dragged !== undefined && molecule.offsets.has(dragged) ? dragged : molecule.anchor
            const pinned = byBody.get(pinnedId)?.body
            if (!pinned) continue
            const placed = [...molecule.offsets.keys()]
                .filter(id => byBody.get(id)?.body)
                .map(id => ({ id, position: targets.get(id) ?? this.positionOf(byBody, id), halfSize: halfSize(byBody.get(id)!) }))
            const shift = MoleculeGraph.containmentShift(placed, [width, height])
            const shifted = shift[0] !== 0 || shift[1] !== 0
            for (const { id, position } of placed) {
                if (id === pinnedId && !shifted) continue
                const body = byBody.get(id)!.body!
                Matter.Body.setPosition(body, { x: position[0] + shift[0], y: position[1] + shift[1] })
                Matter.Body.setVelocity(body, pinned.velocity)
            }
        }
    }

    private positionOf(byBody: Map<number, Box>, id: number): number[] {
        const { x, y } = byBody.get(id)!.body!.position
        return [x, y]
    }

    private releaseMolecules() {
        for (const box of this.shapesFac.boxes) if (box.body) box.body.collisionFilter.group = 0
        this.molecules.clear()
    }

    private beforeUpdate = () => {
        if (!isWordView(stores.menuStore.view) || !semanticEngine.isReady) return
        const hint = stores.gameStore.hintMode
        const boxes = this.wordBoxes()
        this.syncBodies(boxes, hint)
        if (hint) {
            this.applyOrbits(boxes)
        } else {
            this.links = []
            this.applyMagnetism(boxes)
        }
    }

    private wordBoxes(): Box[] {
        return this.shapesFac.boxes.filter(b => b.embedding !== undefined && b.body && !b.body.isStatic)
    }

    private syncBodies(boxes: Box[], hint: boolean) {
        const settings = hint ? HINT : NORMAL
        this.engine.gravity.y = settings.gravity
        if (!hint && this.molecules.count > 0) this.releaseMolecules()
        for (const { body } of boxes) {
            body!.frictionAir = settings.frictionAir
            if (hint && !this.savedInertia.has(body!)) {
                this.savedInertia.set(body!, body!.inertia)
                Matter.Body.setAngularVelocity(body!, 0)
                Matter.Body.setAngle(body!, 0)
                Matter.Body.setInertia(body!, Infinity)
            } else if (!hint && this.savedInertia.has(body!)) {
                Matter.Body.setInertia(body!, this.savedInertia.get(body!)!)
                this.savedInertia.delete(body!)
            }
        }
    }

    /** Hint tuning for this board: lengths for the screen, times the zoom's length share. */
    tuning(width: number, height: number): OrbitalTuning {
        return scaleTuning({ ...defaultOrbitalTuning, ...this.tuningOverrides }, viewportScale(width, height) * this.lengthScale)
    }

    private applyOrbits(boxes: Box[]) {
        const bodies: OrbitalBody[] = boxes.map(box => ({
            position: [box.body!.position.x, box.body!.position.y],
            vector: box.embedding!,
            rank: semanticEngine.rankOf(box.text),
        }))
        const { width, height } = deps.browserInfo
        const cal = semanticEngine.calibration
        const tuning = this.tuning(width, height)
        const sims = this.similarities(boxes, bodies)
        this.links = findLinks(bodies, cal, tuning, sims)
        this.linkedBoxes = boxes
        const ids = boxes.map(box => box.body!.id)
        this.molecules.prune(new Set(this.shapesFac.boxes.filter(b => b.body).map(b => b.body!.id)))
        // Centre sits below the dashboard overlay so clusters settle in the open canvas.
        const groups = this.molecules.groups(ids)
        const free = orbitalAccelerations(bodies, this.links, [width / 2, height * 0.6], cal, tuning, sims, groups)
        const shared = this.molecules.shareAccelerations(ids, free, boxes.map(box => box.body!.mass))
        const accelerations = this.withKeepOut(bodies, boxes, groups, shared, tuning, [width, height])
        accelerations.forEach(([ax, ay], i) => {
            const body = boxes[i].body!
            const scale = body.mass / BASE_DELTA_SQUARED
            Matter.Body.applyForce(body, body.position, { x: ax * scale, y: ay * scale })
        })
    }

    /**
     * Adds the dashboard keep-out push after molecule sharing: each molecule moves by its most
     * trapped member's push, so averaging cannot dilute it and whole molecules leave together.
     */
    private withKeepOut(bodies: OrbitalBody[], boxes: Box[], groups: number[], accelerations: Point[], tuning: typeof defaultOrbitalTuning, bounds: Point): Point[] {
        const rect = deps.overlayRect
        if (!rect) return accelerations
        const pushes = bodies.map((b, i) => keepOutAcceleration(b.position, rect, tuning, bounds, halfSize(boxes[i])))
        const strongest = new Map<number, Point>()
        pushes.forEach((push, i) => {
            const best = strongest.get(groups[i])
            if (groups[i] >= 0 && (!best || Math.hypot(...push) > Math.hypot(...best))) strongest.set(groups[i], push)
        })
        return accelerations.map((a, i) => {
            const push = groups[i] >= 0 ? strongest.get(groups[i])! : pushes[i]
            return a.map((v, k) => v + push[k])
        })
    }

    private similarities(boxes: Box[], bodies: OrbitalBody[]): Float32Array {
        const key = boxes.map(b => b.matterId).join(",")
        if (key !== this.simsKey) {
            this.simsKey = key
            this.sims = similarityMatrix(bodies.map(b => b.vector))
        }
        return this.sims
    }

    private applyMagnetism(boxes: Box[]) {
        const calibration = semanticEngine.calibration
        for (const boxA of boxes) {
            let forceX = 0
            let forceY = 0
            for (const boxB of boxes) {
                if (boxA === boxB) continue
                const dx = boxB.body!.position.x - boxA.body!.position.x
                const dy = boxB.body!.position.y - boxA.body!.position.y
                const distance = Math.sqrt(dx * dx + dy * dy)
                if (distance < 10) continue
                const magnitude = magnetismMagnitude(dot(boxA.embedding!, boxB.embedding!), distance, calibration)
                forceX += (dx / distance) * magnitude
                forceY += (dy / distance) * magnitude
            }
            if (forceX !== 0 || forceY !== 0) {
                Matter.Body.applyForce(boxA.body!, boxA.body!.position, { x: forceX, y: forceY })
            }
        }
    }
}

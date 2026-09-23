import Matter from "matter-js";
import p5 from "p5";
import deps from "./Deps";
import { Box } from "./Shapes/Box";
import { ShapesFactory } from "./ShapesFactory";
import { stores } from "../stores";
import { isWordView } from "../stores/MenuStore";
import { semanticEngine } from "../services/semanticEngine";
import { dot } from "../embeddings/vectorMath";
import { magnetismMagnitude } from "../embeddings/calibration";
import { findLinks, orbitalAccelerations, OrbitalBody, OrbitalLink } from "../physics/orbitalForces";

/** Matter integrates velocity += F / m * dt^2; orbital tuning is in px/step^2 at 60 Hz. */
const BASE_DELTA_SQUARED = (1000 / 60) ** 2;

// Low (not zero) gravity keeps a sense of weight; it must stay below the orbital centre pull.
const HINT = { gravity: 0.01, frictionAir: 0.06 };
const NORMAL = { gravity: 1, frictionAir: 0.01 };

/**
 * Applies semantic forces to word bodies on every physics step (Matter's beforeUpdate), so each
 * step receives exactly one dose regardless of p5's frame timing.
 *
 * Hint mode: near-zero gravity, air damping, locked rotation (words stay readable), and orbital
 * forces from physics/orbitalForces.ts. Normal mode: full gravity with the calibrated
 * attract/repel magnetism.
 */
export class SemanticPhysics {
    private links: OrbitalLink[] = []
    private linkedBoxes: Box[] = []
    private readonly savedInertia = new WeakMap<Matter.Body, number>()

    constructor(private readonly shapesFac: ShapesFactory, private readonly engine: Matter.Engine) {
        Matter.Events.on(engine, "beforeUpdate", this.beforeUpdate)
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

    private applyOrbits(boxes: Box[]) {
        const bodies: OrbitalBody[] = boxes.map(box => ({
            x: box.body!.position.x,
            y: box.body!.position.y,
            vector: box.embedding!,
            rank: semanticEngine.rankOf(box.text),
        }))
        const { width, height } = deps.browserInfo
        this.links = findLinks(bodies, semanticEngine.calibration)
        this.linkedBoxes = boxes
        // Centre sits below the dashboard overlay so clusters settle in the open canvas.
        const accelerations = orbitalAccelerations(bodies, this.links, { x: width / 2, y: height * 0.6 })
        accelerations.forEach(({ ax, ay }, i) => {
            const body = boxes[i].body!
            const scale = body.mass / BASE_DELTA_SQUARED
            Matter.Body.applyForce(body, body.position, { x: ax * scale, y: ay * scale })
        })
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

    /** Hint-mode threads (drawn under the boxes): brighter and thicker as similarity grows. */
    drawThreads(p: p5) {
        if (!stores.gameStore.hintMode) return
        p.push()
        this.forEachDrawableLink((link, a, b) => {
            p.stroke(0, 242, 254, 40 + 170 * link.strength)
            p.strokeWeight(1 + 2 * link.strength)
            p.line(a.x, a.y, b.x, b.y)
        })
        p.pop()
    }

    /** Similarity labels (drawn over the boxes) on a dark pill so crowded clusters stay legible. */
    drawThreadLabels(p: p5) {
        if (!stores.gameStore.hintMode) return
        p.push()
        p.textSize(11)
        p.textAlign(p.CENTER, p.CENTER)
        p.rectMode(p.CENTER)
        this.forEachDrawableLink((link, a, b) => {
            const x = (a.x + b.x) / 2
            const y = (a.y + b.y) / 2
            p.noStroke()
            p.fill(12, 12, 14, 210)
            p.rect(x, y, 30, 15, 7)
            p.fill(0, 242, 254, 120 + 135 * link.strength)
            p.text(link.similarity.toFixed(2), x, y)
        })
        p.pop()
    }

    private forEachDrawableLink(draw: (link: OrbitalLink, a: Matter.Vector, b: Matter.Vector) => void) {
        for (const link of this.links) {
            const a = this.linkedBoxes[link.i]?.body
            const b = this.linkedBoxes[link.j]?.body
            if (a && b) draw(link, a.position, b.position)
        }
    }
}

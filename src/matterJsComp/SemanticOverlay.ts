import Matter from "matter-js";
import type { Sketch } from "./Sketch";
import { Box } from "./Shapes/Box";
import { ShapesFactory } from "./ShapesFactory";
import { SemanticPhysics } from "./SemanticPhysics";
import { stores } from "../stores";
import { palettes, rgb } from "../theme/palette";
import { OrbitalLink } from "../physics/orbitalForces";

/**
 * Hint-mode drawing on top of the physics: relation threads, molecule halos, and similarity
 * numbers for the hovered word. Reads link and molecule state from SemanticPhysics.
 */
export class SemanticOverlay {
    private hovered: Box | undefined

    constructor(private readonly physics: SemanticPhysics, private readonly shapesFac: ShapesFactory) {}

    private get links(): OrbitalLink[] {
        return this.physics.links
    }

    private get linkedBoxes(): Box[] {
        return this.physics.linkedBoxes
    }

    private get molecules() {
        return this.physics.molecules
    }

    setHovered(box: Box | undefined) {
        this.hovered = box
    }

    /** Hint-mode threads (drawn under the boxes): stronger links are more opaque and thicker. */
    drawThreads(p: Sketch) {
        if (!stores.gameStore.hintMode) return
        const [r, g, b] = rgb(palettes[stores.menuStore.theme].thread)
        this.drawMoleculeHalos(p)
        p.push()
        this.forEachDrawableLink((link, from, to, touchesHover) => {
            p.stroke(r, g, b, touchesHover ? 255 : 50 + 160 * link.strength)
            p.strokeWeight((touchesHover ? 2 : 1) + 2 * link.strength)
            p.line(from.x, from.y, to.x, to.y)
        })
        p.pop()
    }

    /**
     * A soft shared halo behind every member makes each molecule read as one unit. Each molecule
     * gets its own hue (golden-angle spacing by id) so neighbouring molecules stay distinguishable
     * even when they touch or tangle.
     */
    private drawMoleculeHalos(p: Sketch) {
        if (this.molecules.count === 0) return
        const byBody = new Map(this.shapesFac.boxes.filter(box => box.body).map(box => [box.body!.id, box]))
        const light = stores.menuStore.theme === "light"
        p.push()
        p.noStroke()
        p.rectMode(p.CENTER)
        p.colorMode(p.HSB, 360, 100, 100, 255)
        for (const molecule of this.molecules.all()) {
            p.fill((molecule.id * 137.508) % 360, light ? 55 : 70, light ? 85 : 75, light ? 110 : 95)
            for (const id of molecule.offsets.keys()) {
                const box = byBody.get(id)
                if (!box?.body) continue
                p.rect(box.body.position.x, box.body.position.y, box.boxOptions.w + 16, box.boxOptions.h + 16, 12)
            }
        }
        p.pop()
    }

    /**
     * Similarity numbers only for the hovered word's links (drawn over the boxes). Labelling every
     * link covered the words themselves on dense boards.
     */
    drawThreadLabels(p: Sketch) {
        if (!stores.gameStore.hintMode || !this.hovered) return
        const palette = palettes[stores.menuStore.theme]
        p.push()
        p.textSize(12)
        p.textAlign(p.CENTER, p.CENTER)
        p.rectMode(p.CENTER)
        this.forEachDrawableLink((link, from, to, touchesHover) => {
            if (!touchesHover) return
            const x = (from.x + to.x) / 2
            const y = (from.y + to.y) / 2
            p.stroke(palette.thread)
            p.strokeWeight(1)
            p.fill(palette.labelBackground)
            p.rect(x, y, 36, 18, 9)
            p.noStroke()
            p.fill(palette.thread)
            p.text(link.similarity.toFixed(2), x, y)
        })
        p.pop()
    }

    private forEachDrawableLink(draw: (link: OrbitalLink, a: Matter.Vector, b: Matter.Vector, touchesHover: boolean) => void) {
        for (const link of this.links) {
            const boxA = this.linkedBoxes[link.i]
            const boxB = this.linkedBoxes[link.j]
            if (!boxA?.body || !boxB?.body) continue
            const touchesHover = this.hovered !== undefined && (boxA === this.hovered || boxB === this.hovered)
            draw(link, boxA.body.position, boxB.body.position, touchesHover)
        }
    }
}

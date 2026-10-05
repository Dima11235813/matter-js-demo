import deps from "./Deps"
import { ShapesFactory } from "./ShapesFactory"
import { stores } from "../stores"
import { palettes } from "../theme/palette"

export class TypographyDisplay {
    constructor(
        public shapesFac: ShapesFactory
    ) {


    }
    show = () => {
        this.showCarryList()
        const { p, world } = deps
        if (p && world && import.meta.env.DEV) {
            const numberOfBodiesInWorld = world?.bodies.length - 1 //subtract for the floor
            const numberOfShapesInFac = this.shapesFac.boxes.length
            const textToDisplay = `
            Frame Rate ${Math.round(p.frameRate())}
            Number of Bodies in World: ${numberOfBodiesInWorld}
            Number of Shapes in Factory: ${numberOfShapesInFac}
            Total Created ${this.shapesFac.totalCount}
            `
            //https://p5js.org/reference/#/p5/text
            p.push()
            p.noStroke()
            p.fill(palettes[stores.menuStore.theme].canvasText)
            p.text(textToDisplay, 20, 120)
            p.pop()
        }
    }
    /** Letters mode: the words that will carry into Discovery and Guess (outlined on the board). */
    carryList = (): string[] => {
        const words = this.shapesFac.boxes.filter(box => box.body && box.carriesFromLetters()).map(box => box.text.toLowerCase())
        return [...new Set(words)]
    }
    showCarryList = () => {
        const { p } = deps
        if (!p || stores.menuStore.view !== "sandbox") return
        const words = this.carryList()
        const palette = palettes[stores.menuStore.theme]
        p.push()
        p.noStroke()
        p.fill(palette.canvasText)
        p.textSize(14)
        p.textAlign(p.LEFT, p.TOP)
        p.text(words.length > 0 ? `Carries into Discovery: ${words.join(", ")}` : "Spell words: outlined words carry into Discovery", 20, 84)
        p.pop()
    }
}
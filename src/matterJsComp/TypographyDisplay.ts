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
}
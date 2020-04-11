import deps from "./Deps"
import { ShapesFactory } from "./ShapesFactory"

export class TypographyDisplay {
    constructor(
        public shapesFac: ShapesFactory
    ) {


    }
    show = () => {
        const { p, world } = deps
        if (p && world) {
            const numberOfBodiesInWorld = world?.bodies.length - 1 //subtract for the floor
            const numberOfShapesInFac = this.shapesFac.boxes.length
            const textToDisplay = `
            Frame Rate ${Math.round(p.frameRate())}
            Number of Bodies in World: ${numberOfBodiesInWorld}
            Number of Shapes in Factory: ${numberOfShapesInFac}
            Total Created ${this.shapesFac.totalCount}
            `
            //https://p5js.org/reference/#/p5/text
            p.text(textToDisplay, 20, 20)
        }
    }
}
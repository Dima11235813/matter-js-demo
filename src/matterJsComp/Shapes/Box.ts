import Matter from 'matter-js'
import { BoxOptions } from '../models/boxOptions';
import deps from '../Deps';
import { getRandomColor } from '../../utils/colorUtils';

export class Box {
    body: Matter.Body | null
    outOfBounds: boolean = false
    color: string = getRandomColor()
    constructor(
        public boxOptions: BoxOptions
    ) {
        const { x, y, w, h, options = {} } = boxOptions
        this.body = Matter.Bodies.rectangle(x, y, w, h, options);

        // add all of the bodies to the world
        const { world } = deps
        if (world) {
            Matter.World.add(world, this.body);
        }

    }
    show = () => {
        if (!this.body) return
        const helpGc = true
        const { position, angle } = this.body!
        const { x, y } = position!
        const { width, height } = deps.browserInfo
        if (x > width || x < 0 || y > height || y < 0) {
            this.outOfBounds = true
            const { world } = deps
            //TODO Triggers the before remove and after remove composite hooks
            //See if this can help garbage clean up on this body
            if (helpGc && world && this.body) {
                // console.log(`Removing out of bounds item from world. Number of items in world: ${world.bodies.length}`)
                Matter.World.remove(world, this.body);
                this.body = null
                return
                // console.log(`After remove: ${world.bodies.length}`)
            }
        }
        const { p } = deps
        if (p) {
            p.push()

            //Rect options
            //https://p5js.org/reference/#/p5/rectMode
            p.strokeWeight(4)
            p.fill(this.color)
            p.rectMode(p.CENTER)

            //Create rect
            p.translate(position.x, position.y)
            const { x, y, w, h } = this.boxOptions
            p.rect(0, 0, w, h)
            p.rotate(p.radians(angle))

            p.pop()
        }
    }
}
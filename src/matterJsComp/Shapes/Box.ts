import Matter, { IEventCollision, Engine } from 'matter-js'
import { BoxOptions, HardBodyOptions, ShapeTypes } from '../models/boxOptions';
import deps from '../Deps';
import { getRandomColor } from '../../utils/colorUtils';
import { getRandomLetterOrSpace } from '../../utils/textUtils';

export class Box {
    static readonly border = 4
    static readonly mass = 1
    static readonly friction = 1
    body: Matter.Body | null = null
    previewBox: boolean = false
    outOfBounds: boolean = false
    color: string = getRandomColor()
    public matterId: number = -1
    constructor(
        public boxOptions: any,//BoxOptions | HardBodyOptions,
        public text: string = getRandomLetterOrSpace(),
        public noMatter: boolean = false
    ) {
        if (!noMatter) {
            const { x, y, w, h, options = {} } = boxOptions
            this.body = Matter.Bodies.rectangle(x, y, w, h, options);
            // this.body = Matter.Bodies.circle(x, y, ((w + h) /2))
            // this.body.mass = Box.mass
            // this.body.friction = Box.friction
            // console.log(`Box with 

            // this.body.collisionFilter.group = this.boxOptions.w
            // Matter
            // console.log()
            // width of ${w}
            // height of ${h}
            // `)


            // add all of the bodies to the world
            const { world } = deps
            if (world) {
                Matter.World.add(world, this.body);
            }
            this.matterId = this.body.id
        }

    }
    show = () => {
        if (!this.noMatter && !this.body && !this.previewBox) return
        const helpGc = true
        const { position, angle } = this.body!
        const { x, y } = position!
        const { width, height } = deps.browserInfo
        if (!this.previewBox && (x > width || x < 0 || y > height || y < 0)) {
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
            const { w, h } = this.boxOptions

            //Rect options
            //https://p5js.org/reference/#/p5/rectMode
            p.strokeWeight(Box.border)
            p.fill(this.color)
            p.rectMode(p.CENTER)

            //Create rect
            if (this.previewBox) {
                p.translate(this.boxOptions.x, this.boxOptions.y)
                p.rect(0, 0, this.boxOptions.w - Box.border, this.boxOptions.h - Box.border)
            } else {
                p.rotate(p.radians(angle))
                p.translate(position.x, position.y)
                p.rect(0, 0, w - Box.border, h - Box.border)
            }

            //Add text on top
            p.fill(255)

            //if hard body don't do text
            if (this.boxOptions.type !== ShapeTypes.FLOOR) {
                const { textWidth = 10, textHeight = 10, textSize = 10 } = this.boxOptions
                p.textAlign(p.CENTER);
                p.textSize(textSize)
                p.text(this.text, textWidth, textHeight) //Adding fourth and fifth param slows everything down
            }

            p.pop()
        }
    }
}
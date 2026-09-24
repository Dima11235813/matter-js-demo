import Matter, { IEventCollision, Engine } from 'matter-js'
import { BoxOptions, HardBodyOptions, ShapeTypes } from '../models/boxOptions';
import deps from '../Deps';
import { getRandomColor, readableTextColor } from '../../utils/colorUtils';
import { palettes } from '../../theme/palette';
import { getRandomLetterOrSpace } from '../../utils/textUtils';
import { stores } from '../../stores';
import { AppModes } from '../models/appMode';

export class Box {
    static readonly border = 4
    static readonly mass = 1
    static readonly friction = 1
    body: Matter.Body | null = null
    previewBox: boolean = false
    outOfBounds: boolean = false
    color: string = getRandomColor()
    /** Black or white, whichever meets WCAG AA contrast against this box's fill. */
    textColor: string = readableTextColor(this.color)
    setColor = (color: string) => {
        this.color = color
        this.textColor = readableTextColor(color)
    }
    public matterId: number = -1
    /** Centered, normalized vector from the semantic engine; undefined for non-words. */
    public embedding?: Float32Array
    constructor(
        public boxOptions: BoxOptions | HardBodyOptions,
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

            // this.body.collisionFilter.group = this.boOxptions.w
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
    count = 0
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
            const { mode } = stores.menuStore
            const { boxLastClicked } = deps
            const { x, y, w, h } = this.boxOptions

            //Rect options
            //https://p5js.org/reference/#/p5/rectMode
            const isSelected = stores.menuStore.selectedWordIds.includes(this.matterId)
            const palette = palettes[stores.menuStore.theme]
            if (isSelected) {
                p.stroke(palette.selection)
                p.strokeWeight(Box.border + 3)
            } else {
                p.stroke(palette.boxStroke)
                p.strokeWeight(Box.border)
            }
            p.fill(this.color)
            p.rectMode(p.CENTER)

            //Create rect
            if (this.previewBox) {
                p.strokeWeight(this.boxOptions.border)
                p.translate(this.boxOptions.x, this.boxOptions.y)
                p.rect(0, 0, this.boxOptions.w - Box.border, this.boxOptions.h - Box.border)
            }
            else {
                p.translate(position.x, position.y)
                p.rotate(angle)
                p.rect(0, 0, w - Box.border, h - Box.border)
            }

            p.noStroke()
            p.fill(this.textColor)

            if (this.boxOptions.type !== ShapeTypes.FLOOR) {
                const textOptions = this.boxOptions as BoxOptions
                const { textSize = 20 } = textOptions
                p.textAlign(p.CENTER, p.CENTER)
                p.textSize(textSize)
                p.textFont("Outfit, Inter, system-ui, -apple-system, sans-serif")
                p.text(this.text, 0, 2)
            }

            p.pop()
        }
    }
}
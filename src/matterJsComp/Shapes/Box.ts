import Matter from 'matter-js'
import { BoxOptions } from '../models/boxOptions';
import deps from '../Deps';

export class Box {
    body: Matter.Body;
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
        const { position, angle } = this.body
        const { p } = deps
        if(p){
            p.push()
            p.translate(position.x, position.y)
            const { x, y, w, h } = this.boxOptions
            p.rect(0, 0, w, h)
            p.rotate(p.radians(angle)) 
            p.pop()
        }
    }
}
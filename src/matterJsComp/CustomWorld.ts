import Matter from "matter-js";
import { ShapesFactory } from "./ShapesFactory";
import { BoxOptions } from "./models/boxOptions";
import p5 from "p5";
import deps from "./Deps";
import { doesNotReject } from "assert";

export class CustomWorld {
    shapesFac: ShapesFactory;
    constructor() {
        let Engine = Matter.Engine

        // create an engine
        deps.engine = Engine.create();
        deps.world = deps.engine.world


        // create a renderer
        // this.renderer = Render.create({
        //     element: this.worldDomContainer,
        //     engine: this.engine
        // });


        // create a shapes factory
        this.shapesFac = new ShapesFactory()

        //create the world's ground
        this.shapesFac.createGround()

        // run the engine
        Engine.run(deps.engine);

    }
    addShape = (mx: number, my: number) => {
        console.log(`Adding shape at
        x:${mx}
        y:${my}
        `)
        let newBoxOptions: BoxOptions = { x: mx, y: my, w: 50, h: 50, options: {} }
        this.shapesFac.createBox(newBoxOptions)
    }
    draw = () => {
        const { p } = deps
        p?.background(177)
        this.shapesFac.ground?.show()
        this.shapesFac.boxes.forEach(box => box.show())
    }
}
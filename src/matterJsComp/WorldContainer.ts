import { SketchHandler } from './SketchHandler';
import p5 from 'p5';
import deps from './Deps';
import Matter from 'matter-js';

export class WorldContainer {
    sketch: p5;
    sketchHandler: SketchHandler | undefined;
    constructor(
        public worldDomContainer: HTMLElement
    ) {
        //create a p5 instancve
        this.sketch = new p5(this.sketchHandlerCb, this.worldDomContainer)
    }
    sketchHandlerCb = (p: p5) => {
        deps.p = p
        this.sketchHandler = new SketchHandler()
    }
    destroy() {
        if (this.sketch) {
            this.sketch.remove();
        }
        deps.p = undefined;
        if (deps.engine) {
            Matter.World.clear(deps.engine.world, false);
            Matter.Engine.clear(deps.engine);
            deps.engine = undefined;
            deps.world = undefined;
        }
    }
}
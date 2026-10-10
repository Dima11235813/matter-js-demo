import { SketchHandler } from './SketchHandler';
import { Sketch } from './Sketch';
import deps from './Deps';
import Matter from 'matter-js';

export class WorldContainer {
    sketch: Sketch;
    sketchHandler: SketchHandler | undefined;
    constructor(
        public worldDomContainer: HTMLElement
    ) {
        // A thin Canvas2D sketch (it replaced p5, Epic 4 · Task 4.5.7).
        this.sketch = new Sketch(this.sketchHandlerCb, this.worldDomContainer)
    }
    sketchHandlerCb = (p: Sketch) => {
        deps.p = p
        this.sketchHandler = new SketchHandler()
    }
    destroy() {
        if (this.sketch) {
            this.sketch.remove();
        }
        deps.p = undefined;
        const world = this.sketchHandler?.customWorld;
        if (world?.runner) Matter.Runner.stop(world.runner);
        if (deps.activeWorld === world) deps.activeWorld = undefined;
        if (deps.engine) {
            Matter.World.clear(deps.engine.world, false);
            Matter.Engine.clear(deps.engine);
            deps.engine = undefined;
            deps.world = undefined;
        }
    }
}
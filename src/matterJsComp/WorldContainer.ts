import { SketchHandler } from './SketchHandler';
import p5 from 'p5';
import deps from './Deps';

export class WorldContainer {
    sketch: any;
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
}
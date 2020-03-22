import p5 from "p5"

export interface BrowserInfo {
    width: number
    height: number
}

class Deps {
    browserInfo: BrowserInfo
    p: p5 | undefined
    engine: Matter.Engine | undefined
    world: Matter.World | undefined
    
    constructor() {
        this.browserInfo = {
            width: window.innerWidth - 20,
            height: window.innerHeight - 20
        }
    }
}
const deps = new Deps()
export default deps
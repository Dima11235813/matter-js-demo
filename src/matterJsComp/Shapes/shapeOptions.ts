class ShapeOptions {
    constructor(
        public rectWidth: number = Math.floor(Math.random() * 100),
        public rectHeight: number = Math.floor(Math.random() * 100)
    ) { }
    getNewShapeOptions = () => {
        const maxSize = 50
        const minSize = 2
        let size = Math.floor(Math.random() * maxSize) + minSize
        return {
            rectWidth: size,
            rectHeight: size

        }
    }
}
const shapeOptions = new ShapeOptions()
export default shapeOptions
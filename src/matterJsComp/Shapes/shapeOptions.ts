class ShapeOptions {
    constructor(
        public rectWidth: number = Math.floor(Math.random() * 100),
        public rectHeight: number = Math.floor(Math.random() * 100)
    ) { }
    getNewShapeOptions = () => {
        const maxSize = 20
        const minSize = 5
        let size = Math.floor(Math.random() * maxSize) + minSize
        return {
            rectWidth: size,
            rectHeight: size

        }
    }
}
const shapeOptions = new ShapeOptions()
export default shapeOptions
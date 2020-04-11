export interface ShapeBase {
    x: number, 
    y: number, 
    w: number, 
    h: number, 
    options: any, 
}
export interface BoxOptions extends ShapeBase {
    textSize: number,
    textWidth: number, 
    textHeight: number,
    type: ShapeTypes
}

export interface FloorOptions extends ShapeBase {
    type: ShapeTypes
}

export enum ShapeTypes {
    BOX, FLOOR
}
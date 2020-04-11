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
    FLOOR, BOX, TWO_LETTER_BOX, THREE_LETTER_BOX, FOUR_LETTER_BOX, FIVE_LETTER_BOX, SIX_LETTER_BOX
}
export const decordateWithTextProps = (baseObj: ShapeBase): BoxOptions => {
    const { x, y, w, h } = baseObj
    return {
        textWidth: w / 10,
        textHeight: h / 10,
        textSize: (w + h) / 3,
        type: ShapeTypes.BOX,
        ...baseObj
    }
}
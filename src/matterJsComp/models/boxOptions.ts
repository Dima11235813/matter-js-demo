import { ShapesFactory } from "../ShapesFactory"

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

export interface HardBodyOptions extends ShapeBase {
    type: ShapeTypes
}

export enum ShapeTypes {
    FLOOR, BOX, TWO_LETTER_BOX, THREE_LETTER_BOX, FOUR_LETTER_BOX, FIVE_LETTER_BOX, SIX_LETTER_BOX, SEVEN_LETTER_BOX, EIGHT_LETTER_BOX, NINE_LETTER_BOX, TEN_LETTER_BOX
}
export const decordateWithTextProps = (baseObj: ShapeBase): BoxOptions => {
    const { x, y, w, h } = baseObj
    return {
        textWidth: w / 13,
        textHeight: h / 13,
        textSize: ((w + h) / 2) * ShapesFactory.growthFactor,
        type: ShapeTypes.BOX,
        ...baseObj
    }
}
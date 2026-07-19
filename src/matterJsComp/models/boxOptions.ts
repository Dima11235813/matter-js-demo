import { IBodyDefinition } from "matter-js";

/**
 * Base properties for all physical shapes in the world.
 */
export interface ShapeBase {
    x: number;
    y: number;
    w: number;
    h: number;
    border: number;
    options: IBodyDefinition;
}

/**
 * Shape properties specifically containing text display metrics.
 */
export interface BoxOptions extends ShapeBase {
    textSize: number;
    textWidth: number;
    textHeight: number;
    type: ShapeTypes;
}

/**
 * Properties for physical structures (like boundaries or floors).
 */
export interface HardBodyOptions extends ShapeBase {
    type: ShapeTypes;
}

/**
 * Enumeration of possible body shapes and word lengths.
 */
export enum ShapeTypes {
    FLOOR,
    BOX,
    TWO_LETTER_BOX,
    THREE_LETTER_BOX,
    FOUR_LETTER_BOX,
    FIVE_LETTER_BOX,
    SIX_LETTER_BOX,
    SEVEN_LETTER_BOX,
    EIGHT_LETTER_BOX,
    NINE_LETTER_BOX,
    TEN_LETTER_BOX,
    LETTER_PREVIEW_BOX
}

/**
 * Utility to map a word length to the correct ShapeTypes enum value.
 */
export const getShapeTypeForLength = (length: number): ShapeTypes => {
    if (length >= 2 && length <= 10) {
        return length as unknown as ShapeTypes;
    }
    return ShapeTypes.BOX;
};

/**
 * Decorates a ShapeBase configuration with default text dimensions and types.
 */
export const decordateWithTextProps = (baseObj: ShapeBase): BoxOptions => {
    const { w, h } = baseObj;
    return {
        textWidth: w / 13,
        textHeight: h / 13,
        textSize: (w + h) / 6,
        type: ShapeTypes.BOX,
        ...baseObj
    };
};
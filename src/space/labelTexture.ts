import { readableTextColor } from "../utils/colorUtils";

/**
 * Word labels for the 3D view, drawn to a canvas and used as sprite textures. Sizes match the 2D
 * word boxes (length * 20 + 20 by 44 world units) so the 2D -> 3D hand-off looks continuous.
 * Text color always meets WCAG AA against the fill (readableTextColor).
 */
export const LABEL_HEIGHT = 44;
const RESOLUTION = 2;

export function labelSize(word: string): [number, number] {
    return [word.length * 20 + 20, LABEL_HEIGHT];
}

export interface LabelStyle {
    fill: string;
    stroke: string;
    strokeWidth: number;
}

export function drawWordLabel(word: string, style: LabelStyle): HTMLCanvasElement {
    const [w, h] = labelSize(word);
    const canvas = document.createElement("canvas");
    canvas.width = w * RESOLUTION;
    canvas.height = h * RESOLUTION;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(RESOLUTION, RESOLUTION);
    const inset = style.strokeWidth / 2;
    roundedRect(ctx, inset, inset, w - style.strokeWidth, h - style.strokeWidth, 6);
    ctx.fillStyle = style.fill;
    ctx.fill();
    ctx.lineWidth = style.strokeWidth;
    ctx.strokeStyle = style.stroke;
    ctx.stroke();
    ctx.fillStyle = readableTextColor(style.fill);
    ctx.font = `22px Outfit, Inter, system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(word, w / 2, h / 2 + 1);
    return canvas;
}

/** Small pill with a similarity value, shown for the hovered word's links. */
export function drawValuePill(text: string, fill: string, ink: string): HTMLCanvasElement {
    const [w, h] = [44, 22];
    const canvas = document.createElement("canvas");
    canvas.width = w * RESOLUTION;
    canvas.height = h * RESOLUTION;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(RESOLUTION, RESOLUTION);
    roundedRect(ctx, 1, 1, w - 2, h - 2, 10);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ink;
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.font = `600 13px Outfit, Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2 + 1);
    return canvas;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

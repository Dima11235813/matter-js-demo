/**
 * A thin Canvas2D "sketch" that replaces p5 (Epic 4 · Task 4.5.7): p5 1.x was 1,040 KB of the 2D world's
 * 1,163 KB chunk and can't be tree-shaken, while the game used about 30 of its calls. This class keeps
 * those calls' names and p5's semantics (setup, then a draw loop on animation frames; window-level
 * mouse and touch events with canvas-relative mouseX/mouseY; returning false from a touch handler
 * cancels the browser default; push/pop save the drawing style; fill/stroke take CSS colors, gray,
 * r g b [a], or HSB after colorMode(HSB)), so the drawing code and tests read as before.
 */
export type TextAlignH = "left" | "center" | "right";
export type TextAlignV = "top" | "center" | "bottom" | "baseline";
type ColorArgs = [SketchColor | string] | [number] | [number, number] | [number, number, number] | [number, number, number, number];

/** A color with an alpha you can change (p5's `color(...)` + `setAlpha`). */
export class SketchColor {
    constructor(public r: number, public g: number, public b: number, public a = 255) {}
    setAlpha(alpha: number): void {
        this.a = alpha;
    }
    toString(): string {
        return `rgba(${this.r}, ${this.g}, ${this.b}, ${Math.max(0, Math.min(255, this.a)) / 255})`;
    }
}

interface Style {
    fill: string | undefined;
    stroke: string | undefined;
    strokeWeight: number;
    rectMode: "corner" | "center";
    alignH: TextAlignH;
    alignV: TextAlignV;
    textSize: number;
    textStyle: "normal" | "bold";
    textFont: string;
    colorMode: "rgb" | "hsb";
    maxes: [number, number, number, number];
}

const DEFAULT_STYLE: Style = {
    fill: "#ffffff",
    stroke: "#000000",
    strokeWeight: 1,
    rectMode: "corner",
    alignH: "left",
    alignV: "baseline",
    textSize: 12,
    textStyle: "normal",
    textFont: "sans-serif",
    colorMode: "rgb",
    maxes: [255, 255, 255, 255],
};

/** Canvas coordinates of a canvas-relative point. */
type Handler<E> = (event?: E) => boolean | void;

export class Sketch {
    readonly CENTER = "center" as const;
    readonly CORNER = "corner" as const;
    readonly LEFT = "left" as const;
    readonly RIGHT = "right" as const;
    readonly TOP = "top" as const;
    readonly BOTTOM = "bottom" as const;
    readonly BASELINE = "baseline" as const;
    readonly NORMAL = "normal" as const;
    readonly BOLD = "bold" as const;
    readonly RGB = "rgb" as const;
    readonly HSB = "hsb" as const;

    setup?: () => void;
    draw?: () => void;
    windowResized?: () => void;
    mousePressed?: Handler<MouseEvent>;
    mouseDragged?: Handler<MouseEvent>;
    mouseReleased?: Handler<MouseEvent>;
    mouseMoved?: Handler<MouseEvent>;
    touchStarted?: Handler<TouchEvent>;
    touchMoved?: Handler<TouchEvent>;
    touchEnded?: Handler<TouchEvent>;

    frameCount = 0;
    mouseX = 0;
    mouseY = 0;
    mouseIsPressed = false;
    width = 0;
    height = 0;

    private canvas: HTMLCanvasElement | undefined;
    private ctx: CanvasRenderingContext2D | undefined;
    private style: Style = { ...DEFAULT_STYLE };
    private readonly styles: Style[] = [];
    private frame = 0;
    private lastFrameAt = 0;
    private fps = 60;
    private density = 1;
    private removed = false;
    private readonly listeners: Array<[string, EventListener]> = [];

    constructor(init: (sketch: Sketch) => void, private readonly container: HTMLElement) {
        init(this);
        this.listen("mousedown", this.onMouseDown);
        this.listen("mousemove", this.onMouseMove);
        this.listen("mouseup", this.onMouseUp);
        this.listen("touchstart", this.onTouchStart);
        this.listen("touchmove", this.onTouchMove);
        this.listen("touchend", this.onTouchEnd);
        this.listen("resize", () => this.windowResized?.());
        this.setup?.();
        this.frame = requestAnimationFrame(this.loop);
    }

    /** Creates the canvas in the container, sharp on high-density screens. Returns `{ elt }` like p5. */
    createCanvas(width: number, height: number): { elt: HTMLCanvasElement } {
        if (!this.canvas) {
            this.canvas = document.createElement("canvas");
            this.container.appendChild(this.canvas);
            this.ctx = this.canvas.getContext("2d")!;
        }
        this.resizeCanvas(width, height);
        return { elt: this.canvas };
    }

    resizeCanvas(width: number, height: number): void {
        if (!this.canvas) return;
        this.density = window.devicePixelRatio || 1;
        this.width = width;
        this.height = height;
        this.canvas.width = Math.round(width * this.density);
        this.canvas.height = Math.round(height * this.density);
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.ctx!.setTransform(this.density, 0, 0, this.density, 0, 0);
    }

    /** Stops the loop, removes listeners and the canvas. */
    remove(): void {
        this.removed = true;
        cancelAnimationFrame(this.frame);
        this.listeners.forEach(([type, fn]) => window.removeEventListener(type, fn));
        this.listeners.length = 0;
        this.canvas?.remove();
    }

    /** Frames per second, smoothed over recent frames. */
    frameRate(): number {
        return this.fps;
    }

    // ---- style

    push(): void {
        this.styles.push({ ...this.style, maxes: [...this.style.maxes] as Style["maxes"] });
        this.ctx?.save();
    }

    pop(): void {
        this.style = this.styles.pop() ?? { ...DEFAULT_STYLE };
        this.ctx?.restore();
    }

    fill(...args: ColorArgs): void {
        this.style.fill = this.css(args);
    }

    noFill(): void {
        this.style.fill = undefined;
    }

    stroke(...args: ColorArgs): void {
        this.style.stroke = this.css(args);
    }

    noStroke(): void {
        this.style.stroke = undefined;
    }

    strokeWeight(weight: number): void {
        this.style.strokeWeight = weight;
    }

    rectMode(mode: "corner" | "center"): void {
        this.style.rectMode = mode;
    }

    colorMode(mode: "rgb" | "hsb", max1 = mode === "hsb" ? 360 : 255, max2 = mode === "hsb" ? 100 : 255, max3 = mode === "hsb" ? 100 : 255, maxA = 255): void {
        this.style.colorMode = mode;
        this.style.maxes = [max1, max2, max3, maxA];
    }

    textAlign(horizontal: TextAlignH, vertical: TextAlignV = "baseline"): void {
        this.style.alignH = horizontal;
        this.style.alignV = vertical;
    }

    textSize(size: number): void {
        this.style.textSize = size;
    }

    textStyle(style: "normal" | "bold"): void {
        this.style.textStyle = style;
    }

    textFont(family: string): void {
        this.style.textFont = family;
    }

    textWidth(text: string): number {
        if (!this.ctx) return text.length * this.style.textSize * 0.58;
        this.ctx.font = this.font();
        return Math.max(...text.split("\n").map(line => this.ctx!.measureText(line).width));
    }

    /** A color you can adjust (e.g. its alpha) before passing it to fill or stroke. */
    color(...args: ColorArgs): SketchColor {
        const css = this.css(args);
        const ctx = this.ctx ?? document.createElement("canvas").getContext("2d")!;
        ctx.save();
        ctx.fillStyle = "#000000";
        ctx.fillStyle = css;
        const normalized = String(ctx.fillStyle);
        ctx.restore();
        return parseCanvasColor(normalized);
    }

    // ---- transforms and drawing

    translate(x: number, y: number): void {
        this.ctx?.translate(x, y);
    }

    rotate(angle: number): void {
        this.ctx?.rotate(angle);
    }

    background(...args: ColorArgs): void {
        const ctx = this.ctx;
        if (!ctx) return;
        ctx.save();
        ctx.setTransform(this.density, 0, 0, this.density, 0, 0);
        ctx.fillStyle = this.css(args);
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.restore();
    }

    rect(x: number, y: number, w: number, h: number, radius = 0): void {
        const ctx = this.ctx;
        if (!ctx) return;
        const [left, top] = this.style.rectMode === "center" ? [x - w / 2, y - h / 2] : [x, y];
        ctx.beginPath();
        const r = Math.max(0, Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2));
        if (r > 0) roundedRect(ctx, left, top, w, h, r);
        else ctx.rect(left, top, w, h);
        this.paint();
    }

    line(x1: number, y1: number, x2: number, y2: number): void {
        const ctx = this.ctx;
        if (!ctx || !this.style.stroke) return;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = this.style.stroke;
        ctx.lineWidth = this.style.strokeWeight;
        ctx.stroke();
    }

    /** Draws text (multi-line with "\n"), aligned like p5's textAlign. */
    text(text: string, x: number, y: number): void {
        const ctx = this.ctx;
        if (!ctx) return;
        const { alignH, alignV, textSize, fill, stroke, strokeWeight } = this.style;
        ctx.font = this.font();
        ctx.textAlign = alignH;
        ctx.textBaseline = alignV === "center" ? "middle" : alignV === "baseline" ? "alphabetic" : alignV;
        const lines = String(text).split("\n");
        const leading = textSize * 1.25;
        // A centred block is centred as a whole; a bottom-aligned one grows upward (as in p5).
        const startY = alignV === "center" ? y - ((lines.length - 1) * leading) / 2 : alignV === "bottom" ? y - (lines.length - 1) * leading : y;
        lines.forEach((line, k) => {
            const ly = startY + k * leading;
            if (fill) {
                ctx.fillStyle = fill;
                ctx.fillText(line, x, ly);
            }
            if (stroke) {
                ctx.strokeStyle = stroke;
                ctx.lineWidth = strokeWeight;
                ctx.strokeText(line, x, ly);
            }
        });
    }

    // ---- internals

    private loop = (now: number) => {
        if (this.removed) return;
        if (this.lastFrameAt > 0) {
            const instant = 1000 / Math.max(1, now - this.lastFrameAt);
            this.fps = this.fps * 0.9 + instant * 0.1;
        }
        this.lastFrameAt = now;
        this.frameCount++;
        // p5 resets the transform every frame; styles carry over.
        this.ctx?.setTransform(this.density, 0, 0, this.density, 0, 0);
        this.draw?.();
        this.frame = requestAnimationFrame(this.loop);
    };

    private font(): string {
        const { textStyle, textSize, textFont } = this.style;
        return `${textStyle === "bold" ? "bold " : ""}${textSize}px ${textFont}`;
    }

    private paint(): void {
        const ctx = this.ctx!;
        if (this.style.fill) {
            ctx.fillStyle = this.style.fill;
            ctx.fill();
        }
        if (this.style.stroke && this.style.strokeWeight > 0) {
            ctx.strokeStyle = this.style.stroke;
            ctx.lineWidth = this.style.strokeWeight;
            ctx.stroke();
        }
    }

    /** fill/stroke arguments to a CSS color. */
    private css(args: ColorArgs): string {
        const [first] = args;
        if (first instanceof SketchColor) return first.toString();
        if (typeof first === "string") return first;
        const nums = args as number[];
        const [m1, m2, m3, mA] = this.style.maxes;
        if (nums.length <= 2) {
            const gray = (nums[0] / m1) * 255;
            const alpha = nums.length === 2 ? nums[1] / mA : 1;
            return `rgba(${gray}, ${gray}, ${gray}, ${alpha})`;
        }
        const alpha = nums.length === 4 ? nums[3] / mA : 1;
        if (this.style.colorMode === "hsb") {
            const [r, g, b] = hsbToRgb((nums[0] / m1) * 360, nums[1] / m2, nums[2] / m3);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        return `rgba(${(nums[0] / m1) * 255}, ${(nums[1] / m2) * 255}, ${(nums[2] / m3) * 255}, ${alpha})`;
    }

    private listen(type: string, fn: (event: never) => void): void {
        const listener = fn as unknown as EventListener;
        window.addEventListener(type, listener, { passive: false });
        this.listeners.push([type, listener]);
    }

    private setMouse(clientX: number, clientY: number): void {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        this.mouseX = clientX - rect.left;
        this.mouseY = clientY - rect.top;
    }

    private onMouseDown = (event: MouseEvent) => {
        this.setMouse(event.clientX, event.clientY);
        this.mouseIsPressed = true;
        if (this.mousePressed?.(event) === false) event.preventDefault();
    };

    private onMouseMove = (event: MouseEvent) => {
        this.setMouse(event.clientX, event.clientY);
        const handler = this.mouseIsPressed ? this.mouseDragged : this.mouseMoved;
        if (handler?.(event) === false) event.preventDefault();
    };

    private onMouseUp = (event: MouseEvent) => {
        this.setMouse(event.clientX, event.clientY);
        this.mouseIsPressed = false;
        if (this.mouseReleased?.(event) === false) event.preventDefault();
    };

    private onTouchStart = (event: TouchEvent) => {
        const touch = event.touches[0];
        if (touch) this.setMouse(touch.clientX, touch.clientY);
        this.mouseIsPressed = true;
        if (this.touchStarted?.(event) === false) event.preventDefault();
    };

    private onTouchMove = (event: TouchEvent) => {
        const touch = event.touches[0];
        if (touch) this.setMouse(touch.clientX, touch.clientY);
        if (this.touchMoved?.(event) === false) event.preventDefault();
    };

    private onTouchEnd = (event: TouchEvent) => {
        this.mouseIsPressed = event.touches.length > 0;
        if (this.touchEnded?.(event) === false) event.preventDefault();
    };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/** HSB (hue in degrees, saturation and brightness 0..1) to RGB 0..255. */
export function hsbToRgb(hue: number, saturation: number, brightness: number): [number, number, number] {
    const h = (((hue % 360) + 360) % 360) / 60;
    const c = brightness * saturation;
    const x = c * (1 - Math.abs((h % 2) - 1));
    const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
    const m = brightness - c;
    return [r, g, b].map(v => Math.round((v + m) * 255)) as [number, number, number];
}

/** A canvas-normalized color ("#rrggbb" or "rgba(r, g, b, a)") to a SketchColor. */
export function parseCanvasColor(css: string): SketchColor {
    const hex = /^#([0-9a-f]{6})$/i.exec(css);
    if (hex) {
        const n = parseInt(hex[1], 16);
        return new SketchColor((n >> 16) & 255, (n >> 8) & 255, n & 255);
    }
    const rgba = /^rgba?\(([^)]+)\)$/i.exec(css);
    if (rgba) {
        const [r, g, b, a = 1] = rgba[1].split(",").map(s => parseFloat(s));
        return new SketchColor(r, g, b, a * 255);
    }
    return new SketchColor(0, 0, 0);
}

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { OverlayRect } from "../matterJsComp/Deps";
import { Layout3d } from "../physics/layoutPresets";
import { bestViewDirection, principalAxes, Vec3 } from "../physics/principalAxes";
import { SpaceBody } from "../physics/spaceSimulation";
import { boundingSphere, fitDistance, pixelMatchedDistance, Size } from "./handoff";
import { LABEL_HEIGHT, labelSize } from "./labelTexture";
import { extentCenter, fitDistanceToExtents, rollToFit, ViewPoint } from "./viewFit";

export const FOV = 50;
/** Keep the pixel-matched start this long before framing, so the 2D -> 3D switch is seamless. */
const FRAMING_DELAY_MS = 1200;
/** Per-frame easing toward the framed camera (0..1). */
const FRAMING_EASE = 0.04;
/**
 * Focus: the camera tracks the focused words while they glow (a new word is still settling into
 * place), then leaves the camera where it is.
 */
const FOCUS_MS = 2800;
const FOCUS_EASE = 0.1;
const AUTO_ROTATE_DELAY_MS = 2500;
/** Portrait roll: the layout turns at most this much per frame (radians), and stops within ROLL_DONE. */
const ROLL_STEP = 0.012;
const ROLL_DONE = 0.05;
/** Clear margin (px) at the screen edges when framing. */
const FRAME_MARGIN = 10;

/** Turns the layout rigidly about `axis` through `center` (the simulation does it; the camera's up is fixed). */
export type RollLayout = (center: Vec3, axis: Vec3, angle: number) => void;

/**
 * Who controls the 3D camera, and how:
 *   - auto-framing (default): ease to the words' centroid and the distance where all of them fit
 *     below the docked dashboard; the shape layout also turns to its best view (least-variance
 *     principal axis), the orbits layout drifts slowly so depth is visible;
 *   - focus: fly to specific words (HUD links, the analogies panel, new words), tracking them for
 *     a moment, then leave the camera to the player;
 *   - player: any orbit/zoom ends auto-framing and drifting; double-click hands the camera back.
 */
export class CameraDirector {
    private autoFrame = true;
    /** The layout's remaining turn toward upright (radians), from the last framed frame (tests read it). */
    pendingRoll = 0;
    private focus: { words: ReadonlySet<string>; until: number } | undefined;
    /** Words that glow without moving the camera (a + tap's new word). */
    private flash: { words: ReadonlySet<string>; until: number } | undefined;
    private viewOffsetY = 0;
    private readonly startedAt = performance.now();
    private readonly autoRotateTimer: number;

    constructor(
        private readonly camera: THREE.PerspectiveCamera,
        private readonly controls: OrbitControls,
        private readonly layout: () => Layout3d
    ) {
        this.controls.addEventListener("start", this.takeOver);
        this.autoRotateTimer = window.setTimeout(() => { this.controls.autoRotate = this.layout() === "orbits"; }, AUTO_ROTATE_DELAY_MS);
    }

    /** Fly to these words and make them glow. Returns false when none of them are on the board. */
    focusOn(words: readonly string[], bodies: readonly SpaceBody[]): boolean {
        const wanted = new Set(words);
        if (!bodies.some(b => wanted.has(b.word))) return false;
        this.takeOver();
        this.focus = { words: wanted, until: performance.now() + FOCUS_MS };
        return true;
    }

    /** Make these words glow for a moment without moving the camera. */
    highlight(words: readonly string[]): void {
        this.flash = { words: new Set(words), until: performance.now() + FOCUS_MS };
    }

    /** Body ids that should glow right now. */
    glowing(bodies: readonly SpaceBody[]): Set<number> {
        const now = performance.now();
        const lit = [this.focus, this.flash].filter(f => f && now < f.until).map(f => f!.words);
        return new Set(bodies.filter(b => lit.some(words => words.has(b.word))).map(b => b.id));
    }

    /** Double-click or a layout change: auto-framing and (for orbits) the slow drift resume. */
    reset = () => {
        this.focus = undefined;
        this.autoFrame = true;
        this.controls.autoRotate = this.layout() === "orbits";
    };

    /** The size changed: the dashboard offset must be re-applied. */
    invalidateViewOffset(): void {
        this.viewOffsetY = Number.NaN;
    }

    /**
     * `minLabelPx`: labels never get smaller than this on screen (Task 5.7.3), so framing leaves room for
     * them; `roll` lets the director turn a tall layout upright on a portrait screen.
     */
    update(bodies: readonly SpaceBody[], [width, height]: Size, overlay: OverlayRect | undefined, minLabelPx = 0, roll?: RollLayout): void {
        const topBand = overlay && overlay.top < 100 ? Math.min(overlay.bottom, height * 0.5) : 0;
        const offsetY = -topBand / 2;
        if (offsetY !== this.viewOffsetY) {
            this.viewOffsetY = offsetY;
            this.camera.setViewOffset(width, height, 0, offsetY, width, height);
        }
        const available = (height - topBand) / height;
        const fov = (2 * Math.atan(Math.tan((FOV * Math.PI) / 360) * available) * 180) / Math.PI;
        const aspect = width / (height - topBand);

        if (this.focus && performance.now() < this.focus.until) {
            const focused = bodies.filter(b => this.focus!.words.has(b.word));
            if (focused.length === 0) return;
            const { center, radius } = boundingSphere(focused);
            // Never closer than pixel-matched: a single word shows at its 2D size, with neighbours around it.
            const closest = pixelMatchedDistance(height, FOV);
            this.ease(center, Math.max(closest, fitDistance(radius * 1.4 + 60, fov, aspect)), FOCUS_EASE);
            return;
        }
        if (!this.autoFrame || bodies.length === 0 || performance.now() - this.startedAt < FRAMING_DELAY_MS) return;
        // Fit the words' projected extent (labels included) in width and height separately: a bounding
        // sphere wastes most of a portrait phone's height (Task 5.7.3).
        const basis = this.basis();
        const points = this.viewPoints(bodies, basis);
        const [cx, cy] = extentCenter(points);
        const centred = points.map(p => ({ ...p, right: p.right - cx, up: p.up - cy }));
        const frame = { width, height, available: height - topBand, fovDegrees: FOV, minLabelPx, margin: FRAME_MARGIN };
        const desired = Math.max(this.controls.minDistance, fitDistanceToExtents(centred, frame));
        const center = this.controls.target.clone().addScaledVector(basis.right, cx).addScaledVector(basis.up, cy);
        const shape = this.layout() === "shape" && bodies.length >= 3;
        if (shape && roll) {
            // Portrait: stand the layout's long axis upright (landscape: lay it flat), a little each frame.
            const turn = rollToFit(points, width, height - topBand);
            this.pendingRoll = turn;
            if (Math.abs(turn) > ROLL_DONE) {
                const step = Math.sign(turn) * Math.min(Math.abs(turn) * FRAMING_EASE, ROLL_STEP);
                roll(this.controls.target.toArray() as Vec3, basis.toward.toArray() as Vec3, step);
            }
        }
        this.ease(center.toArray() as [number, number, number], desired, FRAMING_EASE, shape ? bodies : undefined);
    }

    /** Camera axes: right and up on screen, and toward the camera (from the target). */
    private basis(): { right: THREE.Vector3; up: THREE.Vector3; toward: THREE.Vector3 } {
        this.camera.updateMatrixWorld();
        const e = this.camera.matrixWorld.elements;
        return {
            right: new THREE.Vector3(e[0], e[1], e[2]).normalize(),
            up: new THREE.Vector3(e[4], e[5], e[6]).normalize(),
            toward: new THREE.Vector3(e[8], e[9], e[10]).normalize(),
        };
    }

    /** Words in camera coordinates relative to the orbit target, with their label half sizes. */
    private viewPoints(bodies: readonly SpaceBody[], { right, up, toward }: ReturnType<CameraDirector["basis"]>): ViewPoint[] {
        const target = this.controls.target;
        return bodies.map(b => {
            const d = new THREE.Vector3(b.position[0] - target.x, b.position[1] - target.y, b.position[2] - target.z);
            const [w] = labelSize(b.word);
            return { right: d.dot(right), up: d.dot(up), depth: d.dot(toward), halfWidth: w / 2, halfHeight: LABEL_HEIGHT / 2 };
        });
    }

    dispose(): void {
        window.clearTimeout(this.autoRotateTimer);
        this.controls.removeEventListener("start", this.takeOver);
    }

    /** Eases target and distance; with `orientTo`, also turns toward that layout's best view. */
    private ease(center: [number, number, number], distance: number, rate: number, orientTo?: readonly SpaceBody[]): void {
        const offset = this.camera.position.clone().sub(this.controls.target);
        const length = offset.length() + (distance - offset.length()) * rate;
        if (orientTo) {
            // Look along the least-variance axis so lines and rings are seen face-on, not end-on.
            const current = offset.clone().normalize();
            const best = bestViewDirection(principalAxes(orientTo.map(b => b.position)), current.toArray() as Vec3);
            offset.copy(current.lerp(new THREE.Vector3(...best), rate).normalize());
        }
        offset.setLength(length);
        this.controls.target.lerp(new THREE.Vector3(...center), rate);
        this.camera.position.copy(this.controls.target).add(offset);
    }

    /** The player took the camera (orbit, zoom, or focus): stop drifting and stop auto-framing. */
    private takeOver = () => {
        window.clearTimeout(this.autoRotateTimer);
        this.controls.autoRotate = false;
        this.autoFrame = false;
    };
}

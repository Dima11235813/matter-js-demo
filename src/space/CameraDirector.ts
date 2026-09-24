import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { OverlayRect } from "../matterJsComp/Deps";
import { Layout3d } from "../physics/layoutPresets";
import { bestViewDirection, principalAxes, Vec3 } from "../physics/principalAxes";
import { SpaceBody } from "../physics/spaceSimulation";
import { boundingSphere, fitDistance, pixelMatchedDistance, Size } from "./handoff";

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
    private focus: { words: ReadonlySet<string>; until: number } | undefined;
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

    /** Body ids that should glow right now. */
    glowing(bodies: readonly SpaceBody[]): Set<number> {
        if (!this.focus || performance.now() >= this.focus.until) return new Set();
        return new Set(bodies.filter(b => this.focus!.words.has(b.word)).map(b => b.id));
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

    update(bodies: readonly SpaceBody[], [width, height]: Size, overlay: OverlayRect | undefined): void {
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
        const { center, radius } = boundingSphere(bodies);
        const desired = Math.max(this.controls.minDistance, fitDistance(radius * 1.05, fov, aspect));
        const best = this.layout() === "shape" && bodies.length >= 3 ? bodies : undefined;
        this.ease(center, desired, FRAMING_EASE, best);
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

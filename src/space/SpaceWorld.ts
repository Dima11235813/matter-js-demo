import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import deps from "../matterJsComp/Deps";
import { WordProbe, WordWorld } from "../matterJsComp/wordWorld";
import { SpaceSimulation } from "../physics/spaceSimulation";
import { Layout3d, layout3dConfig } from "../physics/layoutPresets";
import { bestViewDirection, principalAxes, Vec3 } from "../physics/principalAxes";
import { semanticEngine } from "../services/semanticEngine";
import { selectWordForAnalogy, takeHandoff } from "../services/playground";
import { isRoundRunning, startTimedRound } from "../services/timedGameController";
import { stores } from "../stores";
import { getRandomColor } from "../utils/colorUtils";
import { boundingSphere, canvasToSpace, fitDistance, ndcToCanvas, pixelMatchedDistance, Size } from "./handoff";
import { SpaceScene } from "./SpaceScene";

const FOV = 50;
const INITIAL_WORDS = 8;
/** A press that moves less than this (px) is a click, not an orbit drag. */
const CLICK_SLOP = 6;
/** Keep the pixel-matched start this long before framing, so the 2D -> 3D switch is seamless. */
const FRAMING_DELAY_MS = 1200;
/** Per-frame easing toward the framed camera (0..1). */
const FRAMING_EASE = 0.04;

/**
 * The 3D hint view (Epic 5, Phases 3-4): three.js rendering of SpaceSimulation. Starts with the
 * camera pixel-matched to the 2D canvas so the switch is seamless, then the layout inflates into
 * depth and the camera eases into a slow orbit until the player takes over. The scroll wheel
 * zooms toward the pointer; drag orbits; click selects words for analogies; double-click resets.
 *
 * Until the player touches the controls, the camera auto-frames: it eases toward the words'
 * centroid and a distance where the whole layout fits below the docked dashboard. In the shape
 * layout it also turns to the best view (looking along the least-variance principal axis).
 */
export class SpaceWorld implements WordWorld {
    readonly dimension = "3d" as const;
    private readonly renderer: THREE.WebGLRenderer;
    private readonly camera: THREE.PerspectiveCamera;
    private readonly controls: OrbitControls;
    private readonly view = new SpaceScene();
    private readonly sim = new SpaceSimulation(semanticEngine.calibration, layout3dConfig(stores.gameStore.layout3d));
    private layout: Layout3d = stores.gameStore.layout3d;
    private readonly colors = new Map<number, string>();
    private readonly raycaster = new THREE.Raycaster();
    private size: Size;
    private press: { x: number; y: number } | undefined;
    private hovered: number | undefined;
    private autoRotateTimer: number | undefined;
    private autoFrame = true;
    private readonly startedAt = performance.now();
    private viewOffsetY = 0;

    constructor(private readonly container: HTMLElement) {
        this.size = [container.clientWidth || window.innerWidth, window.innerHeight];
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(...this.size);
        container.appendChild(this.renderer.domElement);

        this.camera = new THREE.PerspectiveCamera(FOV, this.size[0] / this.size[1], 1, 20000);
        this.camera.position.set(0, 0, pixelMatchedDistance(this.size[1], FOV));
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.zoomToCursor = true;
        this.controls.minDistance = 120;
        this.controls.maxDistance = 5000;
        this.controls.autoRotateSpeed = 0.5;
        this.controls.addEventListener("start", this.stopAutoRotate);
        // Let the layout inflate first, then drift so the depth is visible without interaction.
        // Orbits layout drifts so its depth is visible; the shape layout holds its best view instead.
        this.autoRotateTimer = window.setTimeout(() => { this.controls.autoRotate = this.layout === "orbits"; }, 2500);

        const canvas = this.renderer.domElement;
        canvas.addEventListener("pointerdown", this.onPointerDown);
        canvas.addEventListener("pointerup", this.onPointerUp);
        canvas.addEventListener("pointermove", this.onPointerMove);
        canvas.addEventListener("dblclick", this.resetView);
        window.addEventListener("resize", this.onResize);

        deps.activeWorld = this;
        deps.pendingWordSpawns = [];
        stores.menuStore.clearWordSelection();
        this.seed();
        this.renderer.setAnimationLoop(this.frame);
    }

    wordTexts(): string[] {
        return this.sim.bodies.map(b => b.word);
    }

    clearWordBoxes(): void {
        deps.pendingWordSpawns = [];
        this.sim.clear();
        this.colors.clear();
    }

    /** Canvas-pixel projections (for hand-off back to 2D and for tests) plus 3D positions. */
    wordProbes(): (WordProbe & { color: string })[] {
        return this.sim.bodies.map(b => {
            const ndc = new THREE.Vector3(...b.position).project(this.camera);
            const [x, y] = ndcToCanvas([ndc.x, ndc.y], this.size, 0);
            return { text: b.word, x, y, position: [...b.position], color: this.colors.get(b.id)! };
        });
    }

    destroy(): void {
        window.clearTimeout(this.autoRotateTimer);
        this.renderer.setAnimationLoop(null);
        const canvas = this.renderer.domElement;
        canvas.removeEventListener("pointerdown", this.onPointerDown);
        canvas.removeEventListener("pointerup", this.onPointerUp);
        canvas.removeEventListener("pointermove", this.onPointerMove);
        canvas.removeEventListener("dblclick", this.resetView);
        window.removeEventListener("resize", this.onResize);
        this.controls.removeEventListener("start", this.stopAutoRotate);
        this.controls.dispose();
        this.view.dispose();
        this.renderer.dispose();
        canvas.remove();
        if (deps.activeWorld === this) deps.activeWorld = undefined;
    }

    /** Adopt the 2D board if we came from it; otherwise start the view like the 2D world does. */
    private seed(): void {
        const { view } = stores.menuStore;
        const handoff = takeHandoff(view);
        if (handoff) {
            handoff.forEach(({ word, x, y, color }) => deps.pendingWordSpawns.push({ word, x, y, color }));
        } else if (view === "game") {
            if (!isRoundRunning(stores)) startTimedRound(stores);
        } else {
            semanticEngine.randomWords(INITIAL_WORDS).forEach(word => deps.pendingWordSpawns.push({ word }));
        }
    }

    private frame = () => {
        if (stores.gameStore.layout3d !== this.layout) {
            this.layout = stores.gameStore.layout3d;
            this.sim.setConfig(layout3dConfig(this.layout));
            this.resetView(); // the layout changes size and shape: re-frame it (and orient, for shape)
        }
        this.spawnQueuedWords();
        this.sim.step();
        if (this.view.applyTheme(stores.menuStore.theme)) this.renderer.setClearColor(this.view.scene.background as THREE.Color);
        const selected = new Set(stores.menuStore.selectedWordIds);
        this.view.syncLabels(this.sim.bodies, id => this.colors.get(id)!, selected);
        // Shape layout: draw the nearest-neighbour skeleton so lines, rings, and stars are readable.
        const threads = this.layout === "shape" ? this.sim.skeleton(2) : this.sim.links;
        this.view.syncThreads(this.sim.bodies, threads, this.hovered);
        this.view.syncPills(this.sim.bodies, threads, this.hovered);
        this.frameCamera();
        this.controls.update();
        this.view.updateFog(this.camera.position.distanceTo(this.controls.target));
        this.renderer.render(this.view.scene, this.camera);
    };

    /**
     * Shifts the projection centre below a dashboard docked at the top, and (while auto-framing)
     * eases the orbit target to the words' centroid and the distance at which they all fit.
     */
    private frameCamera(): void {
        const [width, height] = this.size;
        const rect = deps.overlayRect;
        const topBand = rect && rect.top < 100 ? Math.min(rect.bottom, height * 0.5) : 0;
        const offsetY = -topBand / 2;
        if (offsetY !== this.viewOffsetY) {
            this.viewOffsetY = offsetY;
            this.camera.setViewOffset(width, height, 0, offsetY, width, height);
        }
        if (!this.autoFrame || this.sim.bodies.length === 0 || performance.now() - this.startedAt < FRAMING_DELAY_MS) return;

        const { center, radius } = boundingSphere(this.sim.bodies);
        const available = (height - topBand) / height;
        const fov = (2 * Math.atan(Math.tan((FOV * Math.PI) / 360) * available) * 180) / Math.PI;
        const desired = Math.max(this.controls.minDistance, fitDistance(radius * 1.05, fov, width / (height - topBand)));
        const offset = this.camera.position.clone().sub(this.controls.target);
        const length = offset.length() + (desired - offset.length()) * FRAMING_EASE;
        if (this.layout === "shape" && this.sim.bodies.length >= 3) {
            // Look along the least-variance axis so lines and rings are seen face-on, not end-on.
            const current = offset.clone().normalize();
            const best = bestViewDirection(principalAxes(this.sim.bodies.map(b => b.position)), current.toArray() as Vec3);
            offset.copy(current.lerp(new THREE.Vector3(...best), FRAMING_EASE).normalize());
        }
        offset.setLength(length);
        this.controls.target.lerp(new THREE.Vector3(...center), FRAMING_EASE);
        this.camera.position.copy(this.controls.target).add(offset);
    }

    private spawnQueuedWords(): void {
        const onBoard = new Set(this.sim.bodies.map(b => b.word));
        for (const { word, x, y, color } of deps.pendingWordSpawns.splice(0, 4)) {
            const vector = semanticEngine.lookup(word);
            if (!vector || onBoard.has(word)) continue;
            const start = x !== undefined && y !== undefined ? canvasToSpace([x, y], this.size) : undefined;
            const body = this.sim.add(word, vector, semanticEngine.rankOf(word), start);
            this.colors.set(body.id, color ?? getRandomColor());
            onBoard.add(word);
        }
    }

    private pick(event: PointerEvent): number | undefined {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(ndc, this.camera);
        const [hit] = this.raycaster.intersectObjects(this.view.pickables(), false);
        return hit?.object.userData.bodyId as number | undefined;
    }

    private onPointerDown = (event: PointerEvent) => {
        this.press = { x: event.clientX, y: event.clientY };
    };

    private onPointerUp = (event: PointerEvent) => {
        const press = this.press;
        this.press = undefined;
        if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_SLOP) return;
        const id = this.pick(event);
        const body = this.sim.bodies.find(b => b.id === id);
        if (body) selectWordForAnalogy(stores, body.id, body.word);
    };

    private onPointerMove = (event: PointerEvent) => {
        if (event.buttons !== 0) return; // orbiting, not hovering
        this.hovered = this.pick(event);
        this.renderer.domElement.style.cursor = this.hovered !== undefined ? "pointer" : "grab";
    };

    private onResize = () => {
        this.size = [this.container.clientWidth || window.innerWidth, window.innerHeight];
        this.renderer.setSize(...this.size);
        this.camera.aspect = this.size[0] / this.size[1];
        this.viewOffsetY = Number.NaN; // force frameCamera to re-apply the offset for the new size
        this.camera.updateProjectionMatrix();
    };

    /** The player took the camera: stop drifting and stop auto-framing. */
    private stopAutoRotate = () => {
        window.clearTimeout(this.autoRotateTimer);
        this.controls.autoRotate = false;
        this.autoFrame = false;
    };

    /** Double-click: hand the camera back to auto-framing and the slow orbit. */
    private resetView = () => {
        this.autoFrame = true;
        this.controls.autoRotate = this.layout === "orbits";
    };
}

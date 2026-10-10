import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import deps from "../matterJsComp/Deps";
import { focusTargets, WordProbe, WordWorld } from "../matterJsComp/wordWorld";
import { SpaceSimulation } from "../physics/spaceSimulation";
import { Layout3d, layout3dConfig, layoutScale3d, viewAspect } from "../physics/layoutPresets";
import { semanticEngine } from "../services/semanticEngine";
import { selectWordForAnalogy, startWordBoard, takeBoardTransfer } from "../services/playground";
import { AppModes } from "../matterJsComp/models/appMode";
import { stores } from "../stores";
import { getRandomColor } from "../utils/colorUtils";
import { colorHintPainter } from "../services/colorHints";
import { CameraDirector, FOV } from "./CameraDirector";
import { canvasToSpace, ndcToCanvas, pixelMatchedDistance, Size } from "./handoff";
import { SpaceScene } from "./SpaceScene";
import { LABEL_HEIGHT } from "./labelTexture";
import { labelScale, minLabelPx } from "./viewFit";

const INITIAL_WORDS = 8;
/** A press that moves less than this (px) is a click, not an orbit drag. */
const CLICK_SLOP = 6;

/**
 * The 3D hint view (Epic 5, Phases 3-4): three.js rendering of SpaceSimulation. Starts with the
 * camera pixel-matched to the 2D canvas so the switch is seamless, then the layout inflates into
 * depth. The scroll wheel zooms toward the pointer; drag orbits; click selects words for analogies;
 * double-click resets the camera. Camera behaviour (auto-framing, best view, focus) lives in
 * CameraDirector.
 */
export class SpaceWorld implements WordWorld {
    readonly dimension = "3d" as const;
    private readonly renderer: THREE.WebGLRenderer;
    private readonly camera: THREE.PerspectiveCamera;
    private readonly controls: OrbitControls;
    private readonly director: CameraDirector;
    private readonly view = new SpaceScene();
    private readonly sim: SpaceSimulation;
    private layout: Layout3d = stores.gameStore.layout3d;
    private readonly colors = new Map<number, string>();
    private readonly raycaster = new THREE.Raycaster();
    private size: Size;
    private press: { x: number; y: number } | undefined;
    private hovered: number | undefined;

    constructor(private readonly container: HTMLElement) {
        this.size = [container.clientWidth || window.innerWidth, window.innerHeight];
        this.sim = new SpaceSimulation(semanticEngine.calibration, this.layoutConfig());
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
        this.director = new CameraDirector(this.camera, this.controls, () => this.layout);

        const canvas = this.renderer.domElement;
        canvas.addEventListener("pointerdown", this.onPointerDown);
        canvas.addEventListener("pointerup", this.onPointerUp);
        canvas.addEventListener("pointermove", this.onPointerMove);
        canvas.addEventListener("dblclick", this.director.reset);
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

    removeWords(words: readonly string[]): void {
        const gone = new Set(words);
        this.sim.bodies.filter(b => gone.has(b.word)).forEach(b => {
            this.sim.remove(b.id);
            this.colors.delete(b.id);
        });
    }

    clearWordBoxes(): void {
        deps.pendingWordSpawns = [];
        this.sim.clear();
        this.colors.clear();
    }

    /** Flies the camera to the words (fitting them all in view) and makes them glow. */
    focusWords(words: readonly string[]): void {
        this.director.focusOn(words, this.sim.bodies);
    }

    focusedWords(): string[] {
        const glowing = this.director.glowing(this.sim.bodies);
        return this.sim.bodies.filter(b => glowing.has(b.id)).map(b => b.word);
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
        this.renderer.setAnimationLoop(null);
        const canvas = this.renderer.domElement;
        canvas.removeEventListener("pointerdown", this.onPointerDown);
        canvas.removeEventListener("pointerup", this.onPointerUp);
        canvas.removeEventListener("pointermove", this.onPointerMove);
        canvas.removeEventListener("dblclick", this.director.reset);
        window.removeEventListener("resize", this.onResize);
        this.director.dispose();
        this.controls.dispose();
        this.view.dispose();
        this.renderer.dispose();
        canvas.remove();
        if (deps.activeWorld === this) deps.activeWorld = undefined;
    }

    /** Adopt the 2D board if we came from it; otherwise start the view like the 2D world does (carried words stay). */
    private seed(): void {
        const transfer = takeBoardTransfer(stores.menuStore.view);
        if (transfer?.kind === "continue") {
            transfer.queue.forEach(request => deps.pendingWordSpawns.push(request));
        } else {
            startWordBoard(stores, transfer?.words ?? [], INITIAL_WORDS);
        }
    }

    private frame = () => {
        if (stores.gameStore.layout3d !== this.layout) {
            this.layout = stores.gameStore.layout3d;
            this.sim.setConfig(this.layoutConfig());
            this.director.reset(); // the layout changes size and shape: re-frame it (and orient, for shape)
        }
        this.spawnQueuedWords();
        this.sim.step();
        if (this.view.applyTheme(stores.menuStore.theme)) this.renderer.setClearColor(this.view.scene.background as THREE.Color);
        const selected = new Set(stores.menuStore.selectedWordIds);
        const hinted = stores.gameStore.colorHints ? colorHintPainter.colorsFor(this.sim.bodies.map(b => b.word)) : undefined;
        const wordOf = new Map(this.sim.bodies.map(b => [b.id, b.word]));
        const glowing = this.director.glowing(this.sim.bodies);
        // Connect-All: loose words (fewer than two connections) glow until they are bridged.
        const loose = stores.menuStore.view === "puzzle" ? new Set(stores.gameStore.puzzleStats?.loose ?? []) : undefined;
        if (loose) this.sim.bodies.forEach(b => { if (loose.has(b.word)) glowing.add(b.id); });
        // Labels stay at least the 2D word size on screen (phones framed them at 6 px), per the Aa size setting.
        const minPx = minLabelPx(this.size[0], stores.gameStore.wordSize);
        const scale = labelScale(this.camera.position.distanceTo(this.controls.target), this.size[1], FOV, LABEL_HEIGHT, minPx);
        this.view.syncLabels(this.sim.bodies, id => hinted?.get(wordOf.get(id)!) ?? this.colors.get(id)!, selected, glowing, scale);
        // Shape layout: draw the nearest-neighbour skeleton so lines, rings, and stars are readable.
        const threads = this.layout === "shape" ? this.sim.skeleton(2) : this.sim.links;
        this.view.syncThreads(this.sim.bodies, threads, this.hovered);
        this.view.syncPills(this.sim.bodies, threads, this.hovered);
        this.director.update(this.sim.bodies, this.size, deps.overlayRect, minPx, (center, axis, angle) => this.sim.rotate(center, axis, angle));
        // Hand (Move) mode navigates: drag rotates, two fingers pan; + (Create) mode keeps the view still so
        // taps add words. Pinch / scroll zoom works in both (owner, 2026-10-05).
        const navigating = stores.menuStore.mode === AppModes.MOVE;
        this.controls.enableRotate = navigating;
        this.controls.enablePan = navigating;
        this.controls.update();
        this.view.updateFog(this.camera.position.distanceTo(this.controls.target));
        this.renderer.render(this.view.scene, this.camera);
    };

    private spawnQueuedWords(): void {
        const onBoard = new Set(this.sim.bodies.map(b => b.word));
        const batch = deps.pendingWordSpawns.splice(0, 4);
        for (const { word, x, y, color } of batch) {
            const vector = semanticEngine.lookup(word);
            if (!vector || onBoard.has(word)) continue;
            const start = x !== undefined && y !== undefined ? canvasToSpace([x, y], this.size) : undefined;
            const body = this.sim.add(word, vector, semanticEngine.rankOf(word), start);
            this.colors.set(body.id, color ?? getRandomColor());
            onBoard.add(word);
        }
        // New player words, analogy words, and imports get focus, even if already on the board.
        const focus = focusTargets(batch);
        if (focus.length > 0) this.focusWords(focus);
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
        else if (stores.menuStore.mode === AppModes.CREATE) this.addWordAt(event);
    };

    /**
     * + mode on empty space (Epic 5 · Feature 5.13): a random word lands where you tapped, on the plane
     * through the orbit target facing the camera. Discovery only, like 2D: Guess deals a scarce supply and
     * every Connect word is a typed move.
     */
    private addWordAt(event: PointerEvent): void {
        if (stores.menuStore.view !== "fountain" || !semanticEngine.isReady) return;
        const rect = this.renderer.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(ndc, this.camera);
        const normal = this.camera.getWorldDirection(new THREE.Vector3());
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, this.controls.target);
        const point = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
        const [word] = semanticEngine.randomWords(1);
        if (!point || !word || this.sim.bodies.some(b => b.word === word)) return;
        const vector = semanticEngine.lookup(word);
        if (!vector) return;
        const body = this.sim.add(word, vector, semanticEngine.rankOf(word), [point.x, point.y, point.z]);
        this.colors.set(body.id, getRandomColor());
        // It glows while it moves to its place, so the eye can follow it (the camera stays put).
        this.director.highlight([word]);
    }

    private onPointerMove = (event: PointerEvent) => {
        if (event.buttons !== 0) return; // orbiting, not hovering
        this.hovered = this.pick(event);
        this.renderer.domElement.style.cursor = this.hovered !== undefined ? "pointer" : "grab";
    };

    /** The layout preset with lengths for this screen (phones get a compact layout, Task 5.7.3). */
    private layoutConfig() {
        return layout3dConfig(this.layout, layoutScale3d(...this.size), viewAspect(...this.size));
    }

    private onResize = () => {
        this.size = [this.container.clientWidth || window.innerWidth, window.innerHeight];
        this.sim.setConfig(this.layoutConfig());
        this.renderer.setSize(...this.size);
        this.camera.aspect = this.size[0] / this.size[1];
        this.director.invalidateViewOffset();
        this.camera.updateProjectionMatrix();
    };
}

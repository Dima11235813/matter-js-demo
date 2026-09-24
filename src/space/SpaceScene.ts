import * as THREE from "three";
import { SpaceBody } from "../physics/spaceSimulation";
import { OrbitalLink } from "../physics/orbitalForces";
import { palettes, ThemeName } from "../theme/palette";
import { drawValuePill, drawWordLabel, labelSize } from "./labelTexture";

interface Label {
    sprite: THREE.Sprite;
    styleKey: string;
}

const MAX_LINKS = 400;

/**
 * three.js objects for the 3D hint view: camera-facing word labels, relation threads (brighter
 * as similarity grows, full strength for the hovered word), similarity pills for the hovered
 * word's links, and theme-driven background and depth fog.
 */
export class SpaceScene {
    readonly scene = new THREE.Scene();
    private readonly labels = new Map<number, Label>();
    private readonly threads: THREE.LineSegments;
    private readonly threadPositions = new Float32Array(MAX_LINKS * 2 * 3);
    private readonly threadColors = new Float32Array(MAX_LINKS * 2 * 3);
    private readonly pills: THREE.Sprite[] = [];
    private readonly pillTextures = new Map<string, THREE.Texture>();
    private theme: ThemeName | undefined;

    constructor() {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(this.threadPositions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(this.threadColors, 3));
        this.threads = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, fog: true }));
        this.threads.frustumCulled = false;
        this.scene.add(this.threads);
        this.scene.fog = new THREE.Fog(0x000000, 500, 2500);
    }

    /** Applies a theme; returns true when it changed (labels then restyle). */
    applyTheme(theme: ThemeName): boolean {
        if (theme === this.theme) return false;
        this.theme = theme;
        const color = new THREE.Color(palettes[theme].canvas);
        this.scene.background = color;
        (this.scene.fog as THREE.Fog).color = color;
        this.pillTextures.forEach(t => t.dispose());
        this.pillTextures.clear();
        return true;
    }

    /** Depth cue: fog starts just behind the orbit target and fully hides far-side words. */
    updateFog(cameraDistance: number): void {
        const fog = this.scene.fog as THREE.Fog;
        fog.near = cameraDistance * 0.75;
        fog.far = cameraDistance * 2.4;
    }

    syncLabels(bodies: readonly SpaceBody[], colorOf: (id: number) => string, selected: ReadonlySet<number>, glowing: ReadonlySet<number> = new Set()): void {
        const palette = palettes[this.theme ?? "dark"];
        const alive = new Set<number>();
        const pulse = 1 + 0.12 * Math.sin(performance.now() / 110);
        for (const body of bodies) {
            alive.add(body.id);
            const isSelected = selected.has(body.id);
            const isGlowing = glowing.has(body.id);
            const stroke = isSelected ? palette.selection : isGlowing ? palette.thread : palette.boxStroke;
            const style = { fill: colorOf(body.id), stroke, strokeWidth: isSelected || isGlowing ? 7 : 4 };
            const styleKey = `${this.theme}|${style.fill}|${isSelected}|${isGlowing}`;
            let label = this.labels.get(body.id);
            if (!label) {
                const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ fog: true }));
                sprite.userData.bodyId = body.id;
                const [w, h] = labelSize(body.word);
                sprite.scale.set(w, h, 1);
                this.scene.add(sprite);
                label = { sprite, styleKey: "" };
                this.labels.set(body.id, label);
            }
            if (label.styleKey !== styleKey) {
                const material = label.sprite.material;
                material.map?.dispose();
                material.map = new THREE.CanvasTexture(drawWordLabel(body.word, style));
                material.map.colorSpace = THREE.SRGBColorSpace;
                material.needsUpdate = true;
                label.styleKey = styleKey;
            }
            label.sprite.position.set(body.position[0], body.position[1], body.position[2]);
            // Focused labels pulse in size so the eye finds them.
            const [w, h] = labelSize(body.word);
            const scale = isGlowing ? pulse : 1;
            label.sprite.scale.set(w * scale, h * scale, 1);
        }
        for (const [id, label] of this.labels) if (!alive.has(id)) this.removeLabel(id, label);
    }

    syncThreads(bodies: readonly SpaceBody[], links: readonly OrbitalLink[], hovered?: number): void {
        const palette = palettes[this.theme ?? "dark"];
        const base = new THREE.Color(palette.canvas);
        const thread = new THREE.Color(palette.thread);
        const count = Math.min(links.length, MAX_LINKS);
        for (let l = 0; l < count; l++) {
            const { i, j, strength } = links[l];
            const touchesHover = hovered !== undefined && (bodies[i].id === hovered || bodies[j].id === hovered);
            // WebGL lines have no per-segment alpha: blend toward the background instead.
            const color = base.clone().lerp(thread, touchesHover ? 1 : 0.25 + 0.6 * strength);
            [bodies[i], bodies[j]].forEach((b, end) => {
                this.threadPositions.set(b.position, (l * 2 + end) * 3);
                this.threadColors.set([color.r, color.g, color.b], (l * 2 + end) * 3);
            });
        }
        const geometry = this.threads.geometry;
        geometry.setDrawRange(0, count * 2);
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
    }

    /** Similarity values for the hovered word's links, at each link's midpoint. */
    syncPills(bodies: readonly SpaceBody[], links: readonly OrbitalLink[], hovered?: number): void {
        const palette = palettes[this.theme ?? "dark"];
        const shown = hovered === undefined ? [] : links.filter(l => bodies[l.i].id === hovered || bodies[l.j].id === hovered);
        while (this.pills.length < shown.length) {
            const pill = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, fog: false }));
            pill.renderOrder = 10;
            pill.scale.set(44, 22, 1);
            this.scene.add(pill);
            this.pills.push(pill);
        }
        this.pills.forEach((pill, k) => {
            const link = shown[k];
            pill.visible = link !== undefined;
            if (!link) return;
            const text = link.similarity.toFixed(2);
            let texture = this.pillTextures.get(text);
            if (!texture) {
                texture = new THREE.CanvasTexture(drawValuePill(text, palette.labelBackground, palette.thread));
                texture.colorSpace = THREE.SRGBColorSpace;
                this.pillTextures.set(text, texture);
            }
            if (pill.material.map !== texture) {
                pill.material.map = texture;
                pill.material.needsUpdate = true;
            }
            const [a, b] = [bodies[link.i].position, bodies[link.j].position];
            pill.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
        });
    }

    pickables(): THREE.Object3D[] {
        return [...this.labels.values()].map(l => l.sprite);
    }

    dispose(): void {
        for (const [id, label] of this.labels) this.removeLabel(id, label);
        this.pills.forEach(p => p.material.dispose());
        this.pillTextures.forEach(t => t.dispose());
        this.threads.geometry.dispose();
        (this.threads.material as THREE.Material).dispose();
    }

    private removeLabel(id: number, label: Label): void {
        this.scene.remove(label.sprite);
        label.sprite.material.map?.dispose();
        label.sprite.material.dispose();
        this.labels.delete(id);
    }
}

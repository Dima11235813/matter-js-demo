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
/** Molecules hold at most 5 words (4 bonds each); this covers any board. */
const MAX_BONDS = 200;

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
    /** Molecule halos by member body id (Task 5.15.1), drawn behind the labels. */
    private readonly halos = new Map<number, THREE.Sprite>();
    private haloTexture: THREE.Texture | undefined;
    private readonly bonds: THREE.LineSegments;
    private readonly bondPositions = new Float32Array(MAX_BONDS * 2 * 3);
    private readonly bondColors = new Float32Array(MAX_BONDS * 2 * 3);
    private theme: ThemeName | undefined;

    constructor() {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(this.threadPositions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(this.threadColors, 3));
        this.threads = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, fog: true }));
        this.threads.frustumCulled = false;
        this.scene.add(this.threads);
        const bondGeometry = new THREE.BufferGeometry();
        bondGeometry.setAttribute("position", new THREE.BufferAttribute(this.bondPositions, 3));
        bondGeometry.setAttribute("color", new THREE.BufferAttribute(this.bondColors, 3));
        this.bonds = new THREE.LineSegments(bondGeometry, new THREE.LineBasicMaterial({ vertexColors: true, fog: true }));
        this.bonds.frustumCulled = false;
        this.scene.add(this.bonds);
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

    /** `scale` (>= 1) keeps labels readable when the camera is far away (viewFit.labelScale). */
    syncLabels(bodies: readonly SpaceBody[], colorOf: (id: number) => string, selected: ReadonlySet<number>, glowing: ReadonlySet<number> = new Set(), scale = 1): void {
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
            const k = scale * (isGlowing ? pulse : 1);
            label.sprite.scale.set(w * k, h * k, 1);
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

    /**
     * A halo behind every molecule member and a line along each bond, in the molecule's own hue (golden-angle
     * spacing by id, as the 2D overlay does), so a molecule reads as one unit from any angle, even when its
     * members sit at different depths. `scale` matches the labels'.
     */
    syncMoleculeHalos(bodies: readonly SpaceBody[], molecules: ReadonlyArray<{ id: number; members: readonly number[]; bonds: ReadonlyArray<readonly [number, number]> }>, scale = 1): void {
        const light = this.theme === "light";
        const byId = new Map(bodies.map(b => [b.id, b]));
        const alive = new Set<number>();
        let bondCount = 0;
        for (const { id, members, bonds } of molecules) {
            const color = new THREE.Color().setHSL(((id * 137.508) % 360) / 360, 0.7, light ? 0.6 : 0.5);
            for (const [a, b] of bonds) {
                const [from, to] = [byId.get(a), byId.get(b)];
                if (!from || !to || bondCount >= MAX_BONDS) continue;
                [from, to].forEach((body, end) => {
                    this.bondPositions.set(body.position, (bondCount * 2 + end) * 3);
                    this.bondColors.set([color.r, color.g, color.b], (bondCount * 2 + end) * 3);
                });
                bondCount++;
            }
            for (const member of members) {
                const body = byId.get(member);
                if (!body) continue;
                alive.add(member);
                let halo = this.halos.get(member);
                if (!halo) {
                    halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.halo(), transparent: true, depthWrite: false, fog: true, opacity: light ? 0.85 : 0.7 }));
                    halo.renderOrder = -1;
                    this.scene.add(halo);
                    this.halos.set(member, halo);
                }
                halo.material.color.copy(color);
                halo.position.set(body.position[0], body.position[1], body.position[2]);
                const [w, h] = labelSize(body.word);
                halo.scale.set(w * scale * 1.35, h * scale * 2.2, 1);
            }
        }
        for (const [member, halo] of this.halos) {
            if (alive.has(member)) continue;
            this.scene.remove(halo);
            halo.material.dispose();
            this.halos.delete(member);
        }
        const geometry = this.bonds.geometry;
        geometry.setDrawRange(0, bondCount * 2);
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
    }

    /** A white radial glow, tinted per molecule by the sprite color. */
    private halo(): THREE.Texture {
        if (!this.haloTexture) {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 64;
            const g = canvas.getContext("2d")!;
            const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
            gradient.addColorStop(0, "rgba(255,255,255,1)");
            gradient.addColorStop(0.55, "rgba(255,255,255,0.85)");
            gradient.addColorStop(1, "rgba(255,255,255,0)");
            g.fillStyle = gradient;
            g.fillRect(0, 0, 64, 64);
            this.haloTexture = new THREE.CanvasTexture(canvas);
        }
        return this.haloTexture;
    }

    pickables(): THREE.Object3D[] {
        return [...this.labels.values()].map(l => l.sprite);
    }

    dispose(): void {
        for (const [id, label] of this.labels) this.removeLabel(id, label);
        this.syncMoleculeHalos([], []);
        this.haloTexture?.dispose();
        this.bonds.geometry.dispose();
        (this.bonds.material as THREE.Material).dispose();
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

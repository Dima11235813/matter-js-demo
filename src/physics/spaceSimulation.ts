import { Calibration } from "../embeddings/calibration";
import { layoutFidelity, LayoutFidelity } from "./layoutMetrics";
import {
    defaultOrbitalTuning, findLinks, neighborSkeleton, orbitalAccelerations, OrbitalBody, OrbitalLink, OrbitalTuning, Point, similarityMatrix,
} from "./orbitalForces";

/**
 * Renderer-agnostic 3D simulation for the hint view (Epic 5, Phase 2). Matter.js is 2D only, and
 * hint mode needs soft contact rather than rigid bodies, so this integrates word bodies directly:
 *
 *   forces      the same all-pairs orbital model as 2D (physics/orbitalForces.ts), in 3D
 *   collisions  soft spheres sized by label, pushed apart in proportion to overlap
 *   bounds      a spherical container that pulls strays back in
 *   integrator  damped Verlet-style: v = v * (1 - damping) + a;  p += v   (matches Matter's air friction)
 *
 * Deterministic: no randomness inside; orbit axes and depth jitter derive from each word's text.
 * Units match the 2D view (px-like world units, one step = one 60 Hz frame).
 */
export type Point3 = [number, number, number];

export interface SpaceBody {
    id: number;
    word: string;
    vector: Float32Array;
    /** Frequency rank; lower = more common = core of its links. */
    rank: number;
    position: Point3;
    velocity: Point3;
    /** Collision radius, derived from the label size. */
    radius: number;
    /** Normal of the plane this word orbits its core in. */
    orbitAxis: Point3;
}

export interface SpaceConfig {
    tuning: OrbitalTuning;
    damping: number;
    boundsRadius: number;
    boundsPull: number;
    collisionPush: number;
    maxSpeed: number;
}

export const defaultSpaceConfig: SpaceConfig = {
    tuning: defaultOrbitalTuning,
    damping: 0.06,
    boundsRadius: 650,
    boundsPull: 0.004,
    collisionPush: 0.08,
    maxSpeed: 8,
};

/** FNV-1a: small, fast, stable string hash for deterministic per-word geometry. */
export function hashWord(word: string, seed = 0x811c9dc5): number {
    let h = seed >>> 0;
    for (let i = 0; i < word.length; i++) {
        h ^= word.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
}

/** Deterministic unit vector per word (uniform on the sphere), used as its orbit-plane normal. */
export function orbitAxisFor(word: string): Point3 {
    const u = hashWord(word) / 0xffffffff;
    const v = hashWord(word, 0x9e3779b9) / 0xffffffff;
    const z = 2 * u - 1;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const phi = 2 * Math.PI * v;
    return [r * Math.cos(phi), r * Math.sin(phi), z];
}

/** Collision radius for a label of `length` characters (matches the 2D box sizing). */
export function labelRadius(length: number): number {
    return (length * 20 + 20) / 2 * 0.8;
}

export class SpaceSimulation {
    readonly bodies: SpaceBody[] = [];
    private nextId = 1;
    private simsKey = "";
    private sims: Float32Array = new Float32Array(0);
    private currentLinks: OrbitalLink[] = [];
    private skeletonCache: { key: string; edges: OrbitalLink[] } | undefined;

    constructor(private readonly cal: Calibration, private currentConfig: SpaceConfig = defaultSpaceConfig) {}

    get config(): SpaceConfig {
        return this.currentConfig;
    }

    /** Switches the force model in place; bodies keep their positions and velocities. */
    setConfig(config: SpaceConfig): void {
        this.currentConfig = config;
    }

    /** Links from the last step (for drawing threads). Indices refer to `bodies`. */
    get links(): readonly OrbitalLink[] {
        return this.currentLinks;
    }

    /** Each word's k nearest neighbours (cached per word set). Indices refer to `bodies`. */
    skeleton(k = 2): readonly OrbitalLink[] {
        const sims = this.similarities();
        const key = `${this.simsKey}|${k}`;
        if (this.skeletonCache?.key !== key) this.skeletonCache = { key, edges: neighborSkeleton(sims, this.bodies.length, k) };
        return this.skeletonCache.edges;
    }

    /**
     * Adds a word. Without a position it starts at a deterministic point on a small shell; with a
     * 2D position (z omitted) it starts flat plus a small deterministic depth jitter, so symmetric
     * layouts can still inflate into 3D.
     */
    add(word: string, vector: Float32Array, rank: number, position?: [number, number] | Point3): SpaceBody {
        const jitter = ((hashWord(word, 0x51ed270b) / 0xffffffff) - 0.5) * 40;
        let start: Point3;
        if (!position) {
            const axis = orbitAxisFor(`${word}#start`);
            start = [axis[0] * 200, axis[1] * 200, axis[2] * 200];
        } else {
            start = [position[0], position[1], position.length === 3 ? position[2] : jitter];
        }
        const body: SpaceBody = {
            id: this.nextId++,
            word,
            vector,
            rank,
            position: start,
            velocity: [0, 0, 0],
            radius: labelRadius(word.length),
            orbitAxis: orbitAxisFor(word),
        };
        this.bodies.push(body);
        return body;
    }

    remove(id: number): void {
        const index = this.bodies.findIndex(b => b.id === id);
        if (index >= 0) this.bodies.splice(index, 1);
    }

    clear(): void {
        this.bodies.length = 0;
    }

    step(steps = 1): void {
        for (let s = 0; s < steps; s++) this.stepOnce();
    }

    kineticEnergy(): number {
        return this.bodies.reduce((sum, b) => sum + 0.5 * (b.velocity[0] ** 2 + b.velocity[1] ** 2 + b.velocity[2] ** 2), 0);
    }

    fidelity(): LayoutFidelity {
        return layoutFidelity(this.bodies.map(b => b.position), this.bodies.map(b => b.vector));
    }

    private stepOnce(): void {
        const n = this.bodies.length;
        if (n === 0) return;
        const orbital: OrbitalBody[] = this.bodies.map(b => ({ position: b.position, vector: b.vector, rank: b.rank, orbitAxis: b.orbitAxis }));
        const sims = this.similarities();
        const { tuning } = this.config;
        this.currentLinks = findLinks(orbital, this.cal, tuning, sims);
        const acc = orbitalAccelerations(orbital, this.currentLinks, [0, 0, 0], this.cal, tuning, sims);
        this.addCollisions(acc);
        this.addBounds(acc);
        this.integrate(acc);
    }

    private similarities(): Float32Array {
        const key = this.bodies.map(b => b.id).join(",");
        if (key !== this.simsKey) {
            this.simsKey = key;
            this.sims = similarityMatrix(this.bodies.map(b => b.vector));
        }
        return this.sims;
    }

    /** Soft spheres: overlapping bodies push apart in proportion to how deeply they overlap. */
    private addCollisions(acc: Point[]): void {
        const { collisionPush } = this.config;
        for (let i = 0; i < this.bodies.length; i++) {
            for (let j = i + 1; j < this.bodies.length; j++) {
                const a = this.bodies[i], b = this.bodies[j];
                const d = [b.position[0] - a.position[0], b.position[1] - a.position[1], b.position[2] - a.position[2]];
                const dist = Math.hypot(d[0], d[1], d[2]);
                const overlap = a.radius + b.radius - dist;
                if (overlap <= 0) continue;
                // Coincident bodies: separate along a deterministic axis instead of dividing by zero.
                const unit = dist > 1e-6 ? d.map(v => v / dist) : orbitAxisFor(`${a.word}|${b.word}`);
                for (let k = 0; k < 3; k++) {
                    acc[i][k] -= unit[k] * overlap * collisionPush;
                    acc[j][k] += unit[k] * overlap * collisionPush;
                }
            }
        }
    }

    /** Spherical container: bodies beyond the radius are pulled back toward the centre. */
    private addBounds(acc: Point[]): void {
        const { boundsRadius, boundsPull } = this.config;
        this.bodies.forEach((b, i) => {
            const dist = Math.hypot(b.position[0], b.position[1], b.position[2]);
            const excess = dist + b.radius - boundsRadius;
            if (excess <= 0 || dist === 0) return;
            for (let k = 0; k < 3; k++) acc[i][k] -= (b.position[k] / dist) * excess * boundsPull;
        });
    }

    private integrate(acc: Point[]): void {
        const { damping, maxSpeed } = this.config;
        this.bodies.forEach((b, i) => {
            for (let k = 0; k < 3; k++) b.velocity[k] = b.velocity[k] * (1 - damping) + acc[i][k];
            const speed = Math.hypot(b.velocity[0], b.velocity[1], b.velocity[2]);
            if (speed > maxSpeed) for (let k = 0; k < 3; k++) b.velocity[k] *= maxSpeed / speed;
            for (let k = 0; k < 3; k++) b.position[k] += b.velocity[k];
        });
    }
}

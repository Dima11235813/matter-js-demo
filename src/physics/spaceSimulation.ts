import { Calibration } from "../embeddings/calibration";
import { layoutFidelity, LayoutFidelity } from "./layoutMetrics";
import {
    defaultGroupThreshold, defaultOrbitalTuning, findLinks, neighborSkeleton, orbitalAccelerations, OrbitalBody, OrbitalLink, OrbitalTuning, Point, similarityGroups,
    similarityMatrix,
} from "./orbitalForces";
import { MoleculeGraph, relaxSphereOffsets } from "./molecules";

/**
 * Renderer-agnostic 3D simulation for the hint view (Epic 5, Phase 2). Matter.js is 2D only, and
 * hint mode needs soft contact rather than rigid bodies, so this integrates word bodies directly:
 *
 *   forces      the same all-pairs orbital model as 2D (physics/orbitalForces.ts), in 3D
 *   collisions  soft spheres sized by label, pushed apart in proportion to overlap
 *   bounds      a spherical container that pulls strays back in
 *   molecules   related words (a p99 link) that touch bond into rigid molecules, as in 2D (Task 5.15.1)
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
    /**
     * Upright ellipsoid container: the vertical (y) radius is `boundsRadius` times this (default 1, a
     * sphere). A portrait phone uses it so the layout stands tall like the screen (Task 5.7.3).
     */
    boundsStretchY?: number;
    boundsPull: number;
    collisionPush: number;
    maxSpeed: number;
    /**
     * Word molecules (Task 5.15.1): two linked words bond when their centres come closer than this share
     * of their summed radii (soft spheres overlap a little all the time, so 1 would bond on any graze).
     * 0 or undefined: no new bonds (molecules handed over from 2D still hold).
     */
    bondContact?: number;
}

export const defaultSpaceConfig: SpaceConfig = {
    tuning: defaultOrbitalTuning,
    damping: 0.06,
    boundsRadius: 650,
    boundsPull: 0.004,
    collisionPush: 0.08,
    maxSpeed: 8,
    // No new bonds in 3D (docs/research/molecules-3d.md): players can't push words together there, so every
    // 3D bond is an accident of the layout settling, and on tight sets (days, numbers) the frozen chunks broke
    // the shape preset's lines and rings (fidelity -0.90 -> -0.69). Molecules built in 2D still carry over.
    bondContact: 0,
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
    /** Rigid word molecules, keyed by body id (the same model as 2D, physics/molecules.ts). */
    readonly molecules = new MoleculeGraph();
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

    /**
     * Each word's k nearest neighbours (cached per word set). Indices refer to `bodies`. With the
     * grouped model, only edges inside a group are kept: cross-group threads would visually tie the
     * separated groups back into one ball.
     */
    skeleton(k = 2): readonly OrbitalLink[] {
        const sims = this.similarities();
        const { tuning } = this.config;
        const grouped = tuning.targetModel === "grouped";
        const key = `${this.simsKey}|${k}|${grouped}`;
        if (this.skeletonCache?.key !== key) {
            const n = this.bodies.length;
            let edges = neighborSkeleton(sims, n, k);
            if (grouped) {
                const label = similarityGroups(sims, n, tuning.groupThreshold || defaultGroupThreshold(this.cal));
                edges = edges.filter(e => label[e.i] === label[e.j]);
            }
            this.skeletonCache = { key, edges };
        }
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
        this.molecules.remove(id);
    }

    clear(): void {
        this.bodies.length = 0;
        this.molecules.clear();
    }

    /**
     * Bonds two bodies into one molecule (merging molecules), freezing their arrangement with overlapping
     * members pushed apart until they touch. Used on contact and to restore molecules handed over from the
     * other dimension. False when already bonded, over the size cap, or either body is unknown.
     */
    bond(a: number, b: number): boolean {
        const byId = new Map(this.bodies.map(body => [body.id, body]));
        if (!byId.has(a) || !byId.has(b)) return false;
        if (!this.molecules.bond(a, b, id => byId.get(id)!.position, id => byId.get(id)!.rank)) return false;
        const molecule = this.molecules.moleculeOf(a)!;
        relaxSphereOffsets(molecule.offsets, molecule.anchor, id => byId.get(id)!.radius);
        return true;
    }

    /** The words of each molecule (hand-off to the other dimension, colors, tests). */
    moleculeWords(): string[][] {
        const wordOf = new Map(this.bodies.map(b => [b.id, b.word]));
        return this.molecules.all().map(m => [...m.offsets.keys()].map(id => wordOf.get(id)!).filter(Boolean));
    }

    /**
     * Turns the whole layout rigidly by `angle` (radians) about `axis` (unit) through `center`: positions,
     * velocities, and orbit planes. Stress layouts don't care how they are oriented, so this only changes
     * the view (the phone camera turns a tall layout upright this way: its up vector is fixed).
     */
    rotate(center: Point3, axis: Point3, angle: number): void {
        const turn = (v: Point3): Point3 => rotateAbout(v, axis, angle);
        for (const body of this.bodies) {
            const offset = turn([body.position[0] - center[0], body.position[1] - center[1], body.position[2] - center[2]]);
            body.position = [center[0] + offset[0], center[1] + offset[1], center[2] + offset[2]];
            body.velocity = turn(body.velocity);
            body.orbitAxis = turn(body.orbitAxis);
        }
        // Molecule offsets are in world axes: turn them too, or the rigid snap would undo the turn.
        for (const molecule of this.molecules.all()) {
            for (const [id, offset] of molecule.offsets) molecule.offsets.set(id, turn(offset as Point3));
        }
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
        const ids = this.bodies.map(b => b.id);
        const groups = this.molecules.count > 0 ? this.molecules.groups(ids) : undefined;
        let acc = orbitalAccelerations(orbital, this.currentLinks, [0, 0, 0], this.cal, tuning, sims, groups);
        const contacts = this.addCollisions(acc, groups);
        this.addBounds(acc);
        // Members move as one: the molecule's mass-weighted (label size) mean acceleration.
        if (groups) acc = this.molecules.shareAccelerations(ids, acc, this.bodies.map(b => b.radius));
        this.integrate(acc);
        this.bondContacts(contacts, sims);
        this.snapMolecules();
    }

    /** Linked words (p99) that touched closely enough this step bond, as in 2D. */
    private bondContacts(contacts: Array<[number, number, number]>, sims: Float32Array): void {
        const { bondContact } = this.config;
        if (!bondContact) return;
        const n = this.bodies.length;
        for (const [i, j, closeness] of contacts) {
            if (closeness < 1 / bondContact || sims[i * n + j] <= this.cal.p99) continue;
            this.bond(this.bodies[i].id, this.bodies[j].id);
        }
    }

    /** Puts members back at their offsets from the anchor, moving at the anchor's velocity (rigid molecules). */
    private snapMolecules(): void {
        if (this.molecules.count === 0) return;
        const byId = new Map(this.bodies.map(b => [b.id, b]));
        const targets = this.molecules.rigidTargets(id => byId.get(id)!.position);
        for (const molecule of this.molecules.all()) {
            const anchor = byId.get(molecule.anchor);
            if (!anchor) continue;
            for (const id of molecule.offsets.keys()) {
                const body = byId.get(id);
                const target = targets.get(id);
                if (!body || !target) continue;
                body.position = target as Point3;
                body.velocity = [...anchor.velocity];
            }
        }
    }

    private similarities(): Float32Array {
        const key = this.bodies.map(b => b.id).join(",");
        if (key !== this.simsKey) {
            this.simsKey = key;
            this.sims = similarityMatrix(this.bodies.map(b => b.vector));
        }
        return this.sims;
    }

    /**
     * Soft spheres: overlapping bodies push apart in proportion to how deeply they overlap. Members of one
     * molecule don't collide with each other. Returns the overlapping pairs as [i, j, closeness], where
     * closeness = summed radii / distance (above 1 = overlapping), for bonding.
     */
    private addCollisions(acc: Point[], groups?: readonly number[]): Array<[number, number, number]> {
        const { collisionPush } = this.config;
        const contacts: Array<[number, number, number]> = [];
        for (let i = 0; i < this.bodies.length; i++) {
            for (let j = i + 1; j < this.bodies.length; j++) {
                if (groups && groups[i] >= 0 && groups[i] === groups[j]) continue;
                const a = this.bodies[i], b = this.bodies[j];
                const d = [b.position[0] - a.position[0], b.position[1] - a.position[1], b.position[2] - a.position[2]];
                const dist = Math.hypot(d[0], d[1], d[2]);
                const overlap = a.radius + b.radius - dist;
                if (overlap <= 0) continue;
                contacts.push([i, j, (a.radius + b.radius) / Math.max(dist, 1e-6)]);
                // Coincident bodies: separate along a deterministic axis instead of dividing by zero.
                const unit = dist > 1e-6 ? d.map(v => v / dist) : orbitAxisFor(`${a.word}|${b.word}`);
                for (let k = 0; k < 3; k++) {
                    acc[i][k] -= unit[k] * overlap * collisionPush;
                    acc[j][k] += unit[k] * overlap * collisionPush;
                }
            }
        }
        return contacts;
    }

    /** Spherical (or upright ellipsoid) container: bodies beyond it are pulled back toward the centre. */
    private addBounds(acc: Point[]): void {
        const { boundsRadius, boundsPull } = this.config;
        const stretch = this.config.boundsStretchY ?? 1;
        this.bodies.forEach((b, i) => {
            const [x, y, z] = b.position;
            // Distance in the container's own (sphere) coordinates; the pull follows the ellipsoid's normal.
            const dist = Math.hypot(x, y / stretch, z);
            const excess = dist + b.radius - boundsRadius;
            if (excess <= 0 || dist === 0) return;
            const normal = [x, y / (stretch * stretch), z];
            const length = Math.hypot(...normal);
            for (let k = 0; k < 3; k++) acc[i][k] -= (normal[k] / length) * excess * boundsPull;
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

/** Rodrigues' rotation of `v` by `angle` (radians) about the unit `axis`. */
export function rotateAbout(v: Point3, axis: Point3, angle: number): Point3 {
    const [c, s] = [Math.cos(angle), Math.sin(angle)];
    const [kx, ky, kz] = axis;
    const dotKV = kx * v[0] + ky * v[1] + kz * v[2];
    const cross: Point3 = [ky * v[2] - kz * v[1], kz * v[0] - kx * v[2], kx * v[1] - ky * v[0]];
    return [0, 1, 2].map(i => v[i] * c + cross[i] * s + axis[i] * dotKV * (1 - c)) as Point3;
}

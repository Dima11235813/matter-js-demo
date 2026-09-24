import { Calibration } from "../embeddings/calibration";
import { dot } from "../embeddings/vectorMath";

/**
 * Hint-mode "semantic gravity": distance on screen mirrors distance in embedding space.
 * Dimension-agnostic: positions may be 2D (Matter/p5 view) or 3D (space view).
 *
 * Every pair of words gets a target distance:
 *   - Linked pairs (top 1% of random-pair similarity) are springs whose rest length shrinks as
 *     similarity grows. In each link the more common word is the core idea: it barely moves while
 *     the rarer word gets a tangential push and orbits it.
 *   - Unlinked pairs are weak springs toward a target that grows as similarity falls (calibrated
 *     p99 -> `separation`, p5 and below -> `farTarget`), plus a firm push if they crowd closer than
 *     `separation`. Without these targets unrelated words only needed "enough" room, so their
 *     exact distances carried no meaning (layout fidelity -0.35 in the running app).
 *
 * Why links start at the 99th percentile: at p95, incidental similarities (queen~nurse 0.19,
 * guitar~ocean 0.19) form links that glue every family into one blob.
 *
 * Units are "px per physics step squared", independent of body mass; adapters convert to forces.
 */
export type Point = number[];

export interface OrbitalBody {
    position: Point;
    vector: Float32Array;
    /** Frequency rank (0 = most common). Player words without a rank use Infinity. */
    rank: number;
    /** 3D only: normal of the plane this word orbits its core in (defaults to +z). */
    orbitAxis?: Point;
}

export interface OrbitalLink {
    i: number;
    j: number;
    similarity: number;
    /** 0..1: how far above the link threshold the pair sits. */
    strength: number;
    /** Index of the core (more common) word of the pair. */
    core: number;
}

export interface OrbitalTuning {
    /** Similarity at which link strength reaches 1 (close synonyms). */
    fullStrengthSimilarity: number;
    restNear: number;
    restFar: number;
    spring: number;
    /** Share of the spring pull felt by the core word (satellites do most of the moving). */
    coreShare: number;
    swirl: number;
    /** Unlinked words push apart firmly when closer than this. */
    separation: number;
    repel: number;
    /** Target distance for the least related (<= calibrated p5) unlinked pairs. */
    farTarget: number;
    /** Stiffness of the weak unlinked-pair springs. */
    stress: number;
    centerPull: number;
    /** Push per px of penetration into the keep-out rectangle (2D: the dashboard overlay). */
    keepOutPush: number;
    /** Extra clearance around the keep-out rectangle. */
    keepOutMargin: number;
    maxAccel: number;
}

/** Axis-aligned region words should stay out of, in the same coordinates as positions (x, y). */
export interface KeepOut {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export const defaultOrbitalTuning: OrbitalTuning = {
    fullStrengthSimilarity: 0.6,
    restNear: 105,
    restFar: 230,
    spring: 0.0012,
    coreShare: 0.2,
    swirl: 0.025,
    separation: 380,
    repel: 0.12,
    farTarget: 700,
    stress: 0.00025,
    centerPull: 0.00003,
    keepOutPush: 0.006,
    keepOutMargin: 24,
    maxAccel: 0.45,
};

/** Scales every length (not stiffness) so small viewports keep the same proportions. */
export function scaleTuning(tuning: OrbitalTuning, scale: number): OrbitalTuning {
    return {
        ...tuning,
        restNear: tuning.restNear * scale,
        restFar: tuning.restFar * scale,
        separation: tuning.separation * scale,
        farTarget: tuning.farTarget * scale,
    };
}

/** Row-major n x n cosine matrix; vectors are unit length so a dot product suffices. */
export function similarityMatrix(vectors: readonly Float32Array[]): Float32Array {
    const n = vectors.length;
    const out = new Float32Array(n * n);
    for (let i = 0; i < n; i++) {
        out[i * n + i] = 1;
        for (let j = i + 1; j < n; j++) {
            const s = dot(vectors[i], vectors[j]);
            out[i * n + j] = s;
            out[j * n + i] = s;
        }
    }
    return out;
}

/** Pairs above the 99th-percentile similarity become links. */
export function findLinks(
    bodies: readonly OrbitalBody[],
    cal: Calibration,
    tuning: OrbitalTuning = defaultOrbitalTuning,
    sims: Float32Array = similarityMatrix(bodies.map(b => b.vector))
): OrbitalLink[] {
    const n = bodies.length;
    const threshold = cal.p99;
    const span = Math.max(1e-6, tuning.fullStrengthSimilarity - threshold);
    const links: OrbitalLink[] = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const similarity = sims[i * n + j];
            if (similarity <= threshold) continue;
            const strength = Math.min(1, (similarity - threshold) / span);
            const core = bodies[j].rank < bodies[i].rank ? j : i;
            links.push({ i, j, similarity, strength, core });
        }
    }
    return links;
}

export function restLength(strength: number, tuning: OrbitalTuning = defaultOrbitalTuning): number {
    return tuning.restFar + (tuning.restNear - tuning.restFar) * strength;
}

/** Target distance for an unlinked pair: the less related, the further apart. */
export function unlinkedTarget(similarity: number, cal: Calibration, tuning: OrbitalTuning = defaultOrbitalTuning): number {
    const relatedness = Math.max(0, Math.min(1, (similarity - cal.p5) / Math.max(1e-6, cal.p99 - cal.p5)));
    return tuning.farTarget - (tuning.farTarget - tuning.separation) * relatedness;
}

export function orbitalAccelerations(
    bodies: readonly OrbitalBody[],
    links: readonly OrbitalLink[],
    center: Point,
    cal: Calibration,
    tuning: OrbitalTuning = defaultOrbitalTuning,
    sims: Float32Array = similarityMatrix(bodies.map(b => b.vector)),
    /** Molecule id per body (-1 = free). Members of one molecule exert no forces on each other. */
    groups?: readonly number[],
    keepOut?: KeepOut,
    bounds?: Point
): Point[] {
    const n = bodies.length;
    const bonded = (i: number, j: number) => groups !== undefined && groups[i] >= 0 && groups[i] === groups[j];
    const acc = bodies.map(b => b.position.map((x, k) => (center[k] - x) * tuning.centerPull));
    if (keepOut) acc.forEach((a, i) => addScaled(a, keepOutAcceleration(bodies[i].position, keepOut, tuning, bounds), 1));

    const linked = new Set(links.map(l => l.i * n + l.j));
    for (const link of links) if (!bonded(link.i, link.j)) applyLink(bodies, acc, link, tuning);
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (!linked.has(i * n + j) && !bonded(i, j)) applyUnlinked(bodies, acc, i, j, unlinkedTarget(sims[i * n + j], cal, tuning), tuning);
        }
    }
    return acc.map(a => clamp(a, tuning.maxAccel));
}

/** Room a word needs beside the keep-out rectangle for an exit to count as open space. */
const EXIT_ROOM = 90;

/**
 * Push out of the keep-out rectangle through the nearest edge that leads to open space. With
 * `bounds` ([width, height]), exits that would squeeze a word between the rectangle and a wall
 * are skipped; without it (or if none is open) the nearest edge wins.
 */
export function keepOutAcceleration(
    position: Point,
    rect: KeepOut,
    tuning: OrbitalTuning = defaultOrbitalTuning,
    bounds?: Point,
    /** Half width/height of the word's box, so the whole box stays clear, not just its centre. */
    halfSize: Point = [0, 0]
): Point {
    const out = position.map(() => 0);
    const mx = tuning.keepOutMargin + halfSize[0];
    const my = tuning.keepOutMargin + halfSize[1];
    const [x, y] = position;
    if (x <= rect.left - mx || x >= rect.right + mx || y <= rect.top - my || y >= rect.bottom + my) return out;
    const exits = [
        { depth: x - (rect.left - mx), axis: 0, sign: -1, open: !bounds || rect.left - mx >= EXIT_ROOM },
        { depth: rect.right + mx - x, axis: 0, sign: 1, open: !bounds || bounds[0] - (rect.right + mx) >= EXIT_ROOM },
        { depth: y - (rect.top - my), axis: 1, sign: -1, open: !bounds || rect.top - my >= EXIT_ROOM },
        { depth: rect.bottom + my - y, axis: 1, sign: 1, open: !bounds || bounds[1] - (rect.bottom + my) >= EXIT_ROOM },
    ];
    const candidates = exits.some(e => e.open) ? exits.filter(e => e.open) : exits;
    const nearest = candidates.reduce((best, e) => (e.depth < best.depth ? e : best));
    // Constant floor so a word deep inside still moves decisively, plus a term growing with depth.
    out[nearest.axis] = nearest.sign * (0.05 + nearest.depth * tuning.keepOutPush);
    return out;
}

/** True when a point lies inside the keep-out rectangle plus its margin. */
export function insideKeepOut(position: Point, rect: KeepOut, margin = defaultOrbitalTuning.keepOutMargin): boolean {
    const [x, y] = position;
    return x > rect.left - margin && x < rect.right + margin && y > rect.top - margin && y < rect.bottom + margin;
}

function applyLink(bodies: readonly OrbitalBody[], acc: Point[], link: OrbitalLink, tuning: OrbitalTuning): void {
    const satellite = link.core === link.i ? link.j : link.i;
    const core = link.core;
    const { unit, dist } = direction(bodies[satellite].position, bodies[core].position);
    if (dist < 1) return;
    // Positive when stretched: pulls the satellite toward the core, and the core slightly back.
    // Weak links keep 40% stiffness so loose associations still hold their cluster together.
    const pull = tuning.spring * (0.4 + 0.6 * link.strength) * (dist - restLength(link.strength, tuning));
    addScaled(acc[satellite], unit, pull);
    addScaled(acc[core], unit, -pull * tuning.coreShare);
    // Tangential push turns the spring into an orbit.
    addScaled(acc[satellite], orbitTangent(unit, bodies[satellite].orbitAxis), tuning.swirl * link.strength);
}

function applyUnlinked(bodies: readonly OrbitalBody[], acc: Point[], i: number, j: number, target: number, tuning: OrbitalTuning): void {
    const { unit, dist } = direction(bodies[i].position, bodies[j].position);
    if (dist < 1) return;
    let pull = tuning.stress * (dist - target);
    if (dist < tuning.separation) pull -= tuning.repel * (1 - dist / tuning.separation);
    addScaled(acc[i], unit, pull);
    addScaled(acc[j], unit, -pull);
}

/**
 * Direction of travel around the core. 2D: the perpendicular (counter-clockwise on screen).
 * 3D: axis x radial, so each satellite circles in the plane normal to its own orbit axis.
 */
export function orbitTangent(radial: Point, axis: Point = [0, 0, 1]): Point {
    if (radial.length === 2) return [-radial[1], radial[0]];
    let t = cross(axis, radial);
    if (Math.hypot(...t) < 1e-6) t = cross([1, 0, 0], radial); // axis parallel to radial
    if (Math.hypot(...t) < 1e-6) t = cross([0, 1, 0], radial);
    const len = Math.hypot(...t);
    return t.map(v => v / len);
}

function direction(from: Point, to: Point): { unit: Point; dist: number } {
    const d = to.map((v, k) => v - from[k]);
    const dist = Math.hypot(...d);
    return { unit: dist > 0 ? d.map(v => v / dist) : d, dist };
}

function cross(a: Point, b: Point): Point {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function addScaled(target: Point, v: Point, scale: number): void {
    for (let k = 0; k < target.length; k++) target[k] += v[k] * scale;
}

function clamp(a: Point, max: number): Point {
    const mag = Math.hypot(...a);
    return mag <= max ? a : a.map(v => (v / mag) * max);
}

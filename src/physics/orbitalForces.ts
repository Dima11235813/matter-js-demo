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
 * Target models (see docs/research/embedding-shape.md):
 *   - "calibrated" (default): the percentile mapping above, tuned for readable 2D orbits. Saturates
 *     at both ends, so tightly related boards (days of the week) collapse into a blob.
 *   - "metric": real embedding (chord) distance sqrt(2 - 2 cos) x metricScale. No saturation, but
 *     in 384 dimensions unrelated pairs are all ~sqrt(2) apart, so mixed boards become a shell.
 *   - "adaptive": the board's own chord distances stretched onto [near, far] (min-max per board).
 *   - "rank": pairs spaced by the rank of their dissimilarity within the board (non-metric MDS style).
 *   - "localRank": pairs spaced by how highly each word ranks in the other's neighbour list, so only
 *     mutual near neighbours stay close and everything else is pushed out (cluster separation,
 *     in the spirit of UMAP/t-SNE neighbourhoods).
 *   - "grouped": groups found by average-linkage clustering (merge while mean similarity is above
 *     ~p97, the midpoint of calibrated p95 and p99: at p99 related words like hand/foot/knee stay
 *     apart, at p95 colours and fruits merge);
 *     rank-spaced over a short range inside a group and over a far range between groups, so every
 *     between-group distance exceeds every within-group one and groups read as separate formations
 *     while keeping their internal shape (docs/research/embedding-shape.md section 5).
 * `shapeExponent` < 1 curves the rank mapping so most pairs sit far and only the closest stay near.
 * The three shape models use stress-majorization forces weighted by 1/target^2.
 *
 * Units are "px per physics step squared", independent of body mass; adapters convert to forces.
 */
export type Point = number[];

export type TargetModel = "calibrated" | "metric" | "adaptive" | "rank" | "localRank" | "grouped";

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
    targetModel: TargetModel;
    /** Metric model: world units per unit of embedding distance (random pairs sit ~1.41 x this apart). */
    metricScale: number;
    /** Metric model: stiffness of the stress springs. */
    metricStress: number;
    /** Shape models: orbit swirl on p99 links, as a share of `swirl` (0 = a still, pure-shape layout). */
    metricSwirlShare: number;
    /** Adaptive/rank models: distance for the board's most and least related pairs. */
    shapeNear: number;
    shapeFar: number;
    /** Rank models: target = near + (far - near) * quantile^exponent (1 = even spacing). */
    shapeExponent: number;
    /** Shape models: stress weight = (reference / target)^power; 2 favours local shape, 0 treats all pairs equally. */
    shapeWeightPower: number;
    /** Shape models: unrelated pairs (below p99) closer than this are pushed apart with `repel` (0 = off). */
    shapeSeparation: number;
    /** Grouped model: farthest target inside a group; nearest target between groups (> within, the gap). */
    groupWithinFar: number;
    groupBetweenNear: number;
    /** Grouped model: groups keep merging while their mean similarity exceeds this (0 = calibrated default). */
    groupThreshold: number;
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
    targetModel: "calibrated",
    metricScale: 300,
    metricStress: 0.0008,
    metricSwirlShare: 0.5,
    shapeNear: 110,
    shapeFar: 720,
    shapeExponent: 1,
    shapeWeightPower: 2,
    shapeSeparation: 0,
    groupWithinFar: 380,
    groupBetweenNear: 640,
    groupThreshold: 0,
};

/** Default grouping threshold: midpoint of calibrated p95 and p99 (~p97; 0.18 for MiniLM). */
export function defaultGroupThreshold(cal: Calibration): number {
    return (cal.p95 + cal.p99) / 2;
}

/**
 * Average-linkage agglomerative clustering on similarity: repeatedly merge the two groups with the
 * highest mean pairwise similarity while it exceeds `threshold`. Returns a group id per word.
 * Average linkage avoids the chaining that plain connected components suffer on dense boards.
 */
export function similarityGroups(sims: Float32Array, n: number, threshold: number): number[] {
    let groups = [...Array(n).keys()].map(i => [i]);
    const meanSim = (a: number[], b: number[]) => {
        let sum = 0;
        for (const i of a) for (const j of b) sum += sims[i * n + j];
        return sum / (a.length * b.length);
    };
    for (;;) {
        let best = -Infinity, bi = -1, bj = -1;
        for (let a = 0; a < groups.length; a++) {
            for (let b = a + 1; b < groups.length; b++) {
                const s = meanSim(groups[a], groups[b]);
                if (s > best) { best = s; bi = a; bj = b; }
            }
        }
        if (bi < 0 || best <= threshold) break;
        groups = groups.filter((_, k) => k !== bi && k !== bj).concat([[...groups[bi], ...groups[bj]]]);
    }
    const label = new Array<number>(n).fill(0);
    groups.forEach((g, k) => g.forEach(i => { label[i] = k; }));
    return label;
}

/** Metric model target: the embedding (chord) distance between unit vectors, in world units. */
export function metricTarget(similarity: number, tuning: OrbitalTuning = defaultOrbitalTuning): number {
    return tuning.metricScale * Math.sqrt(Math.max(0, 2 - 2 * similarity));
}

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

/**
 * Nearest-neighbour skeleton: each word joined to its k most similar words on the board (union,
 * no duplicates). Drawn instead of every p99 link in the shape layout, it reveals the structure
 * the layout encodes: ordered words read as a chain, cycles as a loop, families as small stars.
 * Strength is the similarity rescaled to the edges drawn (0 = weakest shown, 1 = strongest).
 */
export function neighborSkeleton(sims: Float32Array, n: number, k = 2): OrbitalLink[] {
    const seen = new Set<number>();
    const edges: OrbitalLink[] = [];
    for (let i = 0; i < n; i++) {
        const nearest = [...Array(n).keys()].filter(j => j !== i).sort((a, b) => sims[i * n + b] - sims[i * n + a]).slice(0, k);
        for (const j of nearest) {
            const [a, b] = i < j ? [i, j] : [j, i];
            if (seen.has(a * n + b)) continue;
            seen.add(a * n + b);
            edges.push({ i: a, j: b, similarity: sims[a * n + b], strength: 0, core: a });
        }
    }
    const values = edges.map(e => e.similarity);
    const [lo, hi] = [Math.min(...values), Math.max(...values)];
    edges.forEach(e => { e.strength = hi > lo ? (e.similarity - lo) / (hi - lo) : 1; });
    return edges;
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

    if (tuning.targetModel !== "calibrated") {
        applyShapeStress(bodies, acc, shapeTargets(sims, n, tuning, defaultGroupThreshold(cal)), sims, cal.p99, tuning, bonded);
        for (const link of links) if (!bonded(link.i, link.j)) applySwirl(bodies, acc, link, tuning.swirl * tuning.metricSwirlShare);
        return acc.map(a => clamp(a, tuning.maxAccel));
    }

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

const targetCache = new WeakMap<Float32Array, { key: string; targets: Float32Array }>();

/**
 * Pair targets for the shape models, cached per similarity matrix (callers cache that matrix per
 * word set, so this runs once per board change, not per step).
 */
export function shapeTargets(sims: Float32Array, n: number, tuning: OrbitalTuning = defaultOrbitalTuning, groupThreshold = 0.18): Float32Array {
    const key = `${tuning.targetModel}|${tuning.metricScale}|${tuning.shapeNear}|${tuning.shapeFar}|${tuning.shapeExponent}|${tuning.groupWithinFar}|${tuning.groupBetweenNear}|${tuning.groupThreshold || groupThreshold}`;
    const cached = targetCache.get(sims);
    if (cached && cached.key === key) return cached.targets;
    const targets = new Float32Array(n * n);
    const chord = (s: number) => Math.sqrt(Math.max(0, 2 - 2 * s));
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);
    const set = (i: number, j: number, t: number) => { targets[i * n + j] = t; targets[j * n + i] = t; };
    const { shapeNear: near, shapeFar: far, shapeExponent: exponent } = tuning;
    const fromQuantile = (q: number) => near + (far - near) * Math.pow(Math.min(1, Math.max(0, q)), exponent);
    if (tuning.targetModel === "metric") {
        for (const [i, j] of pairs) set(i, j, metricTarget(sims[i * n + j], tuning));
    } else if (tuning.targetModel === "adaptive") {
        const d = pairs.map(([i, j]) => chord(sims[i * n + j]));
        const [lo, hi] = [Math.min(...d), Math.max(...d)];
        pairs.forEach(([i, j], k) => set(i, j, near + (far - near) * (hi > lo ? (d[k] - lo) / (hi - lo) : 0.5)));
    } else if (tuning.targetModel === "grouped") {
        const label = similarityGroups(sims, n, tuning.groupThreshold || groupThreshold);
        const within = pairs.filter(([i, j]) => label[i] === label[j]);
        const between = pairs.filter(([i, j]) => label[i] !== label[j]);
        const spread = (list: Array<[number, number]>, lo: number, hi: number) => {
            const order = list.map((p, k) => k).sort((a, b) => sims[list[b][0] * n + list[b][1]] - sims[list[a][0] * n + list[a][1]]);
            order.forEach((k, rank) => set(list[k][0], list[k][1], lo + (hi - lo) * (order.length > 1 ? rank / (order.length - 1) : 0.5)));
        };
        spread(within, near, tuning.groupWithinFar);
        spread(between, tuning.groupBetweenNear, far);
    } else if (tuning.targetModel === "localRank") {
        // rankOf[i][j]: position of j in i's neighbour list (0 = i's most similar word).
        const rankOf = [...Array(n).keys()].map(i => {
            const order = [...Array(n).keys()].filter(j => j !== i).sort((a, b) => sims[i * n + b] - sims[i * n + a]);
            const r = new Array<number>(n).fill(0);
            order.forEach((j, k) => { r[j] = k; });
            return r;
        });
        for (const [i, j] of pairs) set(i, j, fromQuantile(n > 2 ? Math.min(rankOf[i][j], rankOf[j][i]) / (n - 2) : 0.5));
    } else {
        const order = pairs.map((p, k) => k).sort((a, b) => sims[pairs[b][0] * n + pairs[b][1]] - sims[pairs[a][0] * n + pairs[a][1]]);
        order.forEach((k, rank) => set(pairs[k][0], pairs[k][1], fromQuantile(order.length > 1 ? rank / (order.length - 1) : 0.5)));
    }
    targetCache.set(sims, { key, targets });
    return targets;
}

/**
 * Stress majorization-style forces (Gansner, Koren & North 2004): every pair is a spring toward its
 * target, weighted by 1/target^2 (normalized to the mid-range target) so near neighbours set the
 * local shape and far pairs only set the overall scale.
 */
function applyShapeStress(
    bodies: readonly OrbitalBody[],
    acc: Point[],
    targets: Float32Array,
    sims: Float32Array,
    linkThreshold: number,
    tuning: OrbitalTuning,
    bonded: (i: number, j: number) => boolean
): void {
    const n = bodies.length;
    const reference = tuning.targetModel === "metric" ? tuning.metricScale * Math.SQRT2 : (tuning.shapeNear + tuning.shapeFar) / 2;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (bonded(i, j)) continue;
            const { unit, dist } = direction(bodies[i].position, bodies[j].position);
            if (dist < 1) continue;
            const target = Math.max(1, targets[i * n + j]);
            const weight = Math.min(9, (reference / target) ** tuning.shapeWeightPower);
            let pull = tuning.metricStress * weight * (dist - target);
            // Firm separation between unrelated words, so distinct groups read as distinct in 3D.
            if (tuning.shapeSeparation > 0 && dist < tuning.shapeSeparation && sims[i * n + j] <= linkThreshold) {
                pull -= tuning.repel * (1 - dist / tuning.shapeSeparation);
            }
            addScaled(acc[i], unit, pull);
            addScaled(acc[j], unit, -pull);
        }
    }
}

/** Tangential push on a link's satellite around its core (orbits without changing the target). */
function applySwirl(bodies: readonly OrbitalBody[], acc: Point[], link: OrbitalLink, amount: number): void {
    if (amount === 0) return;
    const satellite = link.core === link.i ? link.j : link.i;
    const { unit, dist } = direction(bodies[satellite].position, bodies[link.core].position);
    if (dist < 1) return;
    addScaled(acc[satellite], orbitTangent(unit, bodies[satellite].orbitAxis), amount * link.strength);
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

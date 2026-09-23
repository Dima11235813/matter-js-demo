import { Calibration } from "../embeddings/calibration";
import { dot } from "../embeddings/vectorMath";

/**
 * Hint-mode "semantic gravity": screen distance mirrors embedding distance.
 *
 * Related words (top 1% of random-pair similarity) are joined by springs whose rest length
 * shrinks as similarity grows, so synonyms settle close and loose associations hover further out.
 * In each linked pair the more common word is treated as the core idea: it barely moves, while
 * the rarer word gets a tangential push and orbits it. Unlinked words only push each other apart
 * until they are `separation` px away, so separate ideas form separate clusters. A weak pull
 * toward the centre keeps clusters off the walls.
 *
 * Why the 99th percentile: at p95, incidental similarities (queen~nurse 0.19, guitar~ocean 0.19)
 * form links that glue every family into one blob; at p99 only within-family pairs remain.
 *
 * Everything here is in "px per physics step squared" so tuning is independent of body mass;
 * the physics adapter converts to Matter forces (F = a * mass / deltaTime^2).
 */
export interface OrbitalBody {
    x: number;
    y: number;
    vector: Float32Array;
    /** Frequency rank (0 = most common). Player words without a rank use Infinity. */
    rank: number;
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

export interface Acceleration {
    ax: number;
    ay: number;
}

export interface OrbitalTuning {
    /** Similarity at which strength reaches 1 (close synonyms). */
    fullStrengthSimilarity: number;
    restNear: number;
    restFar: number;
    spring: number;
    /** Share of the spring pull felt by the core word (satellites do most of the moving). */
    coreShare: number;
    swirl: number;
    /** Unlinked words push apart until at least this far from each other. */
    separation: number;
    repel: number;
    centerPull: number;
    /** Soft keep-out band at the top of the canvas (the dashboard overlay sits there). */
    topMargin: number;
    topPush: number;
    maxAccel: number;
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
    centerPull: 0.00003,
    topMargin: 240,
    topPush: 0.003,
    maxAccel: 0.45,
};

/** Pairs above the 99th-percentile similarity become links. */
export function findLinks(bodies: readonly OrbitalBody[], cal: Calibration, tuning: OrbitalTuning = defaultOrbitalTuning): OrbitalLink[] {
    const threshold = cal.p99;
    const span = Math.max(1e-6, tuning.fullStrengthSimilarity - threshold);
    const links: OrbitalLink[] = [];
    for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
            const similarity = dot(bodies[i].vector, bodies[j].vector);
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

export function orbitalAccelerations(
    bodies: readonly OrbitalBody[],
    links: readonly OrbitalLink[],
    center: { x: number; y: number },
    tuning: OrbitalTuning = defaultOrbitalTuning
): Acceleration[] {
    const acc: Acceleration[] = bodies.map(b => ({
        ax: (center.x - b.x) * tuning.centerPull,
        ay: (center.y - b.y) * tuning.centerPull + Math.max(0, tuning.topMargin - b.y) * tuning.topPush,
    }));
    const linked = new Set(links.map(l => pairKey(l.i, l.j)));

    for (const link of links) applyLink(bodies, acc, link, tuning);
    for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
            if (!linked.has(pairKey(i, j))) applyRepulsion(bodies, acc, i, j, tuning);
        }
    }
    return acc.map(a => clamp(a, tuning.maxAccel));
}

function applyLink(bodies: readonly OrbitalBody[], acc: Acceleration[], link: OrbitalLink, tuning: OrbitalTuning): void {
    const satellite = link.core === link.i ? link.j : link.i;
    const core = link.core;
    const dx = bodies[core].x - bodies[satellite].x;
    const dy = bodies[core].y - bodies[satellite].y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const ux = dx / dist;
    const uy = dy / dist;
    // Positive when stretched: pulls the satellite toward the core, and the core slightly back.
    // Weak links keep 40% stiffness so loose associations still hold their cluster together.
    const pull = tuning.spring * (0.4 + 0.6 * link.strength) * (dist - restLength(link.strength, tuning));
    acc[satellite].ax += ux * pull;
    acc[satellite].ay += uy * pull;
    acc[core].ax -= ux * pull * tuning.coreShare;
    acc[core].ay -= uy * pull * tuning.coreShare;
    // Tangential push (perpendicular to the core direction) turns the spring into an orbit.
    const swirl = tuning.swirl * link.strength;
    acc[satellite].ax += -uy * swirl;
    acc[satellite].ay += ux * swirl;
}

function applyRepulsion(bodies: readonly OrbitalBody[], acc: Acceleration[], i: number, j: number, tuning: OrbitalTuning): void {
    const dx = bodies[j].x - bodies[i].x;
    const dy = bodies[j].y - bodies[i].y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1 || dist >= tuning.separation) return;
    const push = tuning.repel * (1 - dist / tuning.separation);
    acc[i].ax -= (dx / dist) * push;
    acc[i].ay -= (dy / dist) * push;
    acc[j].ax += (dx / dist) * push;
    acc[j].ay += (dy / dist) * push;
}

function pairKey(i: number, j: number): number {
    return i < j ? i * 100003 + j : j * 100003 + i;
}

function clamp(a: Acceleration, max: number): Acceleration {
    const mag = Math.hypot(a.ax, a.ay);
    return mag <= max ? a : { ax: (a.ax / mag) * max, ay: (a.ay / mag) * max };
}

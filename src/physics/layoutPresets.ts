import { defaultOrbitalTuning, scaleTuning } from "./orbitalForces";
import { defaultSpaceConfig, SpaceConfig } from "./spaceSimulation";

/**
 * 3D layout presets (docs/research/embedding-shape.md):
 *   - "shape" (default): grouped targets. Words are clustered by similarity; inside a group they are
 *     rank-spaced over a short range (keeping rings and lines), between groups over a far range, so
 *     groups read as separate formations. Player feedback on the plain rank model was "still a ball
 *     of stuff": it had the best fidelity but the weakest group separation (silhouette 0.45 vs 0.60
 *     for orbits). Grouped, unweighted: silhouette 0.63 with fidelity -0.85 (rank -0.86).
 *   - "orbits": the calibrated 2D model lifted into 3D (Phase 2), kept for comparison.
 * The shape preset gets a larger container: its targets reach 1,300 units, and the bounds only
 * catch strays, they must not press the layout into a ball.
 */
export type Layout3d = "shape" | "orbits";

/**
 * Layout lengths for a screen (Epic 5 · Task 5.7.3): the 3D lengths are tuned for a desktop (900 px or
 * more on the short side). A phone shows ~350 px across, so at full lengths the camera backed off until
 * labels were 6 px tall. Like 2D's viewport scale, lengths shrink with the screen (labels keep their size,
 * and collisions keep them apart), down to `LAYOUT_3D_MIN_SCALE`.
 */
export const LAYOUT_3D_REFERENCE = 900;
export const LAYOUT_3D_MIN_SCALE = 0.7;

/** Height over width of the area the layout is seen in (below the docked dashboard). */
export function viewAspect(width: number, height: number): number {
    return height / Math.max(1, width);
}

export function layoutScale3d(width: number, height: number): number {
    return Math.max(LAYOUT_3D_MIN_SCALE, Math.min(1, Math.min(width, height) / LAYOUT_3D_REFERENCE));
}

/**
 * Portrait screens (taller than 1.2 x their width) get an upright container sized to the layout, not
 * the roomy stray-catcher: `PORTRAIT_RADIUS` of the shape layout's far target across, `stretch` (the
 * screen's aspect, at most PORTRAIT_MAX_STRETCH) times that tall. A round layout used ~250 of a phone's
 * 839 px of height while its labels overlapped side by side.
 */
export const PORTRAIT_RADIUS = 0.26;
export const PORTRAIT_MAX_STRETCH = 2.2;

export function layout3dConfig(layout: Layout3d, scale = 1, aspect = 1): SpaceConfig {
    const config = baseLayout3dConfig(layout);
    const portrait = aspect > 1.2;
    if (scale === 1 && !portrait) return config;
    const t = config.tuning;
    const container = portrait
        ? { boundsRadius: Math.min(config.boundsRadius, PORTRAIT_RADIUS * t.shapeFar) * scale, boundsStretchY: Math.min(aspect, PORTRAIT_MAX_STRETCH) }
        : { boundsRadius: config.boundsRadius * scale };
    return {
        ...config,
        ...container,
        tuning: {
            ...scaleTuning(t, scale),
            shapeNear: t.shapeNear * scale,
            shapeFar: t.shapeFar * scale,
            groupWithinFar: t.groupWithinFar * scale,
            groupBetweenNear: t.groupBetweenNear * scale,
            metricScale: t.metricScale * scale,
        },
    };
}

function baseLayout3dConfig(layout: Layout3d): SpaceConfig {
    if (layout === "orbits") return defaultSpaceConfig;
    return {
        ...defaultSpaceConfig,
        boundsRadius: 2400,
        // Roomy spacing: within-group targets start at 170 so long labels in tight groups (the days
        // of the week) do not stack; between-group targets start well beyond the largest within one.
        tuning: {
            ...defaultOrbitalTuning,
            targetModel: "grouped",
            shapeWeightPower: 0,
            shapeNear: 170,
            groupWithinFar: 480,
            groupBetweenNear: 780,
            shapeFar: 1300,
        },
    };
}

const STORAGE_KEY = "lexical-fountain.layout3d";

export function loadLayout3d(): Layout3d {
    try {
        return window.localStorage.getItem(STORAGE_KEY) === "orbits" ? "orbits" : "shape";
    } catch {
        return "shape";
    }
}

export function saveLayout3d(layout: Layout3d): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, layout);
    } catch {
        /* storage blocked: the choice still applies for this session */
    }
}

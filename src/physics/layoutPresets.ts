import { defaultOrbitalTuning } from "./orbitalForces";
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

export function layout3dConfig(layout: Layout3d): SpaceConfig {
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

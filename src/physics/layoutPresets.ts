import { defaultOrbitalTuning } from "./orbitalForces";
import { defaultSpaceConfig, SpaceConfig } from "./spaceSimulation";

/**
 * 3D layout presets (docs/research/embedding-shape.md):
 *   - "shape" (default): rank-based targets, so the settled configuration follows the board's own
 *     embedding distances (lines for ordered words, rings for cycles, sheets for families) instead
 *     of an evenly spaced sphere. Best fidelity and neighbourhood recall on every board tested,
 *     and the most stable when a word joins.
 *   - "orbits": the calibrated 2D model lifted into 3D (Phase 2), kept for comparison.
 * The shape preset gets a larger container: its targets reach 720 units, and the bounds only
 * catch strays, they must not press the layout into a ball.
 */
export type Layout3d = "shape" | "orbits";

export function layout3dConfig(layout: Layout3d): SpaceConfig {
    if (layout === "orbits") return defaultSpaceConfig;
    return {
        ...defaultSpaceConfig,
        boundsRadius: 1400,
        tuning: { ...defaultOrbitalTuning, targetModel: "rank" },
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

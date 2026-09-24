import { Point } from "./orbitalForces";

/**
 * Word molecules: in hint mode, when two related words (a p99 link) are pulled into contact they
 * bond into one rigid unit. The word is the atom (whatever its token count); molecules are the
 * first step of build-up toward phrases.
 *
 * A molecule keeps fixed offsets from its anchor, the most common member (the core idea). Rigid
 * behaviour is produced by the physics adapter: members skip forces between each other, share one
 * averaged acceleration, never collide with each other, and are re-snapped to their offsets.
 * Bodies are identified by numeric id (Matter body id in 2D).
 */
export interface Molecule {
    id: number;
    anchor: number;
    /** Member id -> offset from the anchor's position (anchor maps to zeros). */
    offsets: Map<number, Point>;
    /** Bonds in formation order, for drawing. */
    bonds: Array<[number, number]>;
}

export const DEFAULT_MAX_MOLECULE_SIZE = 5;

/** Gap left between member boxes when overlapping offsets are relaxed apart. */
const MEMBER_GAP = 4;

/**
 * Separates overlapping member boxes (axis-aligned, 2D) so a molecule never freezes one word on
 * top of another. Rigid snapping bypasses collision resolution, so two molecules can already
 * overlap when they touch and merge. The anchor stays fixed; other members move out along the
 * axis of least overlap. A few passes resolve chains of overlaps.
 */
export function relaxOffsets(offsets: Map<number, Point>, anchor: number, halfSizeOf: (id: number) => Point, passes = 8): void {
    const ids = [...offsets.keys()];
    for (let pass = 0; pass < passes; pass++) {
        let moved = false;
        for (let a = 0; a < ids.length; a++) {
            for (let b = a + 1; b < ids.length; b++) {
                const [ia, ib] = [ids[a], ids[b]];
                const pa = offsets.get(ia)!, pb = offsets.get(ib)!;
                const [ha, hb] = [halfSizeOf(ia), halfSizeOf(ib)];
                const overlapX = ha[0] + hb[0] + MEMBER_GAP - Math.abs(pb[0] - pa[0]);
                const overlapY = ha[1] + hb[1] + MEMBER_GAP - Math.abs(pb[1] - pa[1]);
                if (overlapX <= 0 || overlapY <= 0) continue;
                const axis = overlapX < overlapY ? 0 : 1;
                const depth = axis === 0 ? overlapX : overlapY;
                const direction = pb[axis] >= pa[axis] ? 1 : -1;
                // The anchor never moves; otherwise both members give way equally.
                const shareA = ia === anchor ? 0 : ib === anchor ? 1 : 0.5;
                pa[axis] -= direction * depth * shareA;
                pb[axis] += direction * depth * (1 - shareA);
                moved = true;
            }
        }
        if (!moved) return;
    }
}

export class MoleculeGraph {
    private readonly molecules = new Map<number, Molecule>();
    private readonly memberOf = new Map<number, number>();
    private nextId = 1;

    constructor(private readonly maxSize = DEFAULT_MAX_MOLECULE_SIZE) {}

    get count(): number {
        return this.molecules.size;
    }

    all(): Molecule[] {
        return [...this.molecules.values()];
    }

    moleculeOf(id: number): Molecule | undefined {
        const moleculeId = this.memberOf.get(id);
        return moleculeId === undefined ? undefined : this.molecules.get(moleculeId);
    }

    sameMolecule(a: number, b: number): boolean {
        const ma = this.memberOf.get(a);
        return ma !== undefined && ma === this.memberOf.get(b);
    }

    /**
     * Bonds two bodies, merging their molecules. Offsets are captured from current positions, so
     * the molecule freezes the arrangement at the moment of contact. Returns false when already
     * bonded or when the merged molecule would exceed the size cap.
     */
    bond(
        a: number,
        b: number,
        positionOf: (id: number) => Point,
        rankOf: (id: number) => number,
        halfSizeOf?: (id: number) => Point
    ): boolean {
        if (a === b || this.sameMolecule(a, b)) return false;
        const members = new Set([...this.membersOrSelf(a), ...this.membersOrSelf(b)]);
        if (members.size > this.maxSize) return false;

        const bonds = [...(this.moleculeOf(a)?.bonds ?? []), ...(this.moleculeOf(b)?.bonds ?? []), [a, b] as [number, number]];
        this.dissolveMoleculeOf(a);
        this.dissolveMoleculeOf(b);

        const anchor = [...members].reduce((best, id) => (rankOf(id) < rankOf(best) ? id : best));
        const origin = positionOf(anchor);
        const offsets = new Map<number, Point>();
        for (const id of members) offsets.set(id, positionOf(id).map((v, k) => v - origin[k]));
        if (halfSizeOf) relaxOffsets(offsets, anchor, halfSizeOf);

        const molecule: Molecule = { id: this.nextId++, anchor, offsets, bonds };
        this.molecules.set(molecule.id, molecule);
        for (const id of members) this.memberOf.set(id, molecule.id);
        return true;
    }

    /** Drops a body (removed from the world). Molecules shrinking below two members dissolve. */
    remove(id: number): void {
        const molecule = this.moleculeOf(id);
        if (!molecule) return;
        this.memberOf.delete(id);
        molecule.bonds = molecule.bonds.filter(([a, b]) => a !== id && b !== id);
        molecule.offsets.delete(id);
        if (molecule.offsets.size < 2) {
            this.dissolveMoleculeOf([...molecule.offsets.keys()][0]);
            return;
        }
        if (id === molecule.anchor) {
            // Re-anchor on the first remaining member; shift offsets so positions are unchanged.
            const [nextAnchor, shift] = [...molecule.offsets.entries()][0];
            molecule.anchor = nextAnchor;
            for (const [member, offset] of molecule.offsets) molecule.offsets.set(member, offset.map((v, k) => v - shift[k]));
        }
    }

    /** Removes every member not in `alive` (bodies that left the world). */
    prune(alive: ReadonlySet<number>): void {
        for (const id of [...this.memberOf.keys()]) if (!alive.has(id)) this.remove(id);
    }

    clear(): void {
        this.molecules.clear();
        this.memberOf.clear();
    }

    /**
     * Where every member should be for the molecule to stay rigid. `reference` (e.g. a word being
     * dragged) pins the molecule to that member instead of the anchor.
     */
    rigidTargets(positionOf: (id: number) => Point, reference?: number): Map<number, Point> {
        const targets = new Map<number, Point>();
        for (const molecule of this.molecules.values()) {
            const pinned = reference !== undefined && molecule.offsets.has(reference) ? reference : molecule.anchor;
            const pinnedOffset = molecule.offsets.get(pinned)!;
            const origin = positionOf(pinned).map((v, k) => v - pinnedOffset[k]);
            for (const [member, offset] of molecule.offsets) {
                if (member !== pinned) targets.set(member, origin.map((v, k) => v + offset[k]));
            }
        }
        return targets;
    }

    /**
     * Shift that keeps a whole molecule inside [0, bounds] given each member's target position and
     * half-size. Rigid snapping must never push a member through a wall (it would be deleted).
     */
    static containmentShift(members: ReadonlyArray<{ position: Point; halfSize: Point }>, bounds: Point): Point {
        return bounds.map((limit, k) => {
            const low = Math.min(...members.map(m => m.position[k] - m.halfSize[k]));
            const high = Math.max(...members.map(m => m.position[k] + m.halfSize[k]));
            if (high - low >= limit) return limit / 2 - (low + high) / 2; // wider than the world: centre it
            if (low < 0) return -low;
            if (high > limit) return limit - high;
            return 0;
        });
    }

    /** Replaces each member's acceleration with its molecule's mass-weighted mean. */
    shareAccelerations(ids: readonly number[], accelerations: Point[], masses: readonly number[]): Point[] {
        const indexOf = new Map(ids.map((id, i) => [id, i]));
        const out = accelerations.map(a => a.slice());
        for (const molecule of this.molecules.values()) {
            const indices = [...molecule.offsets.keys()].map(id => indexOf.get(id)).filter((i): i is number => i !== undefined);
            if (indices.length === 0) continue;
            const totalMass = indices.reduce((sum, i) => sum + masses[i], 0);
            const mean = accelerations[indices[0]].map((_, k) =>
                indices.reduce((sum, i) => sum + accelerations[i][k] * masses[i], 0) / totalMass);
            for (const i of indices) out[i] = mean.slice();
        }
        return out;
    }

    /** Group index per body for the force model: -1 for free words, else a molecule id. */
    groups(ids: readonly number[]): number[] {
        return ids.map(id => this.memberOf.get(id) ?? -1);
    }

    private membersOrSelf(id: number): number[] {
        const molecule = this.moleculeOf(id);
        return molecule ? [...molecule.offsets.keys()] : [id];
    }

    private dissolveMoleculeOf(id: number | undefined): void {
        if (id === undefined) return;
        const molecule = this.moleculeOf(id);
        if (!molecule) return;
        for (const member of molecule.offsets.keys()) this.memberOf.delete(member);
        this.molecules.delete(molecule.id);
    }
}

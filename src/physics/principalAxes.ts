/**
 * Principal axes of a 3D point cloud (PCA of positions), used to pick the most informative camera
 * view: looking along the axis of least variance shows the two largest axes face-on, so a line of
 * ordered words or a ring of cyclic words is seen in full rather than end-on
 * (docs/research/cross-dimension-continuity.md E4, docs/research/embedding-shape.md).
 */
export type Vec3 = [number, number, number];

export interface PrincipalAxes {
    centroid: Vec3;
    /** Unit axes, largest variance first. */
    axes: [Vec3, Vec3, Vec3];
    /** Variance along each axis, descending. */
    variances: [number, number, number];
}

export function principalAxes(points: ReadonlyArray<readonly number[]>): PrincipalAxes {
    const n = Math.max(1, points.length);
    const centroid = [0, 1, 2].map(k => points.reduce((s, p) => s + p[k], 0) / n) as Vec3;
    const cov = [0, 1, 2].map(a => [0, 1, 2].map(b =>
        points.reduce((s, p) => s + (p[a] - centroid[a]) * (p[b] - centroid[b]), 0) / n));
    const { values, vectors } = jacobi3(cov);
    const order = [0, 1, 2].sort((i, j) => values[j] - values[i]);
    return {
        centroid,
        axes: order.map(i => [vectors[0][i], vectors[1][i], vectors[2][i]] as Vec3) as [Vec3, Vec3, Vec3],
        variances: order.map(i => Math.max(0, values[i])) as [number, number, number],
    };
}

/**
 * Camera direction (from target toward the camera) that shows the layout's two largest axes:
 * the least-variance axis, flipped to stay on the viewer's current side, and kept away from the
 * poles because the orbit camera keeps world-up = +y.
 */
export function bestViewDirection(axes: PrincipalAxes, current: Vec3): Vec3 {
    let d = axes.axes[2];
    if (d[0] * current[0] + d[1] * current[1] + d[2] * current[2] < 0) d = [-d[0], -d[1], -d[2]];
    const maxElevation = 0.8;
    if (Math.abs(d[1]) > maxElevation) {
        // Lean toward the axis's own horizontal heading, or the camera's when the axis is vertical.
        let [hx, hz] = [d[0], d[2]];
        if (Math.hypot(hx, hz) < 1e-6) [hx, hz] = Math.hypot(current[0], current[2]) > 1e-6 ? [current[0], current[2]] : [0, 1];
        const scale = Math.sqrt(1 - maxElevation ** 2) / Math.hypot(hx, hz);
        d = [hx * scale, Math.sign(d[1]) * maxElevation, hz * scale];
    }
    return d;
}

/** Cyclic Jacobi eigen-decomposition of a symmetric 3x3 matrix. Columns of `vectors` are eigenvectors. */
function jacobi3(input: number[][]): { values: number[]; vectors: number[][] } {
    const a = input.map(r => r.slice());
    const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 50; sweep++) {
        const off = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2;
        if (off < 1e-20) break;
        for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
            if (Math.abs(a[p][q]) < 1e-18) continue;
            const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
            const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
            const c = 1 / Math.sqrt(t * t + 1);
            const s = t * c;
            for (let k = 0; k < 3; k++) {
                const [akp, akq] = [a[k][p], a[k][q]];
                a[k][p] = c * akp - s * akq;
                a[k][q] = s * akp + c * akq;
            }
            for (let k = 0; k < 3; k++) {
                const [apk, aqk] = [a[p][k], a[q][k]];
                a[p][k] = c * apk - s * aqk;
                a[q][k] = s * apk + c * aqk;
            }
            for (let k = 0; k < 3; k++) {
                const [vkp, vkq] = [v[k][p], v[k][q]];
                v[k][p] = c * vkp - s * vkq;
                v[k][q] = s * vkp + c * vkq;
            }
        }
    }
    return { values: [a[0][0], a[1][1], a[2][2]], vectors: v };
}

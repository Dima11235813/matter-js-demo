/**
 * Small, dependency-free linear algebra for the cross-dimension research experiments.
 * Boards are tiny (n <= ~40 words), so exact O(n^3) methods are fine.
 */
export type Matrix = number[][];

/** Jacobi eigen-decomposition of a symmetric matrix; eigenpairs sorted by eigenvalue, descending. */
export function symmetricEigen(input: Matrix): { values: number[]; vectors: Matrix } {
    const n = input.length;
    const a = input.map(row => row.slice());
    const v = a.map((_, i) => a.map((__, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 100; sweep++) {
        let off = 0;
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
        if (off < 1e-18) break;
        for (let p = 0; p < n; p++) {
            for (let q = p + 1; q < n; q++) {
                if (Math.abs(a[p][q]) < 1e-15) continue;
                const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
                const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
                const c = 1 / Math.sqrt(t * t + 1);
                const s = t * c;
                for (let k = 0; k < n; k++) {
                    const akp = a[k][p], akq = a[k][q];
                    a[k][p] = c * akp - s * akq;
                    a[k][q] = s * akp + c * akq;
                }
                for (let k = 0; k < n; k++) {
                    const apk = a[p][k], aqk = a[q][k];
                    a[p][k] = c * apk - s * aqk;
                    a[q][k] = s * apk + c * aqk;
                }
                for (let k = 0; k < n; k++) {
                    const vkp = v[k][p], vkq = v[k][q];
                    v[k][p] = c * vkp - s * vkq;
                    v[k][q] = s * vkp + c * vkq;
                }
            }
        }
    }
    const order = a.map((row, i) => i).sort((i, j) => a[j][j] - a[i][i]);
    return { values: order.map(i => a[i][i]), vectors: order.map(i => v.map(row => row[i])) };
}

/** Double-centres a squared-distance matrix into a Gram matrix: B = -1/2 J D^2 J. */
export function doubleCenter(squared: Matrix): Matrix {
    const n = squared.length;
    const rowMean = squared.map(r => r.reduce((a, b) => a + b, 0) / n);
    const total = rowMean.reduce((a, b) => a + b, 0) / n;
    return squared.map((r, i) => r.map((d, j) => -0.5 * (d - rowMean[i] - rowMean[j] + total)));
}

/**
 * Coordinates from a Gram matrix: the top-k eigenvectors scaled by sqrt(eigenvalue). Applied to
 * centred embeddings this is PCA; applied to double-centred distances it is classical MDS
 * (Torgerson 1952) - the same computation, which is why the report treats them together.
 */
export function gramCoordinates(gram: Matrix, k: number): { coords: Matrix; explained: number[] } {
    const { values, vectors } = symmetricEigen(gram);
    const positiveTotal = values.filter(v => v > 0).reduce((a, b) => a + b, 0);
    const coords = gram.map((_, i) => vectors.slice(0, k).map((vec, c) => vec[i] * Math.sqrt(Math.max(0, values[c]))));
    return { coords, explained: values.slice(0, k).map(v => Math.max(0, v) / positiveTotal) };
}

/** PCA scores of vectors centred on their own (board) mean, via the n x n Gram matrix. */
export function pcaScores(vectors: readonly Float32Array[], k: number): { coords: Matrix; explained: number[] } {
    const n = vectors.length;
    const dim = vectors[0].length;
    const mean = new Float64Array(dim);
    vectors.forEach(v => v.forEach((x, d) => { mean[d] += x / n; }));
    const centred = vectors.map(v => Array.from(v, (x, d) => x - mean[d]));
    const gram = centred.map(a => centred.map(b => a.reduce((s, x, d) => s + x * b[d], 0)));
    return gramCoordinates(gram, k);
}

/** Classical MDS of a distance matrix into k dimensions. */
export function classicalMds(distances: Matrix, k: number): Matrix {
    return gramCoordinates(doubleCenter(distances.map(r => r.map(d => d * d))), k).coords;
}

/**
 * 2D orthogonal Procrustes with uniform scale, rotation only (no reflection, so the player's
 * layout is never mirrored). Closed form: theta = atan2(sum(a x b), sum(a . b)).
 * Returns `a` aligned onto `b` and the Procrustes disparity in [0, 1] (0 = identical shape).
 */
export function procrustes2d(a: Matrix, b: Matrix): { aligned: Matrix; disparity: number } {
    const n = a.length;
    const mean = (m: Matrix) => [0, 1].map(k => m.reduce((s, p) => s + p[k], 0) / n);
    const [ma, mb] = [mean(a), mean(b)];
    const ca = a.map(p => [p[0] - ma[0], p[1] - ma[1]]);
    const cb = b.map(p => [p[0] - mb[0], p[1] - mb[1]]);
    let dotSum = 0, crossSum = 0, aa = 0, bb = 0;
    for (let i = 0; i < n; i++) {
        dotSum += ca[i][0] * cb[i][0] + ca[i][1] * cb[i][1];
        crossSum += ca[i][0] * cb[i][1] - ca[i][1] * cb[i][0];
        aa += ca[i][0] ** 2 + ca[i][1] ** 2;
        bb += cb[i][0] ** 2 + cb[i][1] ** 2;
    }
    const theta = Math.atan2(crossSum, dotSum);
    const [cos, sin] = [Math.cos(theta), Math.sin(theta)];
    const scale = aa === 0 ? 0 : (dotSum * cos + crossSum * sin) / aa;
    const aligned = ca.map(p => [scale * (p[0] * cos - p[1] * sin) + mb[0], scale * (p[0] * sin + p[1] * cos) + mb[1]]);
    let residual = 0;
    for (let i = 0; i < n; i++) residual += (aligned[i][0] - b[i][0]) ** 2 + (aligned[i][1] - b[i][1]) ** 2;
    return { aligned, disparity: bb === 0 ? 0 : residual / bb };
}

/** Rotation matrix for a camera orbit: yaw about y, then pitch about x (degrees). */
export function orbitRotation(yawDeg: number, pitchDeg: number): Matrix {
    const [y, p] = [yawDeg, pitchDeg].map(d => (d * Math.PI) / 180);
    const ry = [[Math.cos(y), 0, Math.sin(y)], [0, 1, 0], [-Math.sin(y), 0, Math.cos(y)]];
    const rx = [[1, 0, 0], [0, Math.cos(p), -Math.sin(p)], [0, Math.sin(p), Math.cos(p)]];
    return rx.map(row => [0, 1, 2].map(j => row.reduce((s, x, k) => s + x * ry[k][j], 0)));
}

export function applyMatrix(m: Matrix, p: number[]): number[] {
    return m.map(row => row.reduce((s, x, k) => s + x * p[k], 0));
}

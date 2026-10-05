/**
 * Color hint mode (Epic 5 · Feature 5.17): similar meanings get similar colors, so color becomes a
 * second hint about relationships on top of distance. Pure and deterministic; shared by the 2D and
 * 3D worlds so colors survive the hand-off. Measured in docs/research/semantic-colors.md.
 *
 * Projection hues, separated groups (the measured winner):
 * - Each word gets an angle from the board's own 2D projection (PCA of the similarity matrix, by
 *   power iteration), so nearby meanings get nearby hues (PCA angle alone: Spearman -0.70).
 * - Multi-word groups take the circular mean of their members' angles, then are pushed apart on the
 *   wheel, keeping their order, until neighbours are at least min(60°, 360°/groups) apart (PCA angle
 *   alone left groups 6-21° apart).
 * - Members keep a little of their own angle around the group hue; lightness follows similarity to
 *   the group's core word in a narrow band. Words in no group keep their projection hue, muted.
 * - Stability: the wheel is rotated (and mirrored if that fits better) to match the previous hues,
 *   so adding a word does not repaint the board.
 */
export interface SemanticColorInput {
    words: readonly string[];
    /** Row-major n x n cosine similarities. */
    sims: Float32Array;
    /** A group id per word (e.g. similarityGroups); molecules should already share an id. */
    groups: readonly number[];
    /** Hues (degrees) from the last call, by word, for stability. */
    previous?: ReadonlyMap<string, number>;
}

export interface SemanticColor {
    hex: string;
    /** Degrees on the OKLCH hue wheel. */
    hue: number;
    lightness: number;
    chroma: number;
}

/** Largest hue offset of a member from its group hue (degrees). */
const WITHIN_SPREAD = 12;
const MIN_GROUP_GAP = 60;
const GROUP_CHROMA = 0.15;
const SINGLETON_CHROMA = 0.05;
const L_CORE = 0.66;
const L_EDGE = 0.76;
const L_SINGLETON = 0.74;

export function semanticColors({ words, sims, groups, previous }: SemanticColorInput): SemanticColor[] {
    const n = words.length;
    if (n === 0) return [];
    const angles = projectionAngles(sims, n);
    const members = new Map<number, number[]>();
    groups.forEach((g, i) => members.set(g, [...(members.get(g) ?? []), i]));

    // Group hues: circular mean of member angles, then multi-word groups pushed apart on the wheel.
    const multi = [...members.entries()].filter(([, list]) => list.length > 1);
    const centre = new Map(multi.map(([id, list]) => [id, circularMean(list.map(i => angles[i]))]));
    const spaced = spreadOnCircle(multi.map(([id]) => centre.get(id)!), Math.min(MIN_GROUP_GAP, 360 / Math.max(1, multi.length)));
    const groupHue = new Map(multi.map(([id], k) => [id, spaced[k]]));

    const raw: { hue: number; lightness: number; chroma: number }[] = new Array(n);
    for (const [id, list] of members) {
        if (list.length === 1) {
            raw[list[0]] = { hue: angles[list[0]], lightness: L_SINGLETON, chroma: SINGLETON_CHROMA };
            continue;
        }
        const hue = groupHue.get(id)!;
        const mean = centre.get(id)!;
        const coreScore = (i: number) => list.reduce((s, j) => s + (i === j ? 0 : sims[i * n + j]), 0);
        const core = list.reduce((a, b) => (coreScore(b) > coreScore(a) ? b : a));
        const toCore = list.map(i => (i === core ? 1 : sims[i * n + core]));
        const lo = Math.min(...toCore), hi = Math.max(...toCore);
        list.forEach((i, k) => {
            const t = hi > lo ? (hi - toCore[k]) / (hi - lo) : 0; // 0 = core, 1 = farthest member
            const offset = Math.max(-WITHIN_SPREAD, Math.min(WITHIN_SPREAD, signedHueDelta(mean, angles[i])));
            raw[i] = { hue: hue + offset, lightness: L_CORE + (L_EDGE - L_CORE) * t, chroma: GROUP_CHROMA };
        });
    }

    // Stability: rotate (and maybe mirror) the wheel to best match the previous hues of shared words.
    let rotation = 0, mirror = false;
    const shared = previous ? words.map((w, i) => [i, previous.get(w)] as const).filter((e): e is readonly [number, number] => e[1] !== undefined) : [];
    if (shared.length > 0) {
        let bestCost = Infinity;
        for (const m of [false, true]) {
            const rot = circularMean(shared.map(([i, prev]) => prev - (m ? -raw[i].hue : raw[i].hue)));
            const cost = shared.reduce((s, [i, prev]) => s + hueDistance(prev, (m ? -raw[i].hue : raw[i].hue) + rot), 0);
            if (cost < bestCost - 1e-9) { bestCost = cost; rotation = rot; mirror = m; }
        }
    }
    return raw.map(({ hue, lightness, chroma }) => {
        const h = wrap((mirror ? -hue : hue) + rotation);
        return { hue: h, lightness, chroma, hex: oklchToHex(lightness, chroma, h) };
    });
}

/**
 * Angle (degrees) of each word in the board's top-2 PCA plane. For unit vectors the double-centred
 * similarity matrix is the centred Gram matrix, so its top eigenvectors give PCA scores; power
 * iteration with a fixed start keeps this deterministic.
 */
export function projectionAngles(sims: Float32Array, n: number): number[] {
    if (n === 1) return [0];
    const row = new Float64Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) row[i] += sims[i * n + j] / n; total += row[i] / n; }
    const gram = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) gram[i * n + j] = sims[i * n + j] - row[i] - row[j] + total;
    const eig = (deflate?: { v: Float64Array; value: number }) => {
        let v = Float64Array.from({ length: n }, (_, i) => 1 + ((i * 7919) % 13) / 13);
        let value = 0;
        for (let iter = 0; iter < 200; iter++) {
            const next = new Float64Array(n);
            for (let i = 0; i < n; i++) {
                let s = 0;
                for (let j = 0; j < n; j++) s += gram[i * n + j] * v[j];
                next[i] = s;
            }
            if (deflate) {
                const proj = next.reduce((s, x, i) => s + x * deflate.v[i], 0);
                for (let i = 0; i < n; i++) next[i] -= proj * deflate.v[i];
            }
            const norm = Math.hypot(...next) || 1;
            value = norm;
            v = next.map(x => x / norm);
        }
        // Fix the sign so the projection does not flip between calls.
        const flip = v.reduce((s, x) => s + x, 0) < 0 ? -1 : 1;
        return { v: v.map(x => x * flip), value };
    };
    const first = eig();
    const second = eig(first);
    return [...Array(n).keys()].map(i => wrap(toDeg(Math.atan2(second.v[i] * Math.sqrt(second.value), first.v[i] * Math.sqrt(first.value)))));
}

/** Pushes points on the hue circle apart until neighbours are at least `gap` degrees apart, keeping their order. */
export function spreadOnCircle(hues: readonly number[], gap: number): number[] {
    const m = hues.length;
    if (m < 2) return hues.map(wrap);
    const order = hues.map((h, i) => [wrap(h), i] as const).sort((a, b) => a[0] - b[0]);
    const pos = order.map(([h]) => h);
    for (let iter = 0; iter < 500; iter++) {
        let moved = false;
        for (let k = 0; k < m; k++) {
            const a = k, b = (k + 1) % m;
            const d = b === 0 ? pos[b] + 360 - pos[a] : pos[b] - pos[a];
            if (d < gap - 1e-6) {
                const push = (gap - d) / 2;
                pos[a] -= push;
                pos[b] += push;
                moved = true;
            }
        }
        // Re-anchor so the sequence stays sorted within one turn.
        for (let k = 1; k < m; k++) if (pos[k] < pos[k - 1]) pos[k] = pos[k - 1];
        if (!moved) break;
    }
    const out = new Array<number>(m);
    order.forEach(([, i], k) => { out[i] = wrap(pos[k]); });
    return out;
}

function circularMean(hues: readonly number[]): number {
    const [x, y] = hues.reduce(([a, b], h) => [a + Math.cos(toRad(h)), b + Math.sin(toRad(h))], [0, 0]);
    return wrap(toDeg(Math.atan2(y, x)));
}

/** b - a as the shortest signed turn, -180..180 degrees. */
function signedHueDelta(a: number, b: number): number {
    const d = wrap(b - a);
    return d > 180 ? d - 360 : d;
}

/** Smallest angle between two hues, 0..180 degrees. */
export function hueDistance(a: number, b: number): number {
    const d = Math.abs(wrap(a) - wrap(b));
    return d > 180 ? 360 - d : d;
}

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;
const wrap = (h: number) => ((h % 360) + 360) % 360;

/** OKLab from OKLCH (Ottosson 2020). */
export function oklchToOklab(l: number, c: number, hDeg: number): [number, number, number] {
    const h = toRad(hDeg);
    return [l, c * Math.cos(h), c * Math.sin(h)];
}

/** OKLCH → sRGB hex, clamped into gamut by reducing chroma until it fits. */
export function oklchToHex(l: number, c: number, hDeg: number): string {
    for (let chroma = c; chroma >= 0; chroma -= 0.005) {
        const rgb = oklabToSrgb(...oklchToOklab(l, chroma, hDeg));
        if (rgb.every(v => v >= -1e-4 && v <= 1 + 1e-4)) return toHex(rgb);
    }
    return toHex(oklabToSrgb(l, 0, 0));
}

/** OKLab difference ×100 (≈ just-noticeable at 2). */
export function deltaE(hexA: string, hexB: string): number {
    const [a, b] = [hexToOklab(hexA), hexToOklab(hexB)];
    return 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function oklabToSrgb(L: number, a: number, b: number): [number, number, number] {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const lin = [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
    return lin.map(v => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.sign(v) * Math.abs(v) ** (1 / 2.4) - 0.055)) as [number, number, number];
}

export function hexToOklab(hex: string): [number, number, number] {
    const clean = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(clean.slice(i, i + 2), 16) / 255)
        .map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
}

function toHex(rgb: readonly number[]): string {
    return "#" + rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");
}

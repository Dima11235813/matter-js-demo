import { describe, it, expect } from 'vitest';
import { deltaE, hexToOklab, hueDistance, oklchToHex, semanticColors } from '../src/theme/semanticColors';
import { contrastRatio, readableTextColor, WCAG_AA_TEXT } from '../src/utils/colorUtils';

/** Board: pets (dog, puppy, cat), wild (lion, tiger, wolf) related to pets, music (piano, guitar, drum), and "tax" alone. */
const words = ['dog', 'puppy', 'cat', 'lion', 'tiger', 'wolf', 'piano', 'guitar', 'drum', 'tax'];
const groups = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3];
function simsFor(ws: readonly string[], gs: readonly number[]): Float32Array {
  const n = ws.length;
  const sims = new Float32Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j) sims[i * n + j] = 1;
    else if (gs[i] === gs[j]) sims[i * n + j] = ws[i] === 'dog' || ws[j] === 'dog' ? 0.75 : 0.6; // dog is the pets core
    else if ((gs[i] === 0 && gs[j] === 1) || (gs[i] === 1 && gs[j] === 0)) sims[i * n + j] = 0.35;
    else sims[i * n + j] = 0.05;
  }
  return sims;
}
const sims = simsFor(words, groups);

describe('semanticColors (color hint mode, Feature 5.17)', () => {
  const colors = semanticColors({ words, sims, groups });
  const hueOf = (w: string) => colors[words.indexOf(w)].hue;

  it('is deterministic and returns valid hex colors', () => {
    expect(semanticColors({ words, sims, groups })).toEqual(colors);
    colors.forEach(c => expect(c.hex).toMatch(/^#[0-9a-f]{6}$/));
  });

  it('keeps groups at least 60° apart, with related groups closer than unrelated ones', () => {
    const groupHue = (g: number) => colors[groups.indexOf(g)].hue;
    const [pets, wild, music] = [0, 1, 2].map(groupHue);
    for (const [a, b] of [[pets, wild], [pets, music], [wild, music]]) expect(hueDistance(a, b)).toBeGreaterThanOrEqual(60 - 1e-6);
    // pets and wild animals are related (0.35), music is not (0.05): related groups sit nearer on the wheel.
    expect(hueDistance(pets, wild)).toBeLessThan(hueDistance(pets, music));
  });

  it('keeps a group in one hue family, with the core word deepest', () => {
    expect(hueDistance(hueOf('dog'), hueOf('puppy'))).toBeLessThanOrEqual(14);
    const pets = ['dog', 'puppy', 'cat'].map(w => colors[words.indexOf(w)]);
    expect(pets[0].lightness).toBeLessThan(pets[1].lightness);
  });

  it('mutes words that belong to no group', () => {
    expect(colors[words.indexOf('tax')].chroma).toBeLessThan(colors[words.indexOf('dog')].chroma);
  });

  it('colour distance falls as similarity rises (Spearman over all pairs < -0.5)', () => {
    const d: number[] = [], s: number[] = [];
    for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) { d.push(deltaE(colors[i].hex, colors[j].hex)); s.push(sims[i * words.length + j]); }
    const rank = (xs: number[]) => { const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]); const r = new Array(xs.length); order.forEach(([, i], k) => { r[i] = k; }); return r; };
    const [rd, rs] = [rank(d), rank(s)];
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const [md, ms] = [mean(rd), mean(rs)];
    const cov = rd.reduce((acc, x, i) => acc + (x - md) * (rs[i] - ms), 0);
    const sd = (xs: number[], m: number) => Math.sqrt(xs.reduce((acc, x) => acc + (x - m) ** 2, 0));
    expect(cov / (sd(rd, md) * sd(rs, ms))).toBeLessThan(-0.5);
  });

  it('stays stable when a word joins: existing words move less than ΔE 10', () => {
    const more = [...words, 'kitten'];
    const moreGroups = [...groups, 0];
    const previous = new Map(words.map((w, i) => [w, colors[i].hue]));
    const next = semanticColors({ words: more, sims: simsFor(more, moreGroups), groups: moreGroups, previous });
    const moved = words.map((w, i) => deltaE(colors[i].hex, next[i].hex));
    expect(Math.max(...moved)).toBeLessThan(10);
  });

  it('every label stays readable (≥ 4.5:1) on its semantic colour', () => {
    colors.forEach(c => expect(contrastRatio(c.hex, readableTextColor(c.hex))).toBeGreaterThanOrEqual(WCAG_AA_TEXT));
  });

  it('converts OKLCH to sRGB and back', () => {
    const [l, a, b] = hexToOklab(oklchToHex(0.7, 0.1, 200));
    expect(l).toBeCloseTo(0.7, 2);
    expect(Math.hypot(a, b)).toBeCloseTo(0.1, 2);
  });
});

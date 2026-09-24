import { describe, it, expect } from 'vitest';
import { contrastRatio, getRandomColor, parseHex, readableTextColor, relativeLuminance, WCAG_AA_TEXT } from '../src/utils/colorUtils';
import { palettes, uiPalettes } from '../src/theme/palette';

describe('WCAG color math', () => {
  it('parses short and long hex', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('#0c0c0e')).toEqual([12, 12, 14]);
    expect(() => parseHex('blue')).toThrow();
  });

  it('matches the reference luminance and contrast values', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1);
    expect(relativeLuminance('#000000')).toBe(0);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#ff007f', '#0c0c0e')).toBeCloseTo(contrastRatio('#0c0c0e', '#ff007f'));
  });
});

describe('readableTextColor', () => {
  it('picks dark text on light backgrounds and light text on dark ones', () => {
    expect(readableTextColor('#f5f5f7')).toBe('#000000');
    expect(readableTextColor('#0c0c0e')).toBe('#ffffff');
    expect(readableTextColor('#c8f0c8')).toBe('#000000'); // pale green "princess" box
  });

  it('meets WCAG AA for every one of 4,096 sampled backgrounds', () => {
    const steps = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];
    let worst = Infinity;
    for (const r of steps) for (const g of steps) for (const b of steps) {
      const bg = `#${r}${g}${b}`;
      worst = Math.min(worst, contrastRatio(bg, readableTextColor(bg)));
    }
    expect(worst).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  it('meets WCAG AA for random box colors', () => {
    for (let i = 0; i < 2000; i++) {
      const bg = getRandomColor();
      expect(contrastRatio(bg, readableTextColor(bg))).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    }
  });
});

describe('theme palettes', () => {
  it.each(Object.entries(palettes))('%s: canvas text and thread labels meet WCAG AA', (_name, palette) => {
    expect(contrastRatio(palette.canvas, palette.canvasText)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    expect(contrastRatio(palette.labelBackground, palette.thread)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });
});

describe('UI palettes', () => {
  const pairs: Array<[string, string]> = [
    ['text', 'surface'], ['textMuted', 'surface'], ['textMuted', 'surfaceRaised'], ['accent', 'surface'],
    ['accentText', 'accent'], ['selection', 'surface'], ['hint', 'surface'], ['danger', 'surface'],
  ];
  for (const [theme, ui] of Object.entries(uiPalettes)) {
    it.each(pairs)(`${theme}: %s on %s meets WCAG AA`, (fg, bg) => {
      const tokens = ui as unknown as Record<string, string>;
      expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    });
  }
});

export const getRandomColor = () => {
    var letters = '0123456789ABCDEF';
    var color = '#';
    for (var i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

/** WCAG 2.x minimum contrast for normal-size text (AA). */
export const WCAG_AA_TEXT = 4.5;

/** Parses #rgb or #rrggbb into 0-255 channels. */
export function parseHex(hex: string): [number, number, number] {
    const clean = hex.replace('#', '');
    const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Not a hex color: ${hex}`);
    return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance (0 = black, 1 = white) with sRGB linearization. */
export function relativeLuminance(hex: string): number {
    const [r, g, b] = parseHex(hex).map(channel => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors, from 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
    const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
}

/**
 * Text color for any background: black or white, whichever contrasts more. This always meets
 * WCAG AA for normal text: the worst case is a background of luminance ~0.179, where both
 * black and white reach ~4.58:1, and every other background favors one of them further.
 */
export function readableTextColor(background: string): '#000000' | '#ffffff' {
    return contrastRatio(background, '#000000') >= contrastRatio(background, '#ffffff') ? '#000000' : '#ffffff';
}

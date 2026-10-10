/**
 * Single source of truth for colors in both themes. `canvas` tokens are drawn on the 2D canvas and in 3D; `ui` tokens
 * are written to CSS custom properties (--text, --surface, ...) by applyTheme() and consumed by
 * the SCSS modules. Word boxes keep their random fill and pick text via readableTextColor().
 * Every text/background pair here is checked against WCAG AA in tests/colorUtils.test.ts.
 */
export type ThemeName = "dark" | "light";

export interface CanvasPalette {
    canvas: string;
    canvasText: string;
    /** Relation threads and similarity labels. */
    thread: string;
    labelBackground: string;
    selection: string;
    boxStroke: string;
}

export interface UiPalette {
    text: string;
    textMuted: string;
    /** Dashboard and menu background (drawn at 92% opacity over the canvas). */
    surface: string;
    surfaceRaised: string;
    border: string;
    accent: string;
    /** Text drawn on an accent-filled button. */
    accentText: string;
    selection: string;
    hint: string;
    danger: string;
}

export const uiPalettes: Record<ThemeName, UiPalette> = {
    dark: {
        text: "#ffffff",
        textMuted: "#a9a9b4",
        surface: "#141418",
        surfaceRaised: "#1e1e24",
        border: "#34343c",
        accent: "#00d8e6",
        accentText: "#06121a",
        selection: "#ff4d9d",
        hint: "#ffb020",
        danger: "#ff7070",
    },
    light: {
        text: "#16161a",
        textMuted: "#54545e",
        surface: "#ffffff",
        surfaceRaised: "#eeeef3",
        border: "#c9c9d3",
        accent: "#00688a",
        accentText: "#ffffff",
        selection: "#c2005f",
        hint: "#8a5700",
        danger: "#c62828",
    },
};

export const palettes: Record<ThemeName, CanvasPalette> = {
    dark: {
        canvas: "#0c0c0e",
        canvasText: "#b8b8c0",
        thread: "#00f2fe",
        labelBackground: "#0c0c0e",
        selection: "#ff007f",
        boxStroke: "#000000",
    },
    light: {
        canvas: "#f4f4f6",
        canvasText: "#3a3a44",
        thread: "#006a8e",
        labelBackground: "#ffffff",
        selection: "#c2005f",
        boxStroke: "#2a2a32",
    },
};

const STORAGE_KEY = "lexical-fountain.theme";

/**
 * Theme is a per-device UI preference read synchronously at startup (before IndexedDB is open),
 * so it lives in localStorage. Falls back to the OS setting, then dark.
 */
export function loadThemePreference(): ThemeName {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored === "dark" || stored === "light") return stored;
    } catch {
        /* storage blocked: fall through to the OS preference */
    }
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function saveThemePreference(theme: ThemeName): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
        /* storage blocked: the choice still applies for this session */
    }
}

/** Hex color to [r, g, b] (for the canvas sketch's stroke/fill with alpha). */
export function rgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Applies a theme to the document: data-theme attribute plus one CSS variable per UI token. */
export function applyTheme(theme: ThemeName): void {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const ui = uiPalettes[theme];
    for (const [token, value] of Object.entries(ui)) {
        root.style.setProperty(`--${token.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`, value);
    }
    const [r, g, b] = rgb(ui.surface);
    root.style.setProperty("--surface-glass", `rgba(${r}, ${g}, ${b}, 0.92)`);
    root.style.setProperty("--canvas", palettes[theme].canvas);
}

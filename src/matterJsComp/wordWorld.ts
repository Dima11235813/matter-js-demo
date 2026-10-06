/**
 * What the rest of the app needs from whichever world is live (Epic 5, Task 5.4.1.1): the 2D
 * Matter/p5 world or the 3D three.js space. Services, devtools, and the 2D <-> 3D hand-off only
 * use this interface, never a concrete world.
 */
export interface WordProbe {
    text: string;
    /** Canvas pixels (2D: body position; 3D: projected through the camera). */
    x: number;
    y: number;
    /** Layout position in the world's own space (2D: [x, y]; 3D: [x, y, z]). */
    position: number[];
    color?: string;
}

/** A letters-mode box as it was left, so returning to letters mode restores the board (Feature 2.14). */
export interface LetterSnapshot {
    text: string;
    x: number;
    y: number;
    angle: number;
    w: number;
    h: number;
    color: string;
    type: number;
}

export interface WordWorld {
    readonly dimension: "2d" | "3d";
    /** Letters mode only: every box on the board (letters, fragments, words). */
    letterSnapshot?(): LetterSnapshot[];
    /** Letters mode only: replaces the board with saved boxes (loading a session). */
    replaceLetterBoard?(snapshots: readonly LetterSnapshot[]): void;
    wordTexts(): string[];
    clearWordBoxes(): void;
    /** Removes these words from the board (a solved Guess analogy makes room). */
    removeWords(words: readonly string[]): void;
    wordProbes(): WordProbe[];
    /**
     * Brings words into view and highlights them briefly: in 3D the camera flies to them; in 2D
     * (no camera yet) they pulse. Words not on the board are ignored.
     */
    focusWords(words: readonly string[]): void;
    /** Words highlighted by focus right now (dev handle and e2e tests). */
    focusedWords(): string[];
}

/** The words a spawn batch asks to focus: flagged words plus any requested focus groups. */
export function focusTargets(batch: readonly { word: string; focus?: boolean; focusGroup?: readonly string[] }[]): string[] {
    const words = new Set<string>();
    for (const request of batch) {
        if (request.focus) words.add(request.word);
        request.focusGroup?.forEach(word => words.add(word));
    }
    return [...words];
}

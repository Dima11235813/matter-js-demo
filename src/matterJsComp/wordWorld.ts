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

export interface WordWorld {
    readonly dimension: "2d" | "3d";
    wordTexts(): string[];
    clearWordBoxes(): void;
    wordProbes(): WordProbe[];
    /**
     * Brings words into view and highlights them briefly: in 3D the camera flies to them; in 2D
     * (no camera yet) they pulse. Words not on the board are ignored.
     */
    focusWords(words: readonly string[]): void;
}

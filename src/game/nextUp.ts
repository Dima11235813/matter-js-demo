/**
 * Next-up queue (Epic 2 · Feature 2.16): the item the next + tap drops, reserved ahead of time like a
 * falling-block game's "next" box, so the preview shows exactly what lands. Pure: the caller supplies
 * the random source and decides which items are usable (Discovery skips words already on the board).
 */
export class NextUpQueue {
    private next: string | undefined;

    /**
     * @param draw a random item, or undefined when none is available yet (vocabulary still loading)
     * @param attempts draws tried before giving up on finding a usable item
     */
    constructor(private readonly draw: () => string | undefined, private readonly attempts = 50) {}

    /** The reserved item; redrawn if it is missing or no longer usable (it landed on the board meanwhile). */
    peek(usable: (item: string) => boolean = () => true): string | undefined {
        if (this.next === undefined || !usable(this.next)) this.next = this.drawUsable(usable);
        return this.next;
    }

    /** Takes the reserved item (the one the preview showed) and reserves a different one for next time. */
    take(usable: (item: string) => boolean = () => true): string | undefined {
        const item = this.peek(usable);
        this.next = item === undefined ? undefined : this.drawUsable(other => other !== item && usable(other));
        return item;
    }

    private drawUsable(usable: (item: string) => boolean): string | undefined {
        for (let i = 0; i < this.attempts; i++) {
            const item = this.draw();
            if (item === undefined) return undefined;
            if (usable(item)) return item;
        }
        return undefined;
    }
}

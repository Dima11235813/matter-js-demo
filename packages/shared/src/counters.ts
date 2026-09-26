/**
 * Per-device counters (grow-only counters, "G-Counters") for values that several devices add to:
 * the lifetime score and how often an analogy was played (Epic 6 · Task 6.1.1.1). Each device only
 * increments its own entry, so merging two copies takes the larger value per device. That merge is
 * commutative, associative, and idempotent: syncing in any order, any number of times, never loses
 * or doubles a point. A plain number merged by "last writer wins" loses the other device's points.
 */
export type DeviceCounter = Readonly<Record<string, number>>;

export function counterTotal(counter: DeviceCounter | undefined): number {
    if (!counter) return 0;
    let total = 0;
    for (const value of Object.values(counter)) total += value;
    return total;
}

/**
 * Adds `by` (default 1) to this device's entry. Entries only grow, which is what makes the max-merge
 * safe, so a negative `by` is rejected (lifetime points never go down; timed-round penalties stay in
 * the round score).
 */
export function incrementCounter(counter: DeviceCounter | undefined, deviceId: string, by = 1): DeviceCounter {
    if (!(by >= 0)) throw new RangeError(`Per-device counters only grow (got ${by})`);
    return { ...counter, [deviceId]: (counter?.[deviceId] ?? 0) + by };
}

/** Merges two replicas: the larger value per device wins (each device's entry only ever grows). */
export function mergeCounters(a: DeviceCounter | undefined, b: DeviceCounter | undefined): DeviceCounter {
    const merged: Record<string, number> = { ...a };
    for (const [device, value] of Object.entries(b ?? {})) merged[device] = Math.max(merged[device] ?? value, value);
    return merged;
}

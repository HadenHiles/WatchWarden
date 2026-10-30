export interface SourceBatch {
    source: string;
    snapshotAt: string;
    completedAt: string;
    count: number;
}

export function selectCurrentSourceSnapshots<T extends { source: string; snapshotAt: Date }>(
    snapshots: T[], batches: SourceBatch[], now = new Date(),
): T[] {
    const current = new Map<string, number>();
    for (const batch of batches) {
        const snapshotAt = Date.parse(batch.snapshotAt);
        const completedAt = Date.parse(batch.completedAt);
        if (!batch.source || !Number.isSafeInteger(batch.count) || batch.count < 0
            || !Number.isFinite(snapshotAt) || !Number.isFinite(completedAt)
            || completedAt < snapshotAt || completedAt > now.getTime()
            || now.getTime() - completedAt > 36 * 3600000) throw new Error("Source batch is invalid or stale");
        if (current.has(batch.source)) throw new Error("Duplicate source batch marker");
        current.set(batch.source, snapshotAt);
    }
    return snapshots.filter((snapshot) => current.get(snapshot.source) === snapshot.snapshotAt.getTime());
}
export const CURATION_JOBS = ["trend-sync", "plex-library-sync", "tautulli-sync", "plex-sync", "rotation-cleanup"] as const;

interface Run {
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
}

interface Shelf {
    id: string;
    name: string;
    mediaType: string;
    shelfType: string;
    enabled: boolean;
    publishToHome: boolean;
    autoRequest: boolean;
    itemCount: number;
    lastSyncAt: Date | null;
}

export function curationStatus(
    jobs: Array<{ name: string; lastAttempt: Run | null; lastSuccess: Run | null }>,
    shelves: Shelf[],
    now = new Date(),
) {
    if (shelves.length > 100) throw new Error("Curation status exceeds the 100-shelf limit");
    return {
        version: 1,
        checkedAt: now.toISOString(),
        evidence: "recorded_job_outcomes",
        plexVerification: "not_live_verified",
        sourceFreshness: "not_verified",
        jobs: jobs.map(({ name, lastAttempt, lastSuccess }) => ({
            name,
            lastAttempt: lastAttempt ? {
                status: lastAttempt.status,
                startedAt: lastAttempt.startedAt.toISOString(),
                finishedAt: lastAttempt.finishedAt?.toISOString() ?? null,
            } : null,
            lastSuccessAt: lastSuccess?.finishedAt?.toISOString() ?? null,
        })),
        shelves: shelves.map((shelf) => ({
            id: shelf.id, name: shelf.name, mediaType: shelf.mediaType, shelfType: shelf.shelfType,
            enabled: shelf.enabled, publishToHome: shelf.publishToHome, autoRequest: shelf.autoRequest,
            itemCount: shelf.itemCount, lastSyncAt: shelf.lastSyncAt?.toISOString() ?? null,
        })),
    };
}
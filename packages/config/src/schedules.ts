import type { WorkerEnv } from "./env";

const SCHEDULE_FIELDS = {
    trendSyncCron: "TREND_SYNC_CRON",
    tautulliSyncCron: "TAUTULLI_SYNC_CRON",
    scoringCron: "SCORING_CRON",
    jellyseerrStatusSyncCron: "JELLYSEERR_STATUS_SYNC_CRON",
    jellyseerrDiscoverSyncCron: "JELLYSEERR_DISCOVER_SYNC_CRON",
    librarySyncCron: "LIBRARY_SYNC_CRON",
    plexLibrarySyncCron: "PLEX_LIBRARY_SYNC_CRON",
    radarrSyncCron: "RADARR_SYNC_CRON",
    lifecycleEvalCron: "LIFECYCLE_EVAL_CRON",
    exportCron: "EXPORT_CRON",
    plexSyncCron: "PLEX_SYNC_CRON",
} as const;

export function resolveWorkerSchedules(env: WorkerEnv, saved: unknown): WorkerEnv {
    if (saved == null) return { ...env };
    if (typeof saved !== "object" || Array.isArray(saved)) throw new Error("Saved worker schedules must be an object");
    const resolved = { ...env };
    for (const [field, envField] of Object.entries(SCHEDULE_FIELDS)) {
        const value = (saved as Record<string, unknown>)[field];
        if (value === undefined) continue;
        if (typeof value !== "string" || !value.trim() || value.length > 100) throw new Error(`Invalid saved schedule: ${field}`);
        resolved[envField] = value.trim();
    }
    return resolved;
}
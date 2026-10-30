import { JobRunner } from "../services/job-runner";
import { trendSyncJob } from "./trend-sync.job";
import { plexLibrarySyncJob } from "./plex-library-sync.job";
import { catalogueObserveJob } from "./catalogue-observe.job";
import { rotationCleanupJob } from "./rotation-cleanup.job";
import { plexSyncJob } from "./plex-sync.job";
import { tautulliSyncJob } from "./tautulli-sync.job";

export async function curationRefreshJob(): Promise<void> {
    const runner = new JobRunner();
    const stages = [
        ["trend-sync", trendSyncJob], ["plex-library-sync", plexLibrarySyncJob], ["tautulli-sync", tautulliSyncJob],
        ["catalogue-observe", catalogueObserveJob], ["rotation-cleanup", rotationCleanupJob],
        ["plex-sync", () => plexSyncJob({ allowAcquisition: false })],
    ] as const;
    const failures: string[] = [];
    for (const [name, run] of stages) {
        try { await runner.run(name, run, true); }
        catch { failures.push(name); }
    }
    if (failures.length) throw new Error(`Curation refresh has incomplete stages: ${failures.join(", ")}`);
}
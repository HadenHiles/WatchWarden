import { JobRunner } from "../services/job-runner";
import { trendSyncJob } from "./trend-sync.job";
import { plexLibrarySyncJob } from "./plex-library-sync.job";
import { catalogueObserveJob } from "./catalogue-observe.job";
import { rotationCleanupJob } from "./rotation-cleanup.job";
import { plexSyncJob } from "./plex-sync.job";

export async function curationRefreshJob(): Promise<void> {
    const runner = new JobRunner();
    await runner.run("trend-sync", trendSyncJob, true);
    await runner.run("plex-library-sync", plexLibrarySyncJob, true);
    await runner.run("catalogue-observe", catalogueObserveJob, true);
    await runner.run("rotation-cleanup", rotationCleanupJob, true);
    await runner.run("plex-sync", () => plexSyncJob({ allowAcquisition: false }), true);
}
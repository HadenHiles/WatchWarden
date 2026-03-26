import cron from "node-cron";
import type { WorkerEnv } from "@watchwarden/config";
import { createLogger } from "@watchwarden/config";
import { JobRunner } from "./services/job-runner";
import { trendSyncJob } from "./jobs/trend-sync.job";
import { tautulliSyncJob } from "./jobs/tautulli-sync.job";
import { scoringJob } from "./jobs/scoring.job";
import { jellyseerrStatusSyncJob } from "./jobs/jellyseerr-status-sync.job";
import { librarySyncJob } from "./jobs/library-sync.job";
import { lifecycleEvalJob } from "./jobs/lifecycle-eval.job";
import { exportJob } from "./jobs/export.job";

const logger = createLogger("scheduler");

export function buildScheduler(env: WorkerEnv) {
    const runner = new JobRunner();

    const tasks: { name: string; cron: string; fn: () => Promise<void> }[] = [
        { name: "trend-sync", cron: env.TREND_SYNC_CRON, fn: trendSyncJob },
        { name: "tautulli-sync", cron: env.TAUTULLI_SYNC_CRON, fn: tautulliSyncJob },
        { name: "scoring", cron: env.SCORING_CRON, fn: scoringJob },
        { name: "jellyseerr-status-sync", cron: env.JELLYSEERR_STATUS_SYNC_CRON, fn: jellyseerrStatusSyncJob },
        { name: "library-sync", cron: env.LIBRARY_SYNC_CRON, fn: librarySyncJob },
        { name: "lifecycle-eval", cron: env.LIFECYCLE_EVAL_CRON, fn: lifecycleEvalJob },
        { name: "export", cron: env.EXPORT_CRON, fn: exportJob },
    ];

    const scheduledTasks = tasks.map(({ name, cron: cronExpr, fn }) => {
        if (!cron.validate(cronExpr)) {
            logger.warn(`Invalid cron expression for job ${name}: "${cronExpr}" — job will not be scheduled`);
            return null;
        }

        logger.info(`Scheduling job "${name}" with cron "${cronExpr}"`);

        return cron.schedule(cronExpr, async () => {
            await runner.run(name as never, fn);
        });
    });

    // Trigger-polling: check for manual trigger signals every 30 seconds
    const triggerPoll = cron.schedule("*/30 * * * * *", async () => {
        try {
            await runner.checkAndRunTriggers(tasks);
        } catch (err) {
            logger.warn("Trigger poll failed (DB unavailable?)", { error: err instanceof Error ? err.message : String(err) });
        }
    });

    return {
        start() {
            scheduledTasks.forEach((t) => t?.start());
            triggerPoll.start();
            logger.info(`${scheduledTasks.filter(Boolean).length} jobs scheduled`);
        },
        stop() {
            scheduledTasks.forEach((t) => t?.stop());
            triggerPoll.stop();
        },
    };
}

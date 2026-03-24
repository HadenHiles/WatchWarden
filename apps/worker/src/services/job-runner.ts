import { prisma } from "@watchwarden/db";
import { createLogger } from "@watchwarden/config";
import type { JobName } from "@watchwarden/types";

const logger = createLogger("job-runner");

export class JobRunner {
    async run(jobName: JobName, fn: () => Promise<void>): Promise<void> {
        // Check if already running (idempotency guard)
        const running = await prisma.jobRun.findFirst({
            where: { jobName, status: "RUNNING" },
            orderBy: { startedAt: "desc" },
        });

        if (running) {
            const ageMs = Date.now() - running.startedAt.getTime();
            // Mark as failed if stuck for more than 30 minutes
            if (ageMs > 30 * 60 * 1000) {
                await prisma.jobRun.update({
                    where: { id: running.id },
                    data: { status: "FAILED", finishedAt: new Date(), error: "Job timed out" },
                });
            } else {
                logger.debug(`Job ${jobName} already running — skipping`);
                return;
            }
        }

        const run = await prisma.jobRun.create({
            data: { jobName, status: "RUNNING" },
        });

        const start = Date.now();
        logger.info(`Job started: ${jobName}`, { runId: run.id });

        try {
            await fn();
            const duration = Date.now() - start;
            await prisma.jobRun.update({
                where: { id: run.id },
                data: { status: "COMPLETED", finishedAt: new Date(), duration },
            });
            logger.info(`Job completed: ${jobName}`, { runId: run.id, duration });
        } catch (err) {
            const duration = Date.now() - start;
            const error = err instanceof Error ? err.message : String(err);
            await prisma.jobRun.update({
                where: { id: run.id },
                data: { status: "FAILED", finishedAt: new Date(), duration, error },
            });
            logger.error(`Job failed: ${jobName}`, { runId: run.id, error });
        }
    }

    /** Checks the DB for manual trigger signals and fires matching jobs */
    async checkAndRunTriggers(
        tasks: { name: string; fn: () => Promise<void> }[]
    ): Promise<void> {
        const triggerKeys = tasks.map((t) => `job.trigger.${t.name}`);
        const triggers = await prisma.appSetting.findMany({
            where: { key: { in: triggerKeys } },
        });

        for (const trigger of triggers) {
            const jobName = trigger.key.replace("job.trigger.", "");
            const task = tasks.find((t) => t.name === jobName);
            if (!task) continue;

            const triggeredAt = (trigger.value as { triggeredAt: string }).triggeredAt;
            const ageMs = Date.now() - new Date(triggeredAt).getTime();

            // Process triggers that are less than 5 minutes old
            if (ageMs < 5 * 60 * 1000) {
                logger.info(`Manual trigger detected for job: ${jobName}`);
                // Delete trigger so we don't re-run it
                await prisma.appSetting.delete({ where: { key: trigger.key } });
                await this.run(jobName as JobName, task.fn);
            } else {
                // Clean up stale triggers
                await prisma.appSetting.delete({ where: { key: trigger.key } });
            }
        }
    }
}

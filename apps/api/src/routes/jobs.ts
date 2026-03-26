import { Router } from "express";
import { prisma } from "@watchwarden/db";
import { AppError, asyncHandler } from "../middleware/error";

export const jobsRouter = Router();

const JOB_NAMES = [
    "trend-sync",
    "tautulli-sync",
    "scoring",
    "jellyseerr-status-sync",
    "library-sync",
    "lifecycle-eval",
    "export",
    "plex-library-sync",
    "plex-sync",
] as const;

// GET /jobs — summary status for all jobs
jobsRouter.get("/", asyncHandler(async (_req, res) => {
    const summaries = await Promise.all(
        JOB_NAMES.map(async (jobName) => {
            const recentRuns = await prisma.jobRun.findMany({
                where: { jobName },
                orderBy: { startedAt: "desc" },
                take: 10,
            });

            const successCount = recentRuns.filter((r) => r.status === "COMPLETED").length;
            const failureCount = recentRuns.filter((r) => r.status === "FAILED").length;
            const isRunning = recentRuns[0]?.status === "RUNNING";

            return {
                jobName,
                lastRun: recentRuns[0] ?? null,
                recentRuns,
                successCount,
                failureCount,
                isRunning,
            };
        })
    );

    res.json({ success: true, data: summaries });
}));

// GET /jobs/:jobName/history
jobsRouter.get("/:jobName/history", asyncHandler(async (req, res) => {
    const { jobName } = req.params;
    const page = parseInt(String(req.query.page ?? 1), 10);
    const pageSize = Math.min(parseInt(String(req.query.pageSize ?? 20), 10), 100);

    const [runs, total] = await Promise.all([
        prisma.jobRun.findMany({
            where: { jobName },
            orderBy: { startedAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
        prisma.jobRun.count({ where: { jobName } }),
    ]);

    res.json({
        success: true,
        data: { items: runs, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
}));

// POST /jobs/:jobName/trigger — signals the worker to run a job immediately
// The worker polls the DB for a "trigger" signal via AppSetting.
jobsRouter.post("/:jobName/trigger", asyncHandler(async (req, res) => {
    const { jobName } = req.params;
    if (!JOB_NAMES.includes(jobName as (typeof JOB_NAMES)[number])) {
        throw new AppError(404, `Unknown job: ${jobName}`);
    }

    await prisma.appSetting.upsert({
        where: { key: `job.trigger.${jobName}` },
        update: { value: { triggeredAt: new Date().toISOString() } },
        create: {
            key: `job.trigger.${jobName}`,
            value: { triggeredAt: new Date().toISOString() },
            category: "job-triggers",
        },
    });

    res.json({ success: true, data: { queued: jobName } });
}));

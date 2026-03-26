import { Router } from "express";
import { prisma } from "@watchwarden/db";

export const statsRouter = Router();

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

// GET /stats — summary counts for the overview dashboard
statsRouter.get("/", async (_req, res) => {
    const [
        pendingMovies,
        pendingShows,
        approved,
        requested,
        available,
        trending,
        cleanupEligible,
        pinned,
        inLibrary,
        recentDecisions,
    ] = await Promise.all([
        prisma.suggestion.count({ where: { status: "PENDING", title: { mediaType: "MOVIE" } } }),
        prisma.suggestion.count({ where: { status: "PENDING", title: { mediaType: "SHOW" } } }),
        prisma.title.count({ where: { status: "APPROVED" } }),
        prisma.title.count({ where: { status: "REQUESTED" } }),
        prisma.title.count({ where: { status: "AVAILABLE" } }),
        prisma.title.count({ where: { status: "ACTIVE_TRENDING" } }),
        prisma.title.count({ where: { cleanupEligible: true } }),
        prisma.title.count({ where: { isPinned: true } }),
        prisma.title.count({ where: { inLibrary: true } }),
        prisma.suggestionDecision.findMany({
            orderBy: { createdAt: "desc" },
            take: 5,
            include: {
                suggestion: {
                    include: { title: { select: { title: true, mediaType: true, posterPath: true } } },
                },
            },
        }),
    ]);

    // Last run per job
    const jobStatuses = await Promise.all(
        JOB_NAMES.map(async (jobName) => {
            const last = await prisma.jobRun.findFirst({
                where: { jobName },
                orderBy: { startedAt: "desc" },
            });
            return { jobName, last };
        })
    );

    res.json({
        success: true,
        data: {
            suggestions: { pendingMovies, pendingShows },
            titles: { approved, requested, available, trending, cleanupEligible, pinned, inLibrary },
            jobs: jobStatuses,
            recentDecisions,
        },
    });
});

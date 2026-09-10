import { prisma, getIntegrationConfig } from "@watchwarden/db";
import { JellyseerrService } from "@watchwarden/integrations";
import { createLogger } from "@watchwarden/config";

const logger = createLogger("rotation-cleanup-job");

/**
 * Removes bot-requested media once it's fallen out of shelf rotation.
 * Titles with zero watch activity are removed immediately; titles that were
 * watched get a grace period (cleanupGraceDays) before removal so the shelves
 * stay fresh without immediately yanking things people watched. Titles
 * requested by people are never touched — Maintainerr remains the fallback
 * for anything this job doesn't catch.
 */
export async function rotationCleanupJob(): Promise<void> {
    const setting = await prisma.appSetting.findUnique({ where: { key: "automation.roster" } });
    const automation = (setting?.value ?? {}) as { deleteUnwatched?: boolean; maxDeletesPerRun?: number; cleanupGraceDays?: number };
    if (automation.deleteUnwatched !== true) return;

    const graceDays = Math.max(1, automation.cleanupGraceDays ?? 30);
    const graceCutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);

    const { jellyseerr } = await getIntegrationConfig();
    if (!jellyseerr.baseUrl || !jellyseerr.apiKey) throw new Error("Jellyseerr is not configured");
    const service = new JellyseerrService({ baseUrl: jellyseerr.baseUrl, apiKey: jellyseerr.apiKey });
    const candidates = await prisma.title.findMany({
        where: {
            inLibrary: true,
            cleanupEligible: true,
            status: "CLEANUP_ELIGIBLE",
            tmdbId: { not: null },
            requestRecord: { requestedByBot: true },
            OR: [
                { watchSignals: { none: { recentWatchCount: { gt: 0 } } } },
                { cleanupEligibleSince: { lte: graceCutoff } },
            ],
        },
        include: { requestRecord: true, watchSignals: true },
        orderBy: [{ cleanupEligibleSince: "asc" }, { updatedAt: "asc" }],
        take: Math.max(0, Math.min(10, automation.maxDeletesPerRun ?? 3)),
    });

    let deleted = 0;
    for (const title of candidates) {
        const mediaId = await service.deleteMedia(title.tmdbId!, title.mediaType === "MOVIE" ? "movie" : "tv");
        const watched = (title.watchSignals[0]?.recentWatchCount ?? 0) > 0;
        await prisma.$transaction([
            prisma.title.update({
                where: { id: title.id },
                data: { inLibrary: false, plexRatingKey: null, status: "EXPIRED", cleanupReason: watched ? `Out of rotation for ${graceDays}+ days` : "Unwatched title fell out of shelf rotation" },
            }),
            prisma.requestRecord.update({ where: { titleId: title.id }, data: { requestStatus: "REMOVED" } }),
            prisma.auditLog.create({
                data: { action: "ROTATION_MEDIA_DELETED", entityType: "Title", entityId: title.id, titleId: title.id, details: { jellyseerrMediaId: mediaId, rule: watched ? "grace-period-expired" : "out-of-rotation-and-zero-watches" } },
            }),
        ]);
        deleted++;
        logger.info("Deleted media that fell out of rotation", { titleId: title.id, tmdbId: title.tmdbId, watched });
    }
    logger.info("Rotation cleanup complete", { candidates: candidates.length, deleted });
}

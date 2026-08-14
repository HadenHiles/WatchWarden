import { prisma, getIntegrationConfig } from "@watchwarden/db";
import { JellyseerrService } from "@watchwarden/integrations";
import { createLogger } from "@watchwarden/config";

const logger = createLogger("rotation-cleanup-job");

/**
 * Removes bot-requested media only when it has fallen out of rotation and has
 * zero recorded watch activity. Titles requested by people are never touched.
 */
export async function rotationCleanupJob(): Promise<void> {
    const setting = await prisma.appSetting.findUnique({ where: { key: "automation.roster" } });
    const automation = (setting?.value ?? {}) as { deleteUnwatched?: boolean; maxDeletesPerRun?: number };
    if (automation.deleteUnwatched !== true) return;

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
            watchSignals: { none: { recentWatchCount: { gt: 0 } } },
        },
        include: { requestRecord: true, watchSignals: true },
        orderBy: { updatedAt: "asc" },
        take: Math.max(0, Math.min(10, automation.maxDeletesPerRun ?? 3)),
    });

    let deleted = 0;
    for (const title of candidates) {
        const mediaId = await service.deleteMedia(title.tmdbId!, title.mediaType === "MOVIE" ? "movie" : "tv");
        await prisma.$transaction([
            prisma.title.update({
                where: { id: title.id },
                data: { inLibrary: false, plexRatingKey: null, status: "EXPIRED", cleanupReason: "Unwatched title fell out of shelf rotation" },
            }),
            prisma.requestRecord.update({ where: { titleId: title.id }, data: { requestStatus: "REMOVED" } }),
            prisma.auditLog.create({
                data: { action: "ROTATION_MEDIA_DELETED", entityType: "Title", entityId: title.id, titleId: title.id, details: { jellyseerrMediaId: mediaId, rule: "out-of-rotation-and-zero-watches" } },
            }),
        ]);
        deleted++;
        logger.info("Deleted unwatched media that fell out of rotation", { titleId: title.id, tmdbId: title.tmdbId });
    }
    logger.info("Rotation cleanup complete", { candidates: candidates.length, deleted });
}

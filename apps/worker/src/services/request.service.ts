import { prisma, getIntegrationConfig } from "@watchwarden/db";
import { JellyseerrService } from "@watchwarden/integrations";
import { createLogger } from "@watchwarden/config";

const logger = createLogger("worker-request-service");

/**
 * Submits a Jellyseerr request for a title not yet in the library.
 * Used by the plex-sync job's autoRequest feature.
 * Skips silently if the title is already in library, already requested, or Jellyseerr isn't configured.
 */
export async function submitRequest(titleId: string): Promise<void> {
    const { jellyseerr } = await getIntegrationConfig();
    if (!jellyseerr.baseUrl || !jellyseerr.apiKey) {
        logger.warn("Jellyseerr not configured — skipping request", { titleId });
        return;
    }

    const title = await prisma.title.findUnique({ where: { id: titleId } });
    if (!title) {
        logger.warn("Title not found for auto-request", { titleId });
        return;
    }
    if (title.inLibrary || title.isRequested) {
        return; // Already handled
    }
    if (!title.tmdbId) {
        logger.warn("Title has no TMDB ID — skipping Jellyseerr request", { titleId });
        return;
    }

    // Avoid duplicate active requests
    const existing = await prisma.requestRecord.findUnique({ where: { titleId } });
    if (existing && !["FAILED", "DECLINED"].includes(existing.requestStatus)) {
        return;
    }

    const service = new JellyseerrService({ baseUrl: jellyseerr.baseUrl, apiKey: jellyseerr.apiKey });
    const botUserId = jellyseerr.botUserId ?? 0;

    await prisma.requestRecord.upsert({
        where: { titleId },
        update: { requestStatus: "PENDING", retryCount: { increment: 1 } },
        create: { titleId, mediaType: title.mediaType, requestStatus: "PENDING", requestedByBot: true },
    });

    const result = await service.requestMedia({
        tmdbId: title.tmdbId,
        tvdbId: title.tvdbId ?? undefined,
        mediaType: title.mediaType === "MOVIE" ? "movie" : "tv",
        botUserId,
    });

    if (result.success && result.request) {
        await prisma.requestRecord.update({
            where: { titleId },
            data: {
                jellyseerrRequestId: result.request.id,
                requestStatus: "PROCESSING",
                overseerrMedia: result.request as object,
            },
        });
        await prisma.title.update({ where: { id: titleId }, data: { isRequested: true, status: "REQUESTED" } });
        logger.info("Auto-requested via Jellyseerr", { titleId, requestId: result.request.id });
    } else if (!result.success) {
        logger.warn("Auto-request failed", { titleId, error: result.error });
        await prisma.requestRecord.update({
            where: { titleId },
            data: { requestStatus: "FAILED", failureReason: result.error ?? "Unknown" },
        });
    }
}

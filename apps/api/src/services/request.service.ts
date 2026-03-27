import { prisma, getIntegrationConfig } from "@watchwarden/db";
import { JellyseerrService } from "@watchwarden/integrations";
import { createLogger } from "@watchwarden/config";
import { AuditService } from "./audit.service";

const logger = createLogger("request-service");
const auditService = new AuditService();

export class RequestService {
    async submitRequest(titleId: string) {
        // Always load credentials from DB so values saved via the setup wizard are used.
        const { jellyseerr: jellyseerrConfig } = await getIntegrationConfig();
        const { baseUrl, apiKey, botUserId } = jellyseerrConfig;

        const jellyseerr =
            baseUrl && apiKey
                ? new JellyseerrService({ baseUrl, apiKey })
                : null;

        if (!jellyseerr) {
            logger.warn("Jellyseerr not configured — requests will be no-ops", { titleId });
        }

        const resolvedBotUserId = botUserId ?? 0;

        const title = await prisma.title.findUnique({ where: { id: titleId } });
        if (!title) throw new Error(`Title ${titleId} not found`);
        if (!title.tmdbId) throw new Error("Title has no TMDB ID — cannot submit to Jellyseerr");

        // If the title is already in the Plex library there is nothing to request.
        if (title.inLibrary) {
            logger.info("Title already in Plex library — skipping Jellyseerr request", { titleId });
            return prisma.requestRecord.upsert({
                where: { titleId },
                update: { requestStatus: "AVAILABLE" },
                create: { titleId, mediaType: title.mediaType, requestStatus: "AVAILABLE", requestedByBot: false },
            });
        }

        // Avoid duplicate requests for titles that already have an active/completed record.
        const existingRecord = await prisma.requestRecord.findUnique({ where: { titleId } });
        if (existingRecord && !["FAILED", "DECLINED"].includes(existingRecord.requestStatus)) {
            logger.info("Request already active — skipping duplicate submission", { titleId, status: existingRecord.requestStatus });
            return existingRecord;
        }

        // Upsert the request record to PENDING
        let record = await prisma.requestRecord.upsert({
            where: { titleId },
            update: { requestStatus: "PENDING", retryCount: { increment: 1 } },
            create: {
                titleId,
                mediaType: title.mediaType,
                requestStatus: "PENDING",
                requestedByBot: true,
            },
        });

        if (!jellyseerr) {
            logger.warn("Jellyseerr not configured — skipping actual request", { titleId });
            return record;
        }

        const mediaType = title.mediaType === "MOVIE" ? "movie" : "tv";

        const result = await jellyseerr.requestMedia({
            tmdbId: title.tmdbId,
            tvdbId: title.tvdbId ?? undefined,
            mediaType,
            botUserId: resolvedBotUserId,
        });

        if (result.success && result.request) {
            record = await prisma.requestRecord.update({
                where: { titleId },
                data: {
                    jellyseerrRequestId: result.request.id,
                    requestStatus: "PROCESSING",
                    overseerrMedia: result.request as object,
                },
            });

            await prisma.title.update({ where: { id: titleId }, data: { isRequested: true, status: "REQUESTED" } });

            await auditService.log({
                action: "JELLYSEERR_REQUEST_SUBMITTED",
                entityType: "RequestRecord",
                entityId: record.id,
                titleId,
                details: { jellyseerrRequestId: result.request.id, mediaType },
            });

            logger.info("Jellyseerr request submitted", { titleId, requestId: result.request.id });
        } else if (result.success) {
            // Jellyseerr reported the media is already available or already has an active request.
            // Mark the record as PROCESSING so we don't re-submit on subsequent approvals.
            record = await prisma.requestRecord.update({
                where: { titleId },
                data: { requestStatus: "PROCESSING" },
            });
            logger.info("Skipped Jellyseerr request — media already available/pending there", { titleId });
        } else {
            record = await prisma.requestRecord.update({
                where: { titleId },
                data: { requestStatus: "FAILED", failureReason: result.error },
            });

            await auditService.log({
                action: "JELLYSEERR_REQUEST_FAILED",
                entityType: "RequestRecord",
                entityId: record.id,
                titleId,
                details: { error: result.error },
            });

            logger.error("Jellyseerr request failed", { titleId, error: result.error });
        }

        return record;
    }
}

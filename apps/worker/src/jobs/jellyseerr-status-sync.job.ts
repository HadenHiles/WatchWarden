import { prisma, getIntegrationConfig } from "@watchwarden/db";
import { JellyseerrService } from "@watchwarden/integrations";
import { createLogger } from "@watchwarden/config";

const logger = createLogger("jellyseerr-status-sync-job");

// Jellyseerr status codes: 1=PENDING, 2=APPROVED, 3=DECLINED, 4=AVAILABLE, 5=PROCESSING
function mapJellyseerrStatus(code: number): string {
    switch (code) {
        case 1: return "PENDING";
        case 2: return "APPROVED";
        case 3: return "DECLINED";
        case 4: return "AVAILABLE";
        case 5: return "PROCESSING";
        default: return "PENDING";
    }
}

async function buildService(): Promise<JellyseerrService | null> {
    const { jellyseerr } = await getIntegrationConfig();
    if (!jellyseerr.baseUrl || !jellyseerr.apiKey) {
        logger.warn("Jellyseerr not configured — skipping status sync");
        return null;
    }
    return new JellyseerrService({ baseUrl: jellyseerr.baseUrl, apiKey: jellyseerr.apiKey });
}

export async function jellyseerrStatusSyncJob(): Promise<void> {
    const service = await buildService();
    if (!service) return;

    const pendingRequests = await prisma.requestRecord.findMany({
        where: {
            requestStatus: { notIn: ["AVAILABLE", "DECLINED", "FAILED"] },
            jellyseerrRequestId: { not: null },
        },
    });

    logger.info(`Syncing ${pendingRequests.length} pending request records`);

    let synced = 0;
    let errors = 0;

    for (const record of pendingRequests) {
        try {
            const jellyseerrRequest = await service.syncRequestStatus(record.jellyseerrRequestId!);
            if (!jellyseerrRequest) continue;

            const newStatus = mapJellyseerrStatus(jellyseerrRequest.status);

            await prisma.requestRecord.update({
                where: { id: record.id },
                data: { requestStatus: newStatus as never },
            });

            if (newStatus === "AVAILABLE") {
                await prisma.title.update({
                    where: { id: record.titleId },
                    data: { inLibrary: true, status: "AVAILABLE" },
                });
                await prisma.suggestion.updateMany({
                    where: { titleId: record.titleId, status: "APPROVED" },
                    data: { status: "FULFILLED" },
                });
            } else if (newStatus === "DECLINED") {
                await prisma.title.update({
                    where: { id: record.titleId },
                    data: { status: "SUGGESTED" },
                });
            }

            synced++;
        } catch (err) {
            logger.warn(`Failed to sync request record ${record.id}`, { error: err });
            errors++;
        }
    }

    logger.info("Jellyseerr status sync complete", { synced, errors });
}

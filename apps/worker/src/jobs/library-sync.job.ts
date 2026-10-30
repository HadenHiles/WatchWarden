import { prisma, getIntegrationConfig } from "@watchwarden/db";
import { JellyseerrClient } from "@watchwarden/integrations";
import { createLogger } from "@watchwarden/config";

const logger = createLogger("library-sync-job");

const JELLYSEERR_STATUS_AVAILABLE = 5;

async function buildClient(): Promise<JellyseerrClient | null> {
    const { jellyseerr } = await getIntegrationConfig();
    if (!jellyseerr.baseUrl || !jellyseerr.apiKey) {
        logger.warn("Jellyseerr not configured — skipping library sync");
        return null;
    }
    return new JellyseerrClient({ baseUrl: jellyseerr.baseUrl, apiKey: jellyseerr.apiKey });
}

export async function librarySyncJob(): Promise<void> {
    const client = await buildClient();
    if (!client) return;

    // Fetch all requests (paginated)
    let allRequests: Awaited<ReturnType<JellyseerrClient["getAllRequests"]>>;
    try {
        allRequests = await client.getAllRequests();
    } catch (err) {
        logger.error("Failed to fetch requests from Jellyseerr", { error: err });
        throw new Error("Complete request inventory unavailable; existing request state preserved");
    }

    const availableTmdbIds = new Set(
        allRequests
            .filter((r) => r.media.status === JELLYSEERR_STATUS_AVAILABLE)
            .map((r) => r.media.tmdbId)
    );
    const knownTmdbIds = new Set(allRequests.map((r) => r.media.tmdbId));

    const requestedTitles = await prisma.title.findMany({
        where: { isRequested: true, tmdbId: { not: null } },
        select: { id: true, tmdbId: true },
    });

    let updated = 0;

    for (const title of requestedTitles) {
        const tmdbId = title.tmdbId!;

        if (availableTmdbIds.has(tmdbId)) {
            await prisma.title.update({
                where: { id: title.id },
                data: { inLibrary: true, isRequested: false, status: "AVAILABLE" },
            });
            updated++;
        } else if (!knownTmdbIds.has(tmdbId)) {
            // Request was deleted or declined
            await prisma.title.update({
                where: { id: title.id },
                data: { isRequested: false },
            });
            updated++;
        }
    }

    logger.info("Library sync complete", { checked: requestedTitles.length, updated });
}

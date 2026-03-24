import { prisma } from "@watchwarden/db";
import { JellyseerrClient } from "@watchwarden/integrations";
import { createLogger } from "@watchwarden/config";

const logger = createLogger("library-sync-job");

const JELLYSEERR_STATUS_AVAILABLE = 5;

function buildClient(): JellyseerrClient | null {
    const baseUrl = process.env.JELLYSEERR_BASE_URL;
    const apiKey = process.env.JELLYSEERR_API_KEY;
    if (!baseUrl || !apiKey) {
        logger.warn("Jellyseerr not configured — skipping library sync");
        return null;
    }
    return new JellyseerrClient({ baseUrl, apiKey });
}

export async function librarySyncJob(): Promise<void> {
    const client = buildClient();
    if (!client) return;

    // Fetch all requests (paginated)
    let allRequests: Array<{ status: number; media: { tmdbId: number; mediaType: string } }> = [];
    try {
        let skip = 0;
        const take = 100;
        while (true) {
            const page = await client.getPendingRequests(take, skip);
            allRequests = allRequests.concat(page.results);
            if (page.results.length < take) break;
            skip += take;
        }
    } catch (err) {
        logger.error("Failed to fetch requests from Jellyseerr", { error: err });
        return;
    }

    const availableTmdbIds = new Set(
        allRequests
            .filter((r) => r.status === JELLYSEERR_STATUS_AVAILABLE)
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

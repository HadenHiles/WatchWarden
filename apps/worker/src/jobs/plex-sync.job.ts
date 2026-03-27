import { prisma, getIntegrationConfig } from "@watchwarden/db";
import { PlexClient, PlexService } from "@watchwarden/integrations";
import { createLogger } from "@watchwarden/config";
import type { Prisma } from "@prisma/client";

const logger = createLogger("plex-sync-job");

// ── SMART collection filter queries ──────────────────────────────────────────
// Smart collections are populated from WatchWarden's scored suggestions +
// family watch history.  The filter field selects which lifecycle status
// determines membership.

const SMART_FILTER_QUERIES: Record<
    string,
    (mediaType: "MOVIE" | "SHOW") => Prisma.TitleWhereInput
> = {
    ACTIVE_TRENDING: (mediaType) => ({
        status: "ACTIVE_TRENDING",
        mediaType,
        inLibrary: true,
        plexRatingKey: { not: null },
    }),
    PINNED: (mediaType) => ({
        isPinned: true,
        mediaType,
        inLibrary: true,
        plexRatingKey: { not: null },
    }),
    APPROVED: (mediaType) => ({
        status: "APPROVED",
        mediaType,
        inLibrary: true,
        plexRatingKey: { not: null },
    }),
};

/**
 * Resolves the target ratingKeys for a SMART collection.
 * Returns titles matching the filter sorted by highest recent trend score.
 */
async function resolveSmartKeys(
    collection: { filter: string; mediaType: string },
): Promise<string[]> {
    const filterFn = SMART_FILTER_QUERIES[collection.filter];
    if (!filterFn) {
        logger.warn("Unknown SMART filter", { filter: collection.filter });
        return [];
    }
    const titles = await prisma.title.findMany({
        where: filterFn(collection.mediaType as "MOVIE" | "SHOW"),
        select: {
            plexRatingKey: true,
            trendSnapshots: { orderBy: { snapshotAt: "desc" }, take: 1 },
        },
    });
    return titles
        .sort((a, b) => {
            const scoreA = a.trendSnapshots[0]?.trendScore ?? 0;
            const scoreB = b.trendSnapshots[0]?.trendScore ?? 0;
            return scoreB - scoreA;
        })
        .map((t) => t.plexRatingKey!)
        .filter(Boolean);
}

/**
 * Resolves the target ratingKeys for a TOP_TRENDING collection.
 * Finds in-library titles streaming on the specified provider, ordered by
 * trend score, capped to maxItems.
 */
async function resolveTopTrendingKeys(
    collection: { streamingProvider: string | null; mediaType: string; maxItems: number },
): Promise<string[]> {
    if (!collection.streamingProvider) {
        logger.warn("TOP_TRENDING collection has no streamingProvider — skipping");
        return [];
    }

    const titles = await prisma.title.findMany({
        where: {
            mediaType: collection.mediaType as "MOVIE" | "SHOW",
            inLibrary: true,
            plexRatingKey: { not: null },
            streamingOn: { has: collection.streamingProvider },
        },
        select: {
            plexRatingKey: true,
            trendSnapshots: { orderBy: { snapshotAt: "desc" }, take: 1 },
        },
    });

    return titles
        .sort((a, b) => {
            const scoreA = a.trendSnapshots[0]?.trendScore ?? 0;
            const scoreB = b.trendSnapshots[0]?.trendScore ?? 0;
            return scoreB - scoreA;
        })
        .slice(0, collection.maxItems > 0 ? collection.maxItems : undefined)
        .map((t) => t.plexRatingKey!)
        .filter(Boolean);
}

/**
 * Syncs all enabled PlexCollection rows to the actual Plex server.
 *
 * For each collection:
 *   1. Resolves target ratingKeys based on collectionType (SMART or TOP_TRENDING).
 *   2. Calls PlexService.syncCollection() to create/update the Plex collection.
 *   3. Updates PlexCollection.plexKey, itemCount, and lastSyncAt.
 */
export async function plexSyncJob(): Promise<void> {
    const { plex } = await getIntegrationConfig();

    if (!plex.baseUrl || !plex.token) {
        logger.warn("Plex not configured — skipping plex-sync");
        return;
    }

    const collections = await prisma.plexCollection.findMany({
        where: { enabled: true },
    });

    if (collections.length === 0) {
        logger.info("No enabled Plex collections configured — skipping plex-sync");
        return;
    }

    const client = new PlexClient({ baseUrl: plex.baseUrl, token: plex.token });
    const service = new PlexService(client);

    let syncedCount = 0;
    let errorCount = 0;

    for (const collection of collections) {
        try {
            let targetKeys: string[];

            if (collection.collectionType === "TOP_TRENDING") {
                targetKeys = await resolveTopTrendingKeys(collection);
            } else {
                // Default to SMART behaviour
                targetKeys = await resolveSmartKeys(collection);
            }

            logger.info("Syncing Plex collection", {
                name: collection.name,
                type: collection.collectionType,
                filter: collection.filter,
                provider: collection.streamingProvider,
                targetCount: targetKeys.length,
            });

            const result = await service.syncCollection({
                sectionId: collection.sectionId,
                collectionName: collection.name,
                mediaType: collection.mediaType === "MOVIE" ? "movie" : "show",
                targetRatingKeys: targetKeys,
                existingCollectionKey: collection.plexKey,
            });

            await prisma.plexCollection.update({
                where: { id: collection.id },
                data: {
                    plexKey: result.collectionRatingKey || null,
                    itemCount: targetKeys.length,
                    lastSyncAt: new Date(),
                },
            });

            logger.info("Plex collection synced", {
                name: collection.name,
                added: result.added,
                removed: result.removed,
                unchanged: result.unchanged,
            });

            syncedCount++;
        } catch (err) {
            logger.error("Failed to sync Plex collection", {
                collectionId: collection.id,
                name: collection.name,
                error: err instanceof Error ? err.message : String(err),
            });
            errorCount++;
        }
    }

    logger.info("Plex sync complete", { synced: syncedCount, errors: errorCount });
}

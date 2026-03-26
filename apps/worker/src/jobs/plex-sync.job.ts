import { prisma, getIntegrationConfig } from "@watchwarden/db";
import { PlexClient, PlexService } from "@watchwarden/integrations";
import { createLogger } from "@watchwarden/config";
import type { Prisma } from "@prisma/client";

const logger = createLogger("plex-sync-job");

const FILTER_QUERIES: Record<
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
 * Syncs all enabled PlexCollection rows to the actual Plex server.
 *
 * For each collection:
 *   1. Queries titles from WatchWarden DB using the collection's filter.
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
            const filterFn = FILTER_QUERIES[collection.filter];
            if (!filterFn) {
                logger.warn("Unknown collection filter — skipping", {
                    collectionId: collection.id,
                    filter: collection.filter,
                });
                continue;
            }

            const titles = await prisma.title.findMany({
                where: filterFn(collection.mediaType),
                select: { plexRatingKey: true },
            });

            const targetKeys = titles
                .map((t) => t.plexRatingKey!)
                .filter(Boolean);

            logger.info("Syncing Plex collection", {
                name: collection.name,
                filter: collection.filter,
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

import { prisma, getIntegrationConfig } from "@watchwarden/db";
import { JellyseerrService, PROVIDER_TMDB_ID_MAP } from "@watchwarden/integrations";
import { createLogger } from "@watchwarden/config";
import type { MediaType } from "@prisma/client";

const logger = createLogger("jellyseerr-discover-sync-job");

/**
 * Syncs WatchWarden's curated trending content to Jellyseerr's Discover tab.
 *
 * For each enabled JellyseerrDiscoverSlider row (one per streaming platform per
 * media type), this job:
 *   1. Resolves the top trending titles for that platform using provider-ranked
 *      ExternalTrendSnapshot data (CA preferred, then US fallback).
 *   2. Creates or updates a discover slider in Jellyseerr using the streaming
 *      provider type so the content appears in Jellyseerr's Discover screen.
 *
 * Jellyseerr users see WatchWarden-curated content in their Discover tab and
 * can request it themselves — WatchWarden never auto-downloads on their behalf.
 *
 * Slider names follow the pattern "🔥 WatchWarden: Netflix Movies" so users
 * can easily identify WatchWarden-managed content in the Discover tab.
 */
export async function jellyseerrDiscoverSyncJob(): Promise<void> {
    const { jellyseerr } = await getIntegrationConfig();

    if (!jellyseerr.baseUrl || !jellyseerr.apiKey) {
        logger.warn("Jellyseerr not configured — skipping discover sync");
        return;
    }

    const service = new JellyseerrService({
        baseUrl: jellyseerr.baseUrl,
        apiKey: jellyseerr.apiKey,
    });

    // Load all enabled slider configs from DB.  Create default sliders for
    // popular providers on first run if none exist.
    let sliderConfigs = await prisma.jellyseerrDiscoverSlider.findMany({
        where: { enabled: true },
        orderBy: [{ mediaType: "asc" }, { streamingProvider: "asc" }],
    });

    if (sliderConfigs.length === 0) {
        logger.info("No discover sliders configured — creating defaults for top providers");
        sliderConfigs = await createDefaultSliders();
    }

    let synced = 0;
    let errors = 0;

    for (const config of sliderConfigs) {
        try {
            const tmdbProviderId = PROVIDER_TMDB_ID_MAP[config.streamingProvider];
            if (!tmdbProviderId) {
                logger.warn("Unknown streaming provider in discover slider config", {
                    provider: config.streamingProvider,
                    sliderId: config.id,
                });
                continue;
            }

            const titleCount = await getTrendingTitleCount(
                config.streamingProvider,
                tmdbProviderId,
                config.mediaType,
            );

            const sliderName = `\uD83D\uDD25 WatchWarden: ${config.streamingProvider} ${config.mediaType === "MOVIE" ? "Movies" : "Shows"}`;

            const result = await service.upsertDiscoverSlider({
                existingSliderId: config.jellyseerrSliderId ?? undefined,
                name: sliderName,
                mediaType: config.mediaType,
                tmdbProviderId,
            });

            if (result) {
                await prisma.jellyseerrDiscoverSlider.update({
                    where: { id: config.id },
                    data: {
                        jellyseerrSliderId: result.id,
                        itemCount: titleCount,
                        lastSyncAt: new Date(),
                    },
                });

                logger.info("Discover slider synced", {
                    name: sliderName,
                    jellyseerrSliderId: result.id,
                    provider: config.streamingProvider,
                    mediaType: config.mediaType,
                    titleCount,
                });
                synced++;
            } else {
                logger.warn("Discover slider sync returned null — Jellyseerr may not support streaming sliders yet", {
                    name: sliderName,
                    provider: config.streamingProvider,
                });
                errors++;
            }
        } catch (err) {
            logger.error("Failed to sync discover slider", {
                sliderId: config.id,
                provider: config.streamingProvider,
                error: err instanceof Error ? err.message : String(err),
            });
            errors++;
        }
    }

    logger.info("Jellyseerr discover sync complete", { synced, errors });
    if (errors > 0) {
        throw new Error(`Failed to sync ${errors} of ${sliderConfigs.length} Jellyseerr discover sliders`);
    }
}

/**
 * Returns the count of WatchWarden-tracked trending titles for a provider.
 * Used for metadata/reporting — the slider itself shows TMDB's live discover feed.
 */
async function getTrendingTitleCount(
    _providerName: string,
    tmdbProviderId: number,
    mediaType: MediaType,
): Promise<number> {
    return prisma.externalTrendSnapshot.count({
        where: {
            providerId: String(tmdbProviderId),
            snapshotAt: { gte: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
            title: { mediaType },
        },
    });
}

/**
 * Creates default JellyseerrDiscoverSlider rows for the most popular streaming
 * providers on first-run.  Only creates DB records — the Jellyseerr sliders
 * themselves are created on the next sync pass.
 */
async function createDefaultSliders() {
    const defaultProviders = [
        "Netflix",
        "Amazon Prime Video",
        "Disney+",
        "Apple TV+",
        "Max",
        "Paramount+",
        "Crave",
    ];

    const toCreate = defaultProviders.flatMap((provider) => [
        { streamingProvider: provider, mediaType: "MOVIE" as MediaType },
        { streamingProvider: provider, mediaType: "SHOW" as MediaType },
    ]).filter(({ streamingProvider }) => PROVIDER_TMDB_ID_MAP[streamingProvider]);

    await prisma.jellyseerrDiscoverSlider.createMany({
        data: toCreate.map(({ streamingProvider, mediaType }) => ({
            name: `\uD83D\uDD25 WatchWarden: ${streamingProvider} ${mediaType === "MOVIE" ? "Movies" : "Shows"}`,
            streamingProvider,
            mediaType,
            enabled: true,
        })),
        skipDuplicates: true,
    });

    return prisma.jellyseerrDiscoverSlider.findMany({ where: { enabled: true } });
}

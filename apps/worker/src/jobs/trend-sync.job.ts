import { prisma } from "@watchwarden/db";
import { buildSourceAdapters } from "@watchwarden/integrations";
import { createLogger } from "@watchwarden/config";
import type { SourceTrendItem } from "@watchwarden/types";

const logger = createLogger("trend-sync-job");

export async function trendSyncJob(): Promise<void> {
    const adapters = buildSourceAdapters({
        TMDB_API_KEY: process.env.TMDB_API_KEY,
        TRAKT_CLIENT_ID: process.env.TRAKT_CLIENT_ID,
    });

    if (adapters.length === 0) {
        logger.warn("No trend adapters configured — skipping trend sync");
        return;
    }

    let totalIngested = 0;

    for (const adapter of adapters) {
        // Check if this source is enabled in DB config
        const sourceConfig = await prisma.sourceConfig.findUnique({
            where: { sourceId: adapter.sourceId },
        });
        if (sourceConfig && !sourceConfig.enabled) {
            logger.debug(`Source ${adapter.sourceId} is disabled — skipping`);
            continue;
        }

        logger.info(`Fetching trending from ${adapter.sourceName}`);
        let items: SourceTrendItem[] = [];

        try {
            items = await adapter.fetchTrending();
            logger.info(`Fetched ${items.length} items from ${adapter.sourceName}`);
        } catch (err) {
            logger.error(`Failed to fetch from ${adapter.sourceName}`, { error: String(err) });
            continue;
        }

        for (const item of items) {
            if (!item.tmdbId && !item.imdbId) {
                logger.debug("Skipping item with no canonical ID", { title: item.title });
                continue;
            }

            // Upsert the canonical Title record
            const title = await upsertTitle(item);

            // Record the trend snapshot
            await prisma.externalTrendSnapshot.create({
                data: {
                    titleId: title.id,
                    source: item.source,
                    region: item.region ?? null,
                    rank: item.rank,
                    trendScore: item.trendScore,
                    rawMetadata: item.rawMetadata as import("@prisma/client").Prisma.InputJsonValue,
                    snapshotAt: new Date(),
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                },
            });

            totalIngested++;
        }

        // Update lastSyncAt on SourceConfig
        await prisma.sourceConfig.upsert({
            where: { sourceId: adapter.sourceId },
            update: { lastSyncAt: new Date() },
            create: {
                sourceId: adapter.sourceId,
                sourceName: adapter.sourceName,
                enabled: true,
                lastSyncAt: new Date(),
            },
        });
    }

    logger.info(`Trend sync complete`, { totalIngested });
}

async function upsertTitle(item: SourceTrendItem) {
    // Try to find existing title by TMDB ID first, then IMDB ID
    const existing = item.tmdbId
        ? await prisma.title.findFirst({ where: { tmdbId: item.tmdbId } })
        : item.imdbId
            ? await prisma.title.findFirst({ where: { imdbId: item.imdbId } })
            : null;

    if (existing) {
        // Refresh metadata if source has richer data
        return prisma.title.update({
            where: { id: existing.id },
            data: {
                posterPath: item.posterPath ?? existing.posterPath,
                backdropPath: item.backdropPath ?? existing.backdropPath,
                overview: item.overview ?? existing.overview,
                genres: item.genres.length > 0 ? item.genres : existing.genres,
            },
        });
    }

    return prisma.title.create({
        data: {
            tmdbId: item.tmdbId,
            imdbId: item.imdbId,
            tvdbId: item.tvdbId,
            title: item.title,
            originalTitle: item.originalTitle,
            mediaType: item.mediaType,
            year: item.year,
            overview: item.overview,
            posterPath: item.posterPath,
            backdropPath: item.backdropPath,
            genres: item.genres,
            status: "CANDIDATE",
        },
    });
}

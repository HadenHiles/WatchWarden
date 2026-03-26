import { prisma, getIntegrationConfig } from "@watchwarden/db";
import { buildSourceAdapters } from "@watchwarden/integrations";
import { createLogger } from "@watchwarden/config";
import type { SourceTrendItem } from "@watchwarden/types";
import axios from "axios";

const logger = createLogger("trend-sync-job");

const TMDB_BASE = "https://api.themoviedb.org/3";
// Preferred region order: CA first, US as fallback
const PROVIDER_REGIONS = ["CA", "US"] as const;

// ─── Watch provider enrichment ────────────────────────────────────────────────

interface TmdbWatchProvider {
    provider_id: number;
    provider_name: string;
    logo_path: string;
}
interface TmdbWatchProvidersResponse {
    results: Partial<Record<string, { flatrate?: TmdbWatchProvider[]; free?: TmdbWatchProvider[] }>>;
}

async function fetchStreamingProviders(
    tmdbId: number,
    mediaType: "MOVIE" | "SHOW",
    apiKey: string
): Promise<string[]> {
    try {
        const segment = mediaType === "MOVIE" ? "movie" : "tv";
        const { data } = await axios.get<TmdbWatchProvidersResponse>(
            `${TMDB_BASE}/${segment}/${tmdbId}/watch/providers`,
            { params: { api_key: apiKey }, timeout: 8_000 }
        );
        for (const region of PROVIDER_REGIONS) {
            const entry = data.results[region];
            if (!entry) continue;
            const providers = [...(entry.flatrate ?? []), ...(entry.free ?? [])];
            if (providers.length > 0) {
                return providers.map((p) => p.provider_name);
            }
        }
    } catch {
        // Non-fatal — provider lookup is best-effort
    }
    return [];
}

export async function trendSyncJob(): Promise<void> {
    const { sources } = await getIntegrationConfig();
    const adapters = buildSourceAdapters({
        TMDB_API_KEY: sources.tmdbApiKey ?? undefined,
        TRAKT_CLIENT_ID: sources.traktClientId ?? undefined,
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
            const title = await upsertTitle(item, sources.tmdbApiKey ?? undefined);

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

async function upsertTitle(item: SourceTrendItem, tmdbApiKey?: string) {
    // Fetch streaming providers (CA preferred, US fallback)
    const streamingOn = item.tmdbId && tmdbApiKey
        ? await fetchStreamingProviders(item.tmdbId, item.mediaType, tmdbApiKey)
        : [];

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
                ...(streamingOn.length > 0 && { streamingOn }),
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
            streamingOn,
            status: "CANDIDATE",
        },
    });
}

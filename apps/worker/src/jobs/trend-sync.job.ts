import { prisma, getIntegrationConfig } from "@watchwarden/db";
import { buildSourceAdapters } from "@watchwarden/integrations";
import { passesOriginCountryFilter } from "@watchwarden/scoring";
import { createLogger } from "@watchwarden/config";
import type { SourceTrendItem } from "@watchwarden/types";
import axios from "axios";

const logger = createLogger("trend-sync-job");

const TMDB_BASE = "https://api.themoviedb.org/3";
// Preferred region order: CA first, US as fallback
const PROVIDER_REGIONS = ["CA", "US"] as const;

interface DiscoveryFilters {
    excludedGenres: string[];
    excludeAnime: boolean;
    minimumPopularity: number;
    allowedOriginCountries: string[];
}

async function getDiscoveryFilters(): Promise<DiscoveryFilters> {
    const setting = await prisma.appSetting.findUnique({ where: { key: "discovery.filters" } });
    const value = (setting?.value ?? {}) as Record<string, unknown>;
    return {
        excludedGenres: Array.isArray(value.excludedGenres)
            ? value.excludedGenres.filter((genre): genre is string => typeof genre === "string")
            : [],
        excludeAnime: value.excludeAnime === true,
        minimumPopularity: typeof value.minimumPopularity === "number" ? Math.max(0, value.minimumPopularity) : 0,
        allowedOriginCountries: Array.isArray(value.allowedOriginCountries)
            ? value.allowedOriginCountries.filter((country): country is string => typeof country === "string")
            : [],
    };
}

function isExcluded(item: SourceTrendItem, filters: DiscoveryFilters): boolean {
    if (item.genres.some((genre) => filters.excludedGenres.includes(genre))) return true;
    const raw = item.rawMetadata as Record<string, unknown>;
    const originalLanguage = raw.original_language ?? raw.originalLanguage;
    const originCountry = raw.origin_country ?? raw.originCountry;
    const originCountries = Array.isArray(originCountry)
        ? originCountry.filter((country): country is string => typeof country === "string")
        : [];
    if (!passesOriginCountryFilter(originCountries, filters.allowedOriginCountries)) return true;
    const isJapanese = originalLanguage === "ja" || (Array.isArray(originCountry) && originCountry.includes("JP"));
    if (filters.excludeAnime && item.genres.includes("Animation") && isJapanese) return true;
    const popularity = raw.popularity;
    return typeof popularity === "number" && popularity < filters.minimumPopularity;
}

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
    const discoveryFilters = await getDiscoveryFilters();
    const adapters = buildSourceAdapters({
        TMDB_API_KEY: sources.tmdbApiKey ?? undefined,
    });

    if (adapters.length === 0) {
        throw new Error("No trend adapters configured; fresh trend data is unavailable");
    }

    let totalIngested = 0;
    let failedSources = 0;
    let attemptedSources = 0;
    const providerCache = new Map<string, string[]>();

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
        attemptedSources++;
        let items: SourceTrendItem[] = [];

        try {
            items = await adapter.fetchTrending();
            logger.info(`Fetched ${items.length} items from ${adapter.sourceName}`);
        } catch (err) {
            logger.error(`Failed to fetch from ${adapter.sourceName}`, { error: String(err) });
            failedSources++;
            continue;
        }
        if (items.length === 0) {
            failedSources++;
            logger.warn("Trend source returned no items; not advancing source success", { source: adapter.sourceId });
            continue;
        }

        const snapshotAt = new Date();
        const snapshots: import("@prisma/client").Prisma.ExternalTrendSnapshotCreateManyInput[] = [];
        for (const item of items) {
            const raw = item.rawMetadata as Record<string, unknown>;
            if (discoveryFilters.allowedOriginCountries.length && item.tmdbId
                && !Array.isArray(raw.origin_country) && !Array.isArray(raw.originCountry)) {
                try {
                    const segment = item.mediaType === "MOVIE" ? "movie" : "tv";
                    const details = await axios.get(`${TMDB_BASE}/${segment}/${item.tmdbId}`, {
                        params: { api_key: sources.tmdbApiKey }, timeout: 8000,
                    });
                    raw.origin_country = details.data.origin_country
                        ?? details.data.production_countries?.map((country: { iso_3166_1: string }) => country.iso_3166_1);
                    raw.original_language ??= details.data.original_language;
                    raw.popularity ??= details.data.popularity;
                } catch { throw new Error(`Origin metadata unavailable for source ${adapter.sourceId}; previous batch preserved`); }
            }
            if (isExcluded(item, discoveryFilters)) {
                logger.debug("Skipping title excluded by global discovery filters", { title: item.title });
                continue;
            }
            if (!item.tmdbId && !item.imdbId) {
                logger.debug("Skipping item with no canonical ID", { title: item.title });
                continue;
            }

            // Upsert the canonical Title record
            const cacheKey = `${item.mediaType}:${item.tmdbId}`;
            let providers = providerCache.get(cacheKey);
            if (!providers) {
                providers = item.tmdbId && sources.tmdbApiKey
                    ? await fetchStreamingProviders(item.tmdbId, item.mediaType, sources.tmdbApiKey) : [];
                providerCache.set(cacheKey, providers);
            }
            const title = await upsertTitle(item, providers);

            snapshots.push({
                    titleId: title.id,
                    source: item.source,
                    region: item.region ?? null,
                    rank: item.rank,
                    trendScore: item.trendScore,
                    providerId: item.providerId ?? null,
                    providerRank: item.providerRank ?? null,
                    rawMetadata: item.rawMetadata as import("@prisma/client").Prisma.InputJsonValue,
                    snapshotAt,
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            });

            totalIngested++;
        }

        // Update lastSyncAt on SourceConfig
        await prisma.$transaction([
            prisma.externalTrendSnapshot.createMany({ data: snapshots }),
            prisma.appSetting.upsert({
                where: { key: `source.batch.${adapter.sourceId}` },
                update: { value: { source: adapter.sourceId, snapshotAt: snapshotAt.toISOString(), completedAt: new Date().toISOString(), count: snapshots.length } },
                create: { key: `source.batch.${adapter.sourceId}`, category: "source-evidence",
                    value: { source: adapter.sourceId, snapshotAt: snapshotAt.toISOString(), completedAt: new Date().toISOString(), count: snapshots.length } },
            }),
            prisma.sourceConfig.upsert({
            where: { sourceId: adapter.sourceId },
            update: { lastSyncAt: new Date(), sourceName: adapter.sourceName },
            create: {
                sourceId: adapter.sourceId,
                sourceName: adapter.sourceName,
                enabled: true,
                lastSyncAt: new Date(),
            },
            }),
        ]);
    }

    logger.info(`Trend sync complete`, { totalIngested });
    if (failedSources > 0) throw new Error(`${failedSources} of ${attemptedSources} trend sources failed or returned empty data`);
}

async function upsertTitle(item: SourceTrendItem, streamingOn: string[]) {

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
                releaseDate: item.releaseDate ? new Date(item.releaseDate) : existing.releaseDate,
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
            releaseDate: item.releaseDate ? new Date(item.releaseDate) : null,
            overview: item.overview,
            posterPath: item.posterPath,
            backdropPath: item.backdropPath,
            genres: item.genres,
            streamingOn,
            status: "CANDIDATE",
        },
    });
}

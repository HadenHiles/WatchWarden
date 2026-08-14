import { prisma, getIntegrationConfig } from "@watchwarden/db";
import { PlexClient, PlexService, PROVIDER_TMDB_ID_MAP } from "@watchwarden/integrations";
import { createLogger } from "@watchwarden/config";
import type { Prisma } from "@prisma/client";
import { culturalHeat, diversifyShelf, rankProviderHistory, resolvePlatformSnapshots, selectPublishedShelfIds, selectStreamingEditorialTitles } from "@watchwarden/scoring";
import { submitRequest } from "../services/request.service";

const logger = createLogger("plex-sync-job");

// ── SMART collection filter queries ──────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Interleaves multiple ranked arrays round-robin.
 * E.g. [[A1,A2],[B1,B2],[C1,C2]] → [A1,B1,C1,A2,B2,C2]
 * Already-seen IDs are deduped.
 */
function interleave<T>(lists: T[][]): T[] {
    const result: T[] = [];
    const maxLen = Math.max(0, ...lists.map((l) => l.length));
    for (let i = 0; i < maxLen; i++) {
        for (const list of lists) {
            if (i < list.length) result.push(list[i]);
        }
    }
    return result;
}

/**
 * Applies manual inclusion/exclusion overrides to a set of title IDs.
 * Returns the final ordered list with manual additions appended at the end.
 */
async function applyManualOverrides(
    computedTitleIds: string[],
    collectionId: string,
): Promise<string[]> {
    const overrides = await prisma.plexCollectionTitle.findMany({
        where: { collectionId },
        include: {
            title: { select: { id: true, plexRatingKey: true, inLibrary: true } },
        },
    });

    const excluded = new Set(
        overrides.filter((o) => o.manuallyExcluded).map((o) => o.titleId),
    );
    const manuallyAdded = overrides
        .filter((o) => o.manuallyAdded && !o.manuallyExcluded)
        .map((o) => o.title)
        .filter((t) => t.inLibrary && t.plexRatingKey)
        .map((t) => t.id);

    const filtered = computedTitleIds.filter((id) => !excluded.has(id));

    // Append manual additions that aren't already in the list
    const existing = new Set(filtered);
    for (const id of manuallyAdded) {
        if (!existing.has(id)) filtered.push(id);
    }
    return filtered;
}

/**
 * Resolves the target ratingKeys for a SMART collection.
 */
async function resolveSmartKeys(
    collection: { id: string; filter: string; mediaType: string },
): Promise<string[]> {
    const filterFn = SMART_FILTER_QUERIES[collection.filter];
    if (!filterFn) {
        logger.warn("Unknown SMART filter", { filter: collection.filter });
        return [];
    }
    const titles = await prisma.title.findMany({
        where: filterFn(collection.mediaType as "MOVIE" | "SHOW"),
        select: {
            id: true,
            plexRatingKey: true,
            trendSnapshots: { orderBy: { snapshotAt: "desc" }, take: 1 },
        },
    });
    const sorted = titles
        .sort((a, b) => {
            const scoreA = a.trendSnapshots[0]?.trendScore ?? 0;
            const scoreB = b.trendSnapshots[0]?.trendScore ?? 0;
            return scoreB - scoreA;
        })
        .map((t) => t.id);

    const withOverrides = await applyManualOverrides(sorted, collection.id);

    // Re-fetch plexRatingKeys after overrides are applied
    const keys = await prisma.title.findMany({
        where: { id: { in: withOverrides }, plexRatingKey: { not: null } },
        select: { id: true, plexRatingKey: true },
    });
    const keyMap = new Map(keys.map((k) => [k.id, k.plexRatingKey!]));
    return withOverrides.map((id) => keyMap.get(id)).filter(Boolean) as string[];
}

/**
 * Resolves the target ratingKeys for a TOP_TRENDING collection.
 *
 * For each streaming provider in the collection:
 *   1. Look up titles ranked on that provider using per-provider snapshots.
 *   2. Cap to maxItemsPerProvider.
 *
 * Results are interleaved by provider rank (Netflix#1, Prime#1, Disney#1, Netflix#2, …)
 * so the collection order represents rank, not provider grouping.
 */
async function resolveTopTrendingKeys(
    collection: {
        id: string;
        streamingProviders: string[];
        mediaType: string;
        maxItemsPerProvider: number;
    }, regionConfig = { primaryRegion: "CA", fallbackRegion: "US" },
): Promise<string[]> {
    if (!collection.streamingProviders.length) {
        logger.warn("TOP_TRENDING collection has no streamingProviders — skipping");
        return [];
    }

    const cap = collection.maxItemsPerProvider > 0 ? collection.maxItemsPerProvider : 10;
    const perProviderLists: string[][] = [];

    for (const providerName of collection.streamingProviders) {
        // Look up TMDB provider ID for this provider name
        const tmdbProviderId = PROVIDER_TMDB_ID_MAP[providerName];

        let titleIds: string[];

        if (tmdbProviderId) {
            // Use provider-specific snapshots (from TmdbProviderDiscoveryAdapter)
            // Try CA region first, fall back to US
            const editorialNetflix = providerName === "Netflix";
            const snapshots = await prisma.externalTrendSnapshot.findMany({
                where: {
                    providerId: String(tmdbProviderId),
                    providerRank: { not: null },
                    title: {
                        mediaType: collection.mediaType as "MOVIE" | "SHOW",
                        inLibrary: true,
                        plexRatingKey: { not: null },
                    },
                    snapshotAt: { gte: new Date(Date.now() - (editorialNetflix ? 45 : 8) * 24 * 60 * 60 * 1000) },
                },
                select: {
                    titleId: true,
                    providerRank: true,
                    region: true,
                    snapshotAt: true,
                    rawMetadata: true,
                    title: { select: { plexRatingKey: true, releaseDate: true, streamingOn: true } },
                },
            });
            const recentCutoff = Date.now() - 8 * 24 * 60 * 60 * 1000;
            const currentSnapshots = snapshots.filter((snapshot) => snapshot.snapshotAt.getTime() >= recentCutoff);
            const resolved = resolvePlatformSnapshots(currentSnapshots.map((s) => ({
                titleId: s.titleId,
                providerRank: s.providerRank!,
                region: s.region,
                snapshotAt: s.snapshotAt,
            })), { freshnessHalfLifeHours: 72, maxRank: 100, ...regionConfig });
            if (editorialNetflix) {
                const candidates = resolved.map((item) => {
                    const history = snapshots.filter((snapshot) => snapshot.titleId === item.titleId)
                        .sort((a, b) => b.snapshotAt.getTime() - a.snapshotAt.getTime());
                    const current = history.find((snapshot) => snapshot.region === item.region) ?? history[0];
                    const oldest = history[history.length - 1];
                    const raw = (current?.rawMetadata ?? {}) as Record<string, unknown>;
                    const lastAirDate = typeof raw.lastAirDate === "string" && raw.lastAirDate ? new Date(raw.lastAirDate) : null;
                    return {
                        id: item.titleId,
                        providerRank: item.providerRank,
                        firstAirDate: current?.title.releaseDate ?? null,
                        lastAirDate,
                        isNetflixOriginal: raw.isNetflixOriginal === true || (current?.title.streamingOn.length === 1 && /netflix/i.test(current.title.streamingOn[0] ?? "")),
                        rankMomentum: Math.max(0, (oldest?.providerRank ?? item.providerRank) - item.providerRank),
                        stableDays: oldest ? (current!.snapshotAt.getTime() - oldest.snapshotAt.getTime()) / 86_400_000 : 0,
                    };
                });
                titleIds = selectStreamingEditorialTitles(candidates, cap).map((item) => item.id);
            } else {
                titleIds = resolved.slice(0, cap).map((item) => item.titleId);
            }
        } else {
            // Fall back: filter by streamingOn provider name, sort by overall trend score
            const titles = await prisma.title.findMany({
                where: {
                    mediaType: collection.mediaType as "MOVIE" | "SHOW",
                    inLibrary: true,
                    plexRatingKey: { not: null },
                    streamingOn: { has: providerName },
                },
                select: {
                    id: true,
                    trendSnapshots: { orderBy: { snapshotAt: "desc" }, take: 1 },
                },
            });
            titleIds = titles
                .sort((a, b) => (b.trendSnapshots[0]?.trendScore ?? 0) - (a.trendSnapshots[0]?.trendScore ?? 0))
                .slice(0, cap)
                .map((t) => t.id);
        }

        if (titleIds.length > 0) perProviderLists.push(titleIds);
    }

    // Interleave: [Netflix#1, Prime#1, Disney#1, Netflix#2, Prime#2, Disney#2, ...]
    const interleavedIds = interleave(perProviderLists);

    // Deduplicate while preserving order
    const dedupedIds: string[] = [];
    const seen = new Set<string>();
    for (const id of interleavedIds) {
        if (!seen.has(id)) {
            seen.add(id);
            dedupedIds.push(id);
        }
    }

    const withOverrides = await applyManualOverrides(dedupedIds, collection.id);

    // Fetch plexRatingKeys
    const keys = await prisma.title.findMany({
        where: { id: { in: withOverrides }, plexRatingKey: { not: null } },
        select: { id: true, plexRatingKey: true },
    });
    const keyMap = new Map(keys.map((k) => [k.id, k.plexRatingKey!]));
    return withOverrides.map((id) => keyMap.get(id)).filter(Boolean) as string[];
}

async function resolveCulturalKeys(
    collection: { id: string; mediaType: string; maxItems: number; streamingProviders: string[] },
    providerNames: string[],
    candidateLimit = collection.maxItems,
): Promise<string[]> {
    const titles = await prisma.title.findMany({
        where: { mediaType: collection.mediaType as "MOVIE" | "SHOW", inLibrary: true, plexRatingKey: { not: null } },
        select: { id: true, plexRatingKey: true, trendSnapshots: { where: { providerId: null }, orderBy: { snapshotAt: "desc" }, take: 20 } },
    });
    const now = new Date();
    const globalLane = titles.map((title) => {
        const latestBySource = [...new Map(title.trendSnapshots
            .filter((s) => s.source.startsWith("tmdb_"))
            .map((s) => [s.source, s])).values()];
        const newest = latestBySource[0];
        return { title, score: newest ? culturalHeat({
            tmdbTrends: latestBySource.map((s) => s.trendScore),
            rank: Math.min(...latestBySource.map((s) => s.rank ?? 100)),
            snapshotAt: newest.snapshotAt,
            region: newest.region,
        }, now) : 0 };
    }).sort((a, b) => b.score - a.score || a.title.id.localeCompare(b.title.id))
        .map((x) => x.title.id);

    // A broad "right now" shelf should cover the selected services, not merely
    // mirror TMDB's global chart. Aggregate each service's daily rankings over
    // three weeks, then round-robin the provider lanes with the global lane.
    const providerLanes: string[][] = [];
    const since = new Date(Date.now() - 21 * 86_400_000);
    for (const providerName of providerNames) {
        const providerId = PROVIDER_TMDB_ID_MAP[providerName];
        if (!providerId) continue;
        const snapshots = await prisma.externalTrendSnapshot.findMany({
            where: {
                providerId: String(providerId), providerRank: { not: null }, snapshotAt: { gte: since },
                title: { mediaType: collection.mediaType as "MOVIE" | "SHOW", inLibrary: true, plexRatingKey: { not: null } },
            },
            select: { titleId: true, providerRank: true, snapshotAt: true },
        });
        const lane = rankProviderHistory(snapshots.map((snapshot) => ({
            titleId: snapshot.titleId, providerRank: snapshot.providerRank!, snapshotAt: snapshot.snapshotAt,
        })), now);
        if (lane.length) providerLanes.push(lane);
    }
    const ordered = interleave([globalLane, ...providerLanes]);
    const deduped = [...new Set(ordered)].slice(0, candidateLimit);
    const ids = await applyManualOverrides(deduped, collection.id);
    const map = new Map(titles.map((t) => [t.id, t.plexRatingKey!]));
    return ids.map((id) => map.get(id)).filter(Boolean) as string[];
}

async function resolveRecentlyReleasedKeys(
    collection: { id: string; mediaType: string; maxItems: number; releaseWindowDays: number },
    backfill = { enabled: true, maxDays: 365 },
): Promise<string[]> {
    if (collection.mediaType !== "MOVIE") return [];
    const lookbackDays = backfill.enabled
        ? Math.max(collection.releaseWindowDays, backfill.maxDays)
        : collection.releaseWindowDays;
    const since = new Date(Date.now() - lookbackDays * 86_400_000);
    const titles = await prisma.title.findMany({
        where: { mediaType: "MOVIE", inLibrary: true, plexRatingKey: { not: null }, releaseDate: { gte: since, lte: new Date() } },
        orderBy: [{ releaseDate: "desc" }, { id: "asc" }], take: collection.maxItems,
        select: { id: true, plexRatingKey: true },
    });
    const ids = await applyManualOverrides(titles.map((t) => t.id), collection.id);
    const all = await prisma.title.findMany({ where: { id: { in: ids }, plexRatingKey: { not: null } }, select: { id: true, plexRatingKey: true } });
    const map = new Map(all.map((t) => [t.id, t.plexRatingKey!]));
    return ids.map((id) => map.get(id)).filter(Boolean) as string[];
}

async function resolveAutoRequestIds(collection: {
    mediaType: string; shelfType: string; provider: string | null;
    streamingProviders: string[]; maxItems: number; maxItemsPerProvider: number;
}): Promise<string[]> {
    const baseTitle: Prisma.TitleWhereInput = {
        mediaType: collection.mediaType as "MOVIE" | "SHOW",
        inLibrary: false,
        isRequested: false,
        status: { notIn: ["REJECTED", "EXPIRED"] },
    };
    const providerName = collection.provider ?? collection.streamingProviders[0];
    const providerId = providerName ? PROVIDER_TMDB_ID_MAP[providerName] : undefined;
    if (providerId) {
        const snapshots = await prisma.externalTrendSnapshot.findMany({
            where: {
                providerId: String(providerId), providerRank: { not: null },
                snapshotAt: { gte: new Date(Date.now() - 8 * 86_400_000) },
                title: baseTitle,
            },
            orderBy: [{ providerRank: "asc" }, { snapshotAt: "desc" }],
            select: { titleId: true, providerRank: true, snapshotAt: true, rawMetadata: true, title: { select: { releaseDate: true, streamingOn: true } } },
        });
        if (providerName === "Netflix") {
            const latest = new Map<string, typeof snapshots[number]>();
            for (const snapshot of snapshots) {
                const current = latest.get(snapshot.titleId);
                if (!current || snapshot.snapshotAt > current.snapshotAt) latest.set(snapshot.titleId, snapshot);
            }
            const candidates = [...latest.values()].map((snapshot) => {
                const raw = (snapshot.rawMetadata ?? {}) as Record<string, unknown>;
                return {
                    id: snapshot.titleId,
                    providerRank: snapshot.providerRank!,
                    firstAirDate: snapshot.title.releaseDate,
                    lastAirDate: typeof raw.lastAirDate === "string" && raw.lastAirDate ? new Date(raw.lastAirDate) : null,
                    isNetflixOriginal: raw.isNetflixOriginal === true || (snapshot.title.streamingOn.length === 1 && /netflix/i.test(snapshot.title.streamingOn[0] ?? "")),
                    rankMomentum: 0,
                    stableDays: 0,
                };
            });
            return selectStreamingEditorialTitles(candidates, collection.maxItemsPerProvider || 10).map((item) => item.id);
        }
        return [...new Set(snapshots.map((snapshot) => snapshot.titleId))]
            .slice(0, collection.maxItemsPerProvider || 10);
    }
    const suggestions = await prisma.suggestion.findMany({
        where: { status: "PENDING", title: baseTitle },
        orderBy: { finalScore: "desc" },
        take: collection.maxItems || 20,
        select: { titleId: true },
    });
    return suggestions.map((suggestion) => suggestion.titleId);
}

/**
 * Syncs all enabled PlexCollection rows to the actual Plex server.
 * WatchWarden manages collections for "Top 10 on Platform" visibility only —
 * it never auto-requests or downloads media through this job.
 */
export async function plexSyncJob(): Promise<void> {
    const { plex } = await getIntegrationConfig();

    if (!plex.baseUrl || !plex.token) {
        logger.warn("Plex not configured — skipping plex-sync");
        return;
    }

    const collections = await prisma.plexCollection.findMany({ orderBy: [{ homePriority: "asc" }, { id: "asc" }] });

    if (collections.length === 0) {
        logger.info("No Plex collections configured — skipping plex-sync");
        return;
    }

    const client = new PlexClient({ baseUrl: plex.baseUrl, token: plex.token });
    const service = new PlexService(client);
    const homeSetting = await prisma.appSetting.findUnique({ where: { key: "plexHome" } });
    const homeConfig = (homeSetting?.value ?? {}) as { shelfLimit?: number; primaryRegion?: string; fallbackRegion?: string; manageRecommendations?: boolean; backfillRecentReleases?: boolean; recentlyReleasedBackfillDays?: number };
    const publishedIds = new Set(selectPublishedShelfIds(collections, homeConfig.shelfLimit ?? 6));
    const configuredProviders = [...new Set(collections.map((item) => item.provider).filter((provider): provider is string => Boolean(provider)))];
    // Netflix is the more specific editorial promise, so it gets first claim on titles.
    const netflixKeysByMedia = new Map<string, string[]>();
    for (const collection of collections.filter((item) =>
        item.enabled && publishedIds.has(item.id)
        && item.shelfType === "PROVIDER_TRENDING" && item.provider === "Netflix")) {
        netflixKeysByMedia.set(collection.mediaType, await resolveTopTrendingKeys(collection, {
            primaryRegion: homeConfig.primaryRegion ?? "CA",
            fallbackRegion: homeConfig.fallbackRegion ?? "US",
        }));
    }

    if (homeConfig.manageRecommendations === true) {
        for (const sectionId of new Set(collections.filter((item) => item.enabled).map((item) => item.sectionId))) {
            const suppressed = await client.suppressBuiltInRecommendations(sectionId);
            logger.info("WatchWarden recommendation management applied", { sectionId, suppressed });
        }
    }

    const automationSetting = await prisma.appSetting.findUnique({ where: { key: "automation.roster" } });
    const automation = (automationSetting?.value ?? {}) as { enabled?: boolean; maxNewRequestsPerRun?: number };
    if (automation.enabled === true) {
        const candidateLists: string[][] = [];
        for (const collection of collections.filter((item) => item.enabled && item.autoRequest)) {
            candidateLists.push(await resolveAutoRequestIds(collection));
        }
        const candidates = interleave(candidateLists);
        const cap = Math.max(0, Math.min(20, automation.maxNewRequestsPerRun ?? 5));
        for (const titleId of [...new Set(candidates)].slice(0, cap)) await submitRequest(titleId);
        logger.info("Auto-request roster evaluated", { candidates: new Set(candidates).size, requestCap: cap });
    }

    let syncedCount = 0;
    let errorCount = 0;

    for (const collection of collections) {
        try {
            if (!collection.enabled) {
                if (collection.plexKey) {
                    await service.syncCollectionRecommendation({ sectionId: collection.sectionId, collectionId: collection.plexKey, publishToHome: false, publishToSharedHome: false });
                }
                continue;
            }
            let targetKeys: string[];
            if (collection.shelfType === "CULTURAL_TRENDING") {
                const providers = collection.streamingProviders.length ? collection.streamingProviders : configuredProviders;
                const candidates = await resolveCulturalKeys(collection, providers, collection.maxItems * 4);
                targetKeys = diversifyShelf(candidates, netflixKeysByMedia.get(collection.mediaType) ?? [], collection.maxItems, 0);
            } else if (collection.shelfType === "RECENTLY_RELEASED") {
                targetKeys = await resolveRecentlyReleasedKeys(collection, {
                    enabled: homeConfig.backfillRecentReleases !== false,
                    maxDays: homeConfig.recentlyReleasedBackfillDays ?? 365,
                });
            } else if (collection.shelfType === "PROVIDER_TRENDING" || collection.collectionType === "TOP_TRENDING") {
                targetKeys = collection.provider === "Netflix" && netflixKeysByMedia.has(collection.mediaType)
                    ? netflixKeysByMedia.get(collection.mediaType)!
                    : await resolveTopTrendingKeys(collection, { primaryRegion: homeConfig.primaryRegion ?? "CA", fallbackRegion: homeConfig.fallbackRegion ?? "US" });
            } else {
                targetKeys = await resolveSmartKeys(collection);
            }

            logger.info("Syncing Plex collection", {
                name: collection.name,
                type: collection.collectionType,
                filter: collection.filter,
                providers: collection.streamingProviders,
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

            if (result.collectionRatingKey) {
                const publish = publishedIds.has(collection.id);
                await service.syncCollectionRecommendation({
                    sectionId: collection.sectionId,
                    collectionId: result.collectionRatingKey,
                    publishToHome: publish,
                    publishToSharedHome: publish && collection.publishToSharedHome,
                });
                logger.info(publish ? "Home shelf published" : "Home shelf unpublished", {
                    collectionId: collection.id, plexKey: result.collectionRatingKey,
                    shelfType: collection.shelfType, provider: collection.provider,
                    itemCount: targetKeys.length, published: publish,
                });
                if (collection.publishToHome && !publish) logger.info("Shelf skipped due to Home limit", { collectionId: collection.id });
            }

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
    if (errorCount > 0) {
        throw new Error(`Failed to sync ${errorCount} of ${collections.length} Plex collections`);
    }
}

import { prisma, getIntegrationConfig } from "@watchwarden/db";
import { PlexClient, PlexService, PROVIDER_TMDB_ID_MAP } from "@watchwarden/integrations";
import { createLogger } from "@watchwarden/config";
import type { Prisma } from "@prisma/client";

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
    },
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
            const snapshots = await prisma.externalTrendSnapshot.findMany({
                where: {
                    providerId: String(tmdbProviderId),
                    providerRank: { not: null },
                    title: {
                        mediaType: collection.mediaType as "MOVIE" | "SHOW",
                        inLibrary: true,
                        plexRatingKey: { not: null },
                    },
                    // Use snapshots from the last 8 days (gives ~1 weekly cycle of freshness)
                    snapshotAt: { gte: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
                },
                orderBy: [
                    // Prefer CA snapshots, then by providerRank
                    { region: "desc" }, // "US" < "CA" alphabetically — so this is CA first
                    { providerRank: "asc" },
                ],
                take: cap * 3, // over-fetch to account for deduplication
                select: {
                    titleId: true,
                    providerRank: true,
                    region: true,
                    title: { select: { plexRatingKey: true } },
                },
            });

            // Deduplicate: keep best (lowest) rank per title, preferring CA over US
            const seen = new Map<string, { rank: number; region: string }>();
            for (const snap of snapshots) {
                const existing = seen.get(snap.titleId);
                if (!existing) {
                    seen.set(snap.titleId, { rank: snap.providerRank!, region: snap.region ?? "US" });
                } else {
                    const caPrefer = snap.region === "CA" && existing.region !== "CA";
                    const betterRank = (snap.providerRank ?? 999) < existing.rank;
                    if (caPrefer || betterRank) {
                        seen.set(snap.titleId, { rank: snap.providerRank!, region: snap.region ?? "US" });
                    }
                }
            }

            titleIds = Array.from(seen.entries())
                .sort(([, a], [, b]) => a.rank - b.rank)
                .slice(0, cap)
                .map(([id]) => id);
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

/**
 * Auto-requests titles in a collection via Jellyseerr when collection.autoRequest is true.
 * Only submits requests for titles not yet in the library and not already requested.
 */
async function autoRequestCollectionTitles(
    collection: { id: string; streamingProviders: string[]; mediaType: string; maxItemsPerProvider: number },
): Promise<void> {
    const { jellyseerr } = await getIntegrationConfig();
    if (!jellyseerr.baseUrl || !jellyseerr.apiKey) {
        logger.warn("Jellyseerr not configured — skipping auto-request for collection", { collectionId: collection.id });
        return;
    }

    // Find titles in this collection that need requesting
    // We look at the same set the sync would use, but filtered to NOT in library
    const providerTmdbIds = collection.streamingProviders
        .map((name) => PROVIDER_TMDB_ID_MAP[name])
        .filter(Boolean)
        .map(String);

    const whereClause = providerTmdbIds.length > 0
        ? {
            mediaType: collection.mediaType as "MOVIE" | "SHOW",
            inLibrary: false,
            isRequested: false,
            trendSnapshots: {
                some: {
                    providerId: { in: providerTmdbIds },
                    snapshotAt: { gte: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
                },
            },
        }
        : {
            mediaType: collection.mediaType as "MOVIE" | "SHOW",
            inLibrary: false,
            isRequested: false,
            streamingOn: { hasSome: collection.streamingProviders },
        };

    const candidates = await prisma.title.findMany({
        where: whereClause,
        select: { id: true, title: true, tmdbId: true },
        take: collection.maxItemsPerProvider * collection.streamingProviders.length,
    });

    if (candidates.length === 0) return;

    const { submitRequest } = await import("../services/request.service");

    for (const title of candidates) {
        try {
            await submitRequest(title.id);
            logger.info("Auto-requested title from collection", { titleId: title.id, titleName: title.title });
        } catch (err) {
            logger.warn("Auto-request failed for title", {
                titleId: title.id,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
}

/**
 * Syncs all enabled PlexCollection rows to the actual Plex server.
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
            // Auto-request titles before syncing so requests are in-flight
            if (collection.autoRequest && collection.collectionType === "TOP_TRENDING") {
                await autoRequestCollectionTitles(collection);
            }

            let targetKeys: string[];
            if (collection.collectionType === "TOP_TRENDING") {
                targetKeys = await resolveTopTrendingKeys(collection);
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

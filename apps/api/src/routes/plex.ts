import { Router } from "express";
import { z } from "zod";
import { prisma } from "@watchwarden/db";
import { asyncHandler } from "../middleware/error";
import { validateBody } from "../middleware/validation";

export const plexRouter = Router();

const VALID_FILTERS = ["ACTIVE_TRENDING", "PINNED", "APPROVED"] as const;
const VALID_MEDIA_TYPES = ["MOVIE", "SHOW"] as const;
const VALID_COLLECTION_TYPES = ["SMART", "TOP_TRENDING"] as const;

// GET /plex/collections — list all PlexCollection rows
plexRouter.get("/collections", asyncHandler(async (_req, res) => {
    const collections = await prisma.plexCollection.findMany({
        orderBy: [{ mediaType: "asc" }, { name: "asc" }],
    });
    res.json({ success: true, data: collections });
}));

const createCollectionSchema = z.object({
    name: z.string().min(1).max(100),
    sectionId: z.string().min(1),
    mediaType: z.enum(VALID_MEDIA_TYPES),
    collectionType: z.enum(VALID_COLLECTION_TYPES).default("SMART"),
    // SMART fields
    filter: z.enum(VALID_FILTERS).default("ACTIVE_TRENDING"),
    // TOP_TRENDING fields
    streamingProviders: z.array(z.string().min(1).max(100)).default([]),
    maxItemsPerProvider: z.number().int().min(1).max(50).default(10),
    enabled: z.boolean().default(true),
    autoRequest: z.boolean().default(false),
});

// POST /plex/collections — create a new managed collection
plexRouter.post("/collections", validateBody(createCollectionSchema), asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createCollectionSchema>;

    const existing = await prisma.plexCollection.findFirst({
        where: { name: body.name, mediaType: body.mediaType },
    });
    if (existing) {
        return res.status(409).json({
            success: false,
            error: `A collection named "${body.name}" already exists for ${body.mediaType}`,
        });
    }

    if (body.collectionType === "TOP_TRENDING" && body.streamingProviders.length === 0) {
        return res.status(400).json({
            success: false,
            error: "At least one streaming provider is required for TOP_TRENDING collections",
        });
    }

    const collection = await prisma.plexCollection.create({ data: body });
    return res.status(201).json({ success: true, data: collection });
}));

const updateCollectionSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    sectionId: z.string().min(1).optional(),
    collectionType: z.enum(VALID_COLLECTION_TYPES).optional(),
    filter: z.enum(VALID_FILTERS).optional(),
    streamingProviders: z.array(z.string().min(1).max(100)).optional(),
    maxItemsPerProvider: z.number().int().min(1).max(50).optional(),
    enabled: z.boolean().optional(),
    autoRequest: z.boolean().optional(),
});

// PATCH /plex/collections/:id — update a collection
plexRouter.patch("/collections/:id", validateBody(updateCollectionSchema), asyncHandler(async (req, res) => {
    const collection = await prisma.plexCollection.findUnique({ where: { id: req.params.id } });
    if (!collection) {
        return res.status(404).json({ success: false, error: "Collection not found" });
    }

    const updated = await prisma.plexCollection.update({
        where: { id: req.params.id },
        data: req.body as z.infer<typeof updateCollectionSchema>,
    });
    return res.json({ success: true, data: updated });
}));

// DELETE /plex/collections/:id — remove WatchWarden's tracking of a collection
// (does NOT delete the collection from Plex)
plexRouter.delete("/collections/:id", asyncHandler(async (req, res) => {
    const collection = await prisma.plexCollection.findUnique({ where: { id: req.params.id } });
    if (!collection) {
        return res.status(404).json({ success: false, error: "Collection not found" });
    }
    await prisma.plexCollection.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
}));

// GET /plex/collections/:id/items — resolve current member titles for a collection
plexRouter.get("/collections/:id/items", asyncHandler(async (req, res) => {
    const collection = await prisma.plexCollection.findUnique({ where: { id: req.params.id } });
    if (!collection) {
        return res.status(404).json({ success: false, error: "Collection not found" });
    }

    const { PROVIDER_TMDB_ID_MAP } = await import("@watchwarden/integrations");

    const titleSelect = {
        id: true,
        title: true,
        year: true,
        posterPath: true,
        mediaType: true,
        streamingOn: true,
        inLibrary: true,
        isRequested: true,
        trendSnapshots: {
            select: { trendScore: true, providerId: true, providerRank: true },
            orderBy: { snapshotAt: "desc" as const },
            take: 5,
        },
    };

    // Helper to get manual overrides for this collection
    const overrides = await prisma.plexCollectionTitle.findMany({
        where: { collectionId: collection.id },
    });
    const excludedIds = new Set(overrides.filter((o) => o.manuallyExcluded).map((o) => o.titleId));
    const manuallyAddedIds = overrides.filter((o) => o.manuallyAdded && !o.manuallyExcluded).map((o) => o.titleId);

    let orderedTitleIds: string[];

    if (collection.collectionType === "TOP_TRENDING") {
        if (!collection.streamingProviders.length) {
            return res.json({ success: true, data: [] });
        }

        const cap = collection.maxItemsPerProvider;
        const perProviderLists: string[][] = [];

        for (const providerName of collection.streamingProviders) {
            const tmdbProviderId = PROVIDER_TMDB_ID_MAP[providerName];
            let ids: string[];

            if (tmdbProviderId) {
                const snapshots = await prisma.externalTrendSnapshot.findMany({
                    where: {
                        providerId: String(tmdbProviderId),
                        providerRank: { not: null },
                        snapshotAt: { gte: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
                        title: { mediaType: collection.mediaType },
                    },
                    orderBy: [{ region: "desc" }, { providerRank: "asc" }],
                    take: cap * 3,
                    select: { titleId: true, providerRank: true, region: true },
                });

                // Dedup keeping best CA/lowest rank
                const seen = new Map<string, { rank: number; region: string }>();
                for (const snap of snapshots) {
                    const existing = seen.get(snap.titleId);
                    if (!existing) {
                        seen.set(snap.titleId, { rank: snap.providerRank!, region: snap.region ?? "US" });
                    } else {
                        const caPrefer = snap.region === "CA" && existing.region !== "CA";
                        if (caPrefer || (snap.providerRank ?? 999) < existing.rank) {
                            seen.set(snap.titleId, { rank: snap.providerRank!, region: snap.region ?? "US" });
                        }
                    }
                }
                ids = Array.from(seen.entries())
                    .sort(([, a], [, b]) => a.rank - b.rank)
                    .slice(0, cap)
                    .map(([id]) => id);
            } else {
                const titles = await prisma.title.findMany({
                    where: { mediaType: collection.mediaType, streamingOn: { has: providerName } },
                    select: { id: true, trendSnapshots: { orderBy: { snapshotAt: "desc" }, take: 1 } },
                });
                ids = titles
                    .sort((a, b) => (b.trendSnapshots[0]?.trendScore ?? 0) - (a.trendSnapshots[0]?.trendScore ?? 0))
                    .slice(0, cap)
                    .map((t) => t.id);
            }
            if (ids.length) perProviderLists.push(ids);
        }

        // Interleave and deduplicate
        const interleaved: string[] = [];
        const seen = new Set<string>();
        const maxLen = Math.max(0, ...perProviderLists.map((l) => l.length));
        for (let i = 0; i < maxLen; i++) {
            for (const list of perProviderLists) {
                if (i < list.length && !seen.has(list[i])) {
                    interleaved.push(list[i]);
                    seen.add(list[i]);
                }
            }
        }
        orderedTitleIds = interleaved;
    } else {
        const whereInput =
            collection.filter === "PINNED"
                ? { isPinned: true, mediaType: collection.mediaType }
                : { status: collection.filter === "APPROVED" ? "APPROVED" : "ACTIVE_TRENDING", mediaType: collection.mediaType };

        const titles = await prisma.title.findMany({
            where: whereInput as never,
            select: { id: true, trendSnapshots: { orderBy: { snapshotAt: "desc" }, take: 1 } },
        });
        orderedTitleIds = titles
            .sort((a, b) => (b.trendSnapshots[0]?.trendScore ?? 0) - (a.trendSnapshots[0]?.trendScore ?? 0))
            .map((t) => t.id);
    }

    // Apply manual exclusions, then append manual additions
    const filteredIds = orderedTitleIds.filter((id) => !excludedIds.has(id));
    const existingSet = new Set(filteredIds);
    for (const id of manuallyAddedIds) {
        if (!existingSet.has(id)) filteredIds.push(id);
    }

    // Fetch title details preserving order
    const titleRows = await prisma.title.findMany({
        where: { id: { in: filteredIds } },
        select: {
            ...titleSelect,
            collectionOverrides: {
                where: { collectionId: collection.id },
                select: { manuallyAdded: true, manuallyExcluded: true },
            },
        },
    });
    const titleMap = new Map(titleRows.map((t) => [t.id, t]));
    const result = filteredIds
        .map((id) => titleMap.get(id))
        .filter(Boolean)
        .map((t) => ({
            ...t,
            manuallyAdded: (t!.collectionOverrides?.[0]?.manuallyAdded) ?? false,
            manuallyExcluded: (t!.collectionOverrides?.[0]?.manuallyExcluded) ?? false,
            collectionOverrides: undefined,
        }));

    return res.json({ success: true, data: result });
}));

// POST /plex/collections/:id/titles — manually add or exclude a title
const titleOverrideSchema = z.object({
    titleId: z.string().min(1),
    action: z.enum(["include", "exclude"]),
});

plexRouter.post("/collections/:id/titles", validateBody(titleOverrideSchema), asyncHandler(async (req, res) => {
    const collection = await prisma.plexCollection.findUnique({ where: { id: req.params.id } });
    if (!collection) return res.status(404).json({ success: false, error: "Collection not found" });

    const { titleId, action } = req.body as z.infer<typeof titleOverrideSchema>;

    const title = await prisma.title.findUnique({ where: { id: titleId } });
    if (!title) return res.status(404).json({ success: false, error: "Title not found" });

    const override = await prisma.plexCollectionTitle.upsert({
        where: { collectionId_titleId: { collectionId: collection.id, titleId } },
        update: {
            manuallyAdded: action === "include",
            manuallyExcluded: action === "exclude",
        },
        create: {
            collectionId: collection.id,
            titleId,
            manuallyAdded: action === "include",
            manuallyExcluded: action === "exclude",
        },
    });

    return res.status(201).json({ success: true, data: override });
}));

// DELETE /plex/collections/:id/titles/:titleId — remove a manual override
plexRouter.delete("/collections/:id/titles/:titleId", asyncHandler(async (req, res) => {
    const collection = await prisma.plexCollection.findUnique({ where: { id: req.params.id } });
    if (!collection) return res.status(404).json({ success: false, error: "Collection not found" });

    await prisma.plexCollectionTitle.deleteMany({
        where: { collectionId: collection.id, titleId: req.params.titleId },
    });

    return res.json({ success: true });
}));

// GET /plex/sections — proxy to Plex API to list library sections (used in the UI)
plexRouter.get("/sections", asyncHandler(async (_req, res) => {
    const { getIntegrationConfig } = await import("@watchwarden/db");
    const { PlexClient } = await import("@watchwarden/integrations");

    const { plex } = await getIntegrationConfig();
    if (!plex.baseUrl || !plex.token) {
        return res.status(400).json({ success: false, error: "Plex not configured" });
    }

    try {
        const client = new PlexClient({ baseUrl: plex.baseUrl, token: plex.token, timeout: 8_000 });
        const sections = await client.getSections();
        return res.json({ success: true, data: sections });
    } catch (err) {
        return res.status(502).json({
            success: false,
            error: err instanceof Error ? err.message : "Failed to reach Plex",
        });
    }
}));

// GET /plex/collections/feed — all collections + top pending suggestions for each
// Used by the suggestions page to render one row per collection.
plexRouter.get("/collections/feed", asyncHandler(async (_req, res) => {
    const collections = await prisma.plexCollection.findMany({
        where: { enabled: true },
        orderBy: [{ mediaType: "asc" }, { name: "asc" }],
    });

    const feed = await Promise.all(
        collections.map(async (col) => {
            const suggestions = await prisma.suggestion.findMany({
                where: {
                    status: "PENDING",
                    title: { mediaType: col.mediaType as "MOVIE" | "SHOW" },
                },
                orderBy: { finalScore: "desc" },
                take: 30,
                include: {
                    title: {
                        select: {
                            id: true,
                            title: true,
                            year: true,
                            mediaType: true,
                            posterPath: true,
                            overview: true,
                            inLibrary: true,
                            isRequested: true,
                            plexRatingKey: true,
                            status: true,
                            streamingOn: true,
                            trendSnapshots: {
                                select: { source: true, trendScore: true },
                                orderBy: { trendScore: "desc" },
                                take: 3,
                            },
                        },
                    },
                },
            });

            return { ...col, suggestions };
        })
    );

    res.json({ success: true, data: feed });
}));

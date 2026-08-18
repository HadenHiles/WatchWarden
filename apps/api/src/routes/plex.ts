import { Router } from "express";
import { z } from "zod";
import { prisma } from "@watchwarden/db";
import { Prisma } from "@prisma/client";
import { asyncHandler } from "../middleware/error";
import { validateBody } from "../middleware/validation";
import { DecisionService } from "../services/decision.service";
import { RequestService } from "../services/request.service";

export const plexRouter = Router();
const decisionService = new DecisionService();
const requestService = new RequestService();

const DEFAULT_HOME_SETTINGS = { primaryRegion: "CA", fallbackRegion: "US", shelfLimit: 6, recentlyReleasedDays: 90, backfillRecentReleases: true, recentlyReleasedBackfillDays: 365, defaultMaxItems: 20 };

const shelfConfigSchema = z.object({
    genres: z.array(z.string().trim().min(1).max(50)).min(1).max(5).optional(),
    startYear: z.number().int().min(1888).max(2100).optional(),
    endYear: z.number().int().min(1888).max(2100).optional(),
}).refine((config) => !config.startYear || !config.endYear || config.startYear <= config.endYear, { message: "Start year must not exceed end year" });

function readShelfConfig(value: unknown): z.infer<typeof shelfConfigSchema> {
    return shelfConfigSchema.catch({}).parse(value);
}

function addShelfCriteria(where: Prisma.TitleWhereInput, config: z.infer<typeof shelfConfigSchema>): Prisma.TitleWhereInput {
    if (config.genres?.length) where.genres = { hasSome: config.genres };
    if (config.startYear || config.endYear) where.year = { gte: config.startYear, lte: config.endYear };
    return where;
}

plexRouter.get("/home", asyncHandler(async (_req, res) => {
    const setting = await prisma.appSetting.findUnique({ where: { key: "plexHome" } });
    const shelves = await prisma.plexCollection.findMany({ orderBy: [{ homePriority: "asc" }, { id: "asc" }] });
    res.json({ success: true, data: { settings: { ...DEFAULT_HOME_SETTINGS, ...((setting?.value ?? {}) as object) }, shelves } });
}));

const homeSettingsSchema = z.object({
    primaryRegion: z.string().length(2).default("CA"), fallbackRegion: z.string().length(2).default("US"),
    shelfLimit: z.number().int().min(0).max(20).default(6), recentlyReleasedDays: z.number().int().min(1).max(365).default(90),
    backfillRecentReleases: z.boolean().default(true), recentlyReleasedBackfillDays: z.number().int().min(1).max(730).default(365),
    defaultMaxItems: z.number().int().min(1).max(100).default(20),
});
plexRouter.patch("/home/settings", validateBody(homeSettingsSchema), asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof homeSettingsSchema>;
    const current = await prisma.appSetting.findUnique({ where: { key: "plexHome" }, select: { value: true } });
    const value = { ...((current?.value ?? {}) as object), ...body };
    const [setting] = await prisma.$transaction([
        prisma.appSetting.upsert({ where: { key: "plexHome" }, update: { value }, create: { key: "plexHome", value, category: "plex" } }),
        prisma.plexCollection.updateMany({ where: { shelfType: "RECENTLY_RELEASED" }, data: { releaseWindowDays: body.recentlyReleasedDays } }),
    ]);
    res.json({ success: true, data: setting.value });
}));

const setupShelvesSchema = z.object({ movieSectionId: z.string().min(1), showSectionId: z.string().min(1), providers: z.array(z.string().min(1)).default(["Netflix", "Disney+", "Prime Video", "Apple TV+"]) });
plexRouter.post("/home/setup", validateBody(setupShelvesSchema), asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof setupShelvesSchema>;
    const homeSetting = await prisma.appSetting.findUnique({ where: { key: "plexHome" } });
    const home = { ...DEFAULT_HOME_SETTINGS, ...((homeSetting?.value ?? {}) as Partial<typeof DEFAULT_HOME_SETTINGS>) };
    const base = [
        { name: "Popular Movies Right Now", sectionId: body.movieSectionId, mediaType: "MOVIE" as const, shelfType: "CULTURAL_TRENDING" as const, streamingProviders: body.providers },
        { name: "Popular Shows Right Now", sectionId: body.showSectionId, mediaType: "SHOW" as const, shelfType: "CULTURAL_TRENDING" as const, streamingProviders: body.providers },
        { name: "FamFlix Favorites - Movies", sectionId: body.movieSectionId, mediaType: "MOVIE" as const, shelfType: "FAMILY_POPULAR" as const },
        { name: "FamFlix Favorites - Shows", sectionId: body.showSectionId, mediaType: "SHOW" as const, shelfType: "FAMILY_POPULAR" as const },
        { name: "90s Movie Night", sectionId: body.movieSectionId, mediaType: "MOVIE" as const, shelfType: "DECADE" as const, shelfConfig: { startYear: 1990, endYear: 1999 } },
        { name: "2000s TV Time", sectionId: body.showSectionId, mediaType: "SHOW" as const, shelfType: "DECADE" as const, shelfConfig: { startYear: 2000, endYear: 2009 } },
        { name: "Action & Adventure", sectionId: body.movieSectionId, mediaType: "MOVIE" as const, shelfType: "GENRE" as const, shelfConfig: { genres: ["Action", "Adventure"] } },
        { name: "Recently Released Movies", sectionId: body.movieSectionId, mediaType: "MOVIE" as const, shelfType: "RECENTLY_RELEASED" as const },
        ...body.providers.flatMap((provider) => (["MOVIE", "SHOW"] as const).map((mediaType) => ({ name: `Popular on ${provider}${mediaType === "SHOW" ? " — Shows" : ""}`, sectionId: mediaType === "MOVIE" ? body.movieSectionId : body.showSectionId, mediaType, shelfType: "PROVIDER_TRENDING" as const, provider }))),
    ];
    const existing = await prisma.plexCollection.findMany({ select: { name: true, mediaType: true } });
    const keys = new Set(existing.map((x) => `${x.mediaType}:${x.name}`));
    const created = [];
    for (const [index, shelf] of base.entries()) {
        if (keys.has(`${shelf.mediaType}:${shelf.name}`)) continue;
        const provider = "provider" in shelf ? shelf.provider : null;
        created.push(await prisma.plexCollection.create({
            data: {
                ...shelf, collectionType: shelf.shelfType === "PROVIDER_TRENDING" ? "TOP_TRENDING" : "SMART",
                provider, streamingProviders: "streamingProviders" in shelf ? shelf.streamingProviders : provider ? [provider] : [], enabled: false, publishToHome: false,
                homePriority: (index + 1) * 10, maxItems: home.defaultMaxItems, maxItemsPerProvider: home.defaultMaxItems,
                releaseWindowDays: home.recentlyReleasedDays,
            }
        }));
    }
    res.status(201).json({ success: true, data: created });
}));

const VALID_FILTERS = ["ACTIVE_TRENDING", "PINNED", "APPROVED"] as const;
const VALID_MEDIA_TYPES = ["MOVIE", "SHOW"] as const;
const VALID_COLLECTION_TYPES = ["SMART", "TOP_TRENDING"] as const;
const VALID_SHELF_TYPES = ["CULTURAL_TRENDING", "PROVIDER_TRENDING", "RECENTLY_RELEASED", "FAMILY_POPULAR", "GENRE", "DECADE", "SMART", "CUSTOM"] as const;

// GET /plex/collections — list all PlexCollection rows
plexRouter.get("/collections", asyncHandler(async (_req, res) => {
    const collections = await prisma.plexCollection.findMany({
        orderBy: [{ mediaType: "asc" }, { name: "asc" }],
    });
    res.json({ success: true, data: collections });
}));

const createCollectionSchema = z.object({
    name: z.string().trim().min(1).max(100),
    sectionId: z.string().min(1),
    mediaType: z.enum(VALID_MEDIA_TYPES),
    collectionType: z.enum(VALID_COLLECTION_TYPES).default("TOP_TRENDING"),
    // SMART fields
    filter: z.enum(VALID_FILTERS).default("ACTIVE_TRENDING"),
    // TOP_TRENDING fields
    streamingProviders: z.array(z.string().min(1).max(100)).default([]),
    maxItemsPerProvider: z.number().int().min(1).max(50).default(10),
    shelfConfig: shelfConfigSchema.optional(),
    enabled: z.boolean().default(true),
    shelfType: z.enum(VALID_SHELF_TYPES).default("CUSTOM"),
    provider: z.string().min(1).max(100).nullable().optional(),
    publishToHome: z.boolean().default(false),
    publishToSharedHome: z.boolean().default(false),
    autoPublish: z.boolean().default(false),
    autoRequest: z.boolean().default(false),
    homePriority: z.number().int().min(0).max(10000).default(100),
    maxItems: z.number().int().min(1).max(100).default(20),
    releaseWindowDays: z.number().int().min(1).max(365).default(90),
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
    name: z.string().trim().min(1).max(100).optional(),
    sectionId: z.string().min(1).optional(),
    collectionType: z.enum(VALID_COLLECTION_TYPES).optional(),
    filter: z.enum(VALID_FILTERS).optional(),
    streamingProviders: z.array(z.string().min(1).max(100)).optional(),
    maxItemsPerProvider: z.number().int().min(1).max(50).optional(),
    shelfConfig: shelfConfigSchema.nullable().optional(),
    enabled: z.boolean().optional(),
    shelfType: z.enum(VALID_SHELF_TYPES).optional(),
    provider: z.string().min(1).max(100).nullable().optional(),
    publishToHome: z.boolean().optional(),
    publishToSharedHome: z.boolean().optional(),
    autoPublish: z.boolean().optional(),
    autoRequest: z.boolean().optional(),
    homePriority: z.number().int().min(0).max(10000).optional(),
    maxItems: z.number().int().min(1).max(100).optional(),
    releaseWindowDays: z.number().int().min(1).max(365).optional(),
});

// PATCH /plex/collections/:id — update a collection
plexRouter.patch("/collections/:id", validateBody(updateCollectionSchema), asyncHandler(async (req, res) => {
    const collection = await prisma.plexCollection.findUnique({ where: { id: req.params.id } });
    if (!collection) {
        return res.status(404).json({ success: false, error: "Collection not found" });
    }
    const body = req.body as z.infer<typeof updateCollectionSchema>;
    if (body.name && body.name !== collection.name) {
        const duplicate = await prisma.plexCollection.findFirst({
            where: { id: { not: collection.id }, mediaType: collection.mediaType, name: body.name },
            select: { id: true },
        });
        if (duplicate) return res.status(409).json({
            success: false,
            error: `A shelf named "${body.name}" already exists for ${collection.mediaType}`,
        });
    }

    const { shelfConfig, ...collectionData } = body;
    const data: Prisma.PlexCollectionUpdateInput = {
        ...collectionData,
        ...(shelfConfig === undefined ? {} : { shelfConfig: shelfConfig === null ? Prisma.JsonNull : shelfConfig as Prisma.InputJsonValue }),
    };
    const updated = await prisma.plexCollection.update({
        where: { id: req.params.id },
        data,
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

// GET /plex/collections/:id/candidates — missing titles suited to this shelf
plexRouter.get("/collections/:id/candidates", asyncHandler(async (req, res) => {
    const collection = await prisma.plexCollection.findUnique({ where: { id: req.params.id } });
    if (!collection) return res.status(404).json({ success: false, error: "Collection not found" });

    const titleWhere: Prisma.TitleWhereInput = {
        mediaType: collection.mediaType,
        inLibrary: false,
        isRequested: false,
        tmdbId: { not: null },
        status: { notIn: ["REJECTED", "EXPIRED"] },
    };
    let titleIds: string[] = [];

    if (collection.shelfType === "PROVIDER_TRENDING" && collection.provider) {
        const { PROVIDER_TMDB_ID_MAP } = await import("@watchwarden/integrations");
        const providerId = PROVIDER_TMDB_ID_MAP[collection.provider];
        if (providerId) {
            const snapshots = await prisma.externalTrendSnapshot.findMany({
                where: {
                    providerId: String(providerId), providerRank: { not: null },
                    snapshotAt: { gte: new Date(Date.now() - 21 * 86_400_000) },
                    title: titleWhere,
                },
                orderBy: [{ providerRank: "asc" }, { snapshotAt: "desc" }],
                take: 100,
                select: { titleId: true },
            });
            titleIds = [...new Set(snapshots.map((snapshot) => snapshot.titleId))];
        }
    } else if (collection.shelfType === "RECENTLY_RELEASED") {
        const titles = await prisma.title.findMany({
            where: { ...titleWhere, mediaType: "MOVIE", releaseDate: { gte: new Date(Date.now() - 365 * 86_400_000), lte: new Date() } },
            orderBy: [{ releaseDate: "desc" }, { id: "asc" }], take: 30, select: { id: true },
        });
        titleIds = titles.map((title) => title.id);
    } else if (collection.shelfType === "GENRE" || collection.shelfType === "DECADE") {
        const suggestions = await prisma.suggestion.findMany({
            where: { status: "PENDING", title: addShelfCriteria(titleWhere, readShelfConfig(collection.shelfConfig)) },
            orderBy: { finalScore: "desc" }, take: 30, select: { titleId: true },
        });
        titleIds = suggestions.map((suggestion) => suggestion.titleId);
    } else if (collection.shelfType === "FAMILY_POPULAR") {
        titleIds = [];
    } else {
        const suggestions = await prisma.suggestion.findMany({
            where: { status: "PENDING", title: titleWhere },
            orderBy: { finalScore: "desc" }, take: 30, select: { titleId: true },
        });
        titleIds = suggestions.map((suggestion) => suggestion.titleId);
    }

    const discoverySetting = await prisma.appSetting.findUnique({ where: { key: "discovery.filters" }, select: { value: true } });
    const rawFilters = (discoverySetting?.value ?? {}) as Record<string, unknown>;
    const excludedGenres = new Set(
        (Array.isArray(rawFilters.excludedGenres) ? rawFilters.excludedGenres : [])
            .filter((genre): genre is string => typeof genre === "string")
            .map((genre) => genre.toLocaleLowerCase()),
    );
    const excludeAnime = rawFilters.excludeAnime === true;
    const minimumPopularity = typeof rawFilters.minimumPopularity === "number" ? Math.max(0, rawFilters.minimumPopularity) : 0;

    const titles = await prisma.title.findMany({
        where: { id: { in: titleIds } },
        select: {
            id: true, title: true, year: true, mediaType: true, posterPath: true, backdropPath: true,
            overview: true, streamingOn: true, genres: true,
            suggestion: { select: { id: true, finalScore: true, scoreExplanation: true, suggestedReasons: true } },
            trendSnapshots: { orderBy: { snapshotAt: "desc" }, take: 20, select: { rawMetadata: true } },
        },
    });
    const allowedTitles = titles.filter((title) => {
        if (title.genres.some((genre) => excludedGenres.has(genre.toLocaleLowerCase()))) return false;
        const metadata = title.trendSnapshots
            .map((snapshot) => snapshot.rawMetadata as Record<string, unknown>)
            .find((raw) => typeof raw.popularity === "number" || raw.original_language != null || raw.origin_country != null) ?? {};
        const originalLanguage = metadata.original_language ?? metadata.originalLanguage;
        const originCountry = metadata.origin_country ?? metadata.originCountry;
        const japanese = originalLanguage === "ja" || (Array.isArray(originCountry) && originCountry.includes("JP"));
        if (excludeAnime && title.genres.includes("Animation") && japanese) return false;
        return !(typeof metadata.popularity === "number" && metadata.popularity < minimumPopularity);
    });
    const titleMap = new Map(allowedTitles.map(({ trendSnapshots: _trendSnapshots, ...title }) => [title.id, title]));
    return res.json({ success: true, data: titleIds.map((id) => titleMap.get(id)).filter(Boolean).slice(0, 50) });
}));

const reviewDecisionSchema = z.object({
    action: z.enum(["APPROVE", "REJECT", "UNDO"]),
    selectedShelfIds: z.array(z.string()).max(30).default([]),
    proposedShelfIds: z.array(z.string()).max(30).default([]),
});

// POST /plex/home/review/:titleId — one atomic curation action across every suggested shelf.
plexRouter.post("/home/review/:titleId", validateBody(reviewDecisionSchema), asyncHandler(async (req, res) => {
    const { action, selectedShelfIds, proposedShelfIds } = req.body as z.infer<typeof reviewDecisionSchema>;
    const title = await prisma.title.findUnique({ where: { id: req.params.titleId }, select: { id: true, mediaType: true } });
    if (!title) return res.status(404).json({ success: false, error: "Candidate not found" });

    const shelfIds = [...new Set([...selectedShelfIds, ...proposedShelfIds])];
    const shelves = await prisma.plexCollection.findMany({
        where: { id: { in: shelfIds }, mediaType: title.mediaType },
        select: { id: true },
    });
    const validShelfIds = new Set(shelves.map((shelf) => shelf.id));
    const selected = selectedShelfIds.filter((id) => validShelfIds.has(id));
    const proposed = proposedShelfIds.filter((id) => validShelfIds.has(id));

    const suggestion = await prisma.suggestion.upsert({
        where: { titleId: title.id },
        update: {},
        create: { titleId: title.id, suggestedReasons: ["Reviewed from Plex Home curation queue"] },
        select: { id: true },
    });

    if (action === "UNDO") {
        await decisionService.applyDecision({ suggestionId: suggestion.id, action: "UNDO", reason: "Undid Plex Home curation decision" });
        if (proposed.length) await prisma.plexCollectionTitle.deleteMany({ where: { titleId: title.id, collectionId: { in: proposed } } });
        return res.json({ success: true, data: { action, requestRetained: true } });
    }

    if (action === "REJECT") {
        const decision = await decisionService.applyDecision({ suggestionId: suggestion.id, action: "REJECT", reason: "Rejected from Plex Home curation queue" });
        return res.json({ success: true, data: decision });
    }

    if (!selected.length) return res.status(400).json({ success: false, error: "Choose at least one shelf" });
    await decisionService.applyDecision({ suggestionId: suggestion.id, action: "APPROVE", reason: "Approved from Plex Home curation queue" });
    await prisma.$transaction([
        ...selected.map((collectionId) => prisma.plexCollectionTitle.upsert({
            where: { collectionId_titleId: { collectionId, titleId: title.id } },
            update: { manuallyAdded: true, manuallyExcluded: false },
            create: { collectionId, titleId: title.id, manuallyAdded: true },
        })),
        ...proposed.filter((id) => !selected.includes(id)).map((collectionId) => prisma.plexCollectionTitle.upsert({
            where: { collectionId_titleId: { collectionId, titleId: title.id } },
            update: { manuallyAdded: false, manuallyExcluded: true },
            create: { collectionId, titleId: title.id, manuallyExcluded: true },
        })),
    ]);
    const request = await requestService.submitRequest(title.id);
    return res.json({ success: true, data: { action, selectedShelfIds: selected, requestStatus: request.requestStatus } });
}));

// POST /plex/collections/:id/candidates/:titleId/reject — permanently reject a shelf candidate
plexRouter.post("/collections/:id/candidates/:titleId/reject", asyncHandler(async (req, res) => {
    const [collection, title] = await Promise.all([
        prisma.plexCollection.findUnique({ where: { id: req.params.id }, select: { id: true, mediaType: true } }),
        prisma.title.findUnique({ where: { id: req.params.titleId }, select: { id: true, mediaType: true } }),
    ]);
    if (!collection) return res.status(404).json({ success: false, error: "Collection not found" });
    if (!title || title.mediaType !== collection.mediaType) return res.status(404).json({ success: false, error: "Candidate not found" });

    const suggestion = await prisma.suggestion.upsert({
        where: { titleId: title.id },
        update: {},
        create: { titleId: title.id, suggestedReasons: ["Reviewed from Plex Home shelf"] },
        select: { id: true },
    });
    const decision = await decisionService.applyDecision({
        suggestionId: suggestion.id,
        action: "REJECT",
        reason: "Rejected from Plex Home shelf candidate review",
    });
    return res.json({ success: true, data: decision });
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

    if (collection.shelfType === "RECENTLY_RELEASED") {
        if (collection.mediaType !== "MOVIE") return res.json({ success: true, data: [] });
        const titles = await prisma.title.findMany({
            where: { mediaType: "MOVIE", inLibrary: true, plexRatingKey: { not: null }, releaseDate: { gte: new Date(Date.now() - collection.releaseWindowDays * 86_400_000), lte: new Date() } },
            orderBy: [{ releaseDate: "desc" }, { id: "asc" }], take: collection.maxItems, select: { id: true },
        });
        orderedTitleIds = titles.map((t) => t.id);
    } else if (collection.shelfType === "CULTURAL_TRENDING") {
        const { culturalHeat } = await import("@watchwarden/scoring");
        const now = new Date();
        const titles = await prisma.title.findMany({ where: { mediaType: collection.mediaType, inLibrary: true, plexRatingKey: { not: null } }, select: { id: true, trendSnapshots: { where: { providerId: null }, orderBy: { snapshotAt: "desc" }, take: 20 } } });
        orderedTitleIds = titles.map((title) => {
            const latestBySource = [...new Map(title.trendSnapshots
                .filter((s) => s.source.startsWith("tmdb_"))
                .map((s) => [s.source, s])).values()];
            const newest = latestBySource[0];
            return {
                id: title.id, heat: newest ? culturalHeat({
                    tmdbTrends: latestBySource.map((s) => s.trendScore),
                    rank: Math.min(...latestBySource.map((s) => s.rank ?? 100)),
                    snapshotAt: newest.snapshotAt,
                    region: newest.region,
                }, now) : 0
            };
        }).sort((a, b) => b.heat - a.heat || a.id.localeCompare(b.id)).slice(0, collection.maxItems).map((t) => t.id);
    } else if (collection.shelfType === "FAMILY_POPULAR") {
        const titles = await prisma.title.findMany({
            where: { mediaType: collection.mediaType, inLibrary: true, plexRatingKey: { not: null }, watchSignals: { some: { recentWatchCount: { gt: 0 } } } },
            select: { id: true, watchSignals: { select: { localInterestScore: true, uniqueViewerCount: true, recentWatchCount: true } } },
        });
        orderedTitleIds = titles.sort((a, b) => {
            const left = a.watchSignals[0];
            const right = b.watchSignals[0];
            return (right?.localInterestScore ?? 0) - (left?.localInterestScore ?? 0)
                || (right?.uniqueViewerCount ?? 0) - (left?.uniqueViewerCount ?? 0)
                || (right?.recentWatchCount ?? 0) - (left?.recentWatchCount ?? 0)
                || a.id.localeCompare(b.id);
        }).map((title) => title.id);
    } else if (collection.shelfType === "GENRE" || collection.shelfType === "DECADE") {
        const titles = await prisma.title.findMany({
            where: addShelfCriteria({ mediaType: collection.mediaType, inLibrary: true, plexRatingKey: { not: null } }, readShelfConfig(collection.shelfConfig)),
            select: { id: true, trendSnapshots: { orderBy: { snapshotAt: "desc" }, take: 1 }, watchSignals: { select: { localInterestScore: true, recencyScore: true, multiUserBoost: true } } },
        });
        orderedTitleIds = titles.sort((a, b) => {
            const score = (title: typeof a) => (title.trendSnapshots[0]?.trendScore ?? 0) * 0.7
                + (title.watchSignals[0]?.localInterestScore ?? 0) * 0.2
                + (title.watchSignals[0]?.recencyScore ?? 0) * 0.07
                + (title.watchSignals[0]?.multiUserBoost ?? 0) * 0.03;
            return score(b) - score(a) || a.id.localeCompare(b.id);
        }).map((title) => title.id);
    } else if (collection.collectionType === "TOP_TRENDING") {
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
                    select: { titleId: true, providerRank: true, region: true, snapshotAt: true },
                });
                const { resolvePlatformSnapshots } = await import("@watchwarden/scoring");
                ids = resolvePlatformSnapshots(snapshots.map((s) => ({
                    titleId: s.titleId, providerRank: s.providerRank!, region: s.region, snapshotAt: s.snapshotAt,
                }))).slice(0, cap).map((s) => s.titleId);
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
        where: { id: { in: filteredIds }, inLibrary: true, plexRatingKey: { not: null } },
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

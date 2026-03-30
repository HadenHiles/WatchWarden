import { Router } from "express";
import { z } from "zod";
import { prisma, getIntegrationConfig } from "@watchwarden/db";
import { AppError, asyncHandler } from "../middleware/error";
import { validateQuery } from "../middleware/validation";

export const titlesRouter = Router();

const listQuerySchema = z.object({
    mediaType: z.enum(["MOVIE", "SHOW"]).optional(),
    status: z.string().optional(),
    inLibrary: z.coerce.boolean().optional(),
    cleanupEligible: z.coerce.boolean().optional(),
    isPinned: z.coerce.boolean().optional(),
    search: z.string().max(200).optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(25),
    sortBy: z.enum(["title", "year", "createdAt", "updatedAt"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// GET /titles
titlesRouter.get("/", validateQuery(listQuerySchema), asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;

    const where = {
        ...(q.mediaType ? { mediaType: q.mediaType } : {}),
        ...(q.status ? { status: q.status as never } : {}),
        ...(q.inLibrary !== undefined ? { inLibrary: q.inLibrary } : {}),
        ...(q.cleanupEligible !== undefined ? { cleanupEligible: q.cleanupEligible } : {}),
        ...(q.isPinned !== undefined ? { isPinned: q.isPinned } : {}),
        ...(q.search ? { title: { contains: q.search, mode: "insensitive" as const } } : {}),
    };

    const [items, total] = await Promise.all([
        prisma.title.findMany({
            where,
            orderBy: { [q.sortBy]: q.sortOrder },
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
            include: { suggestion: true, requestRecord: true },
        }),
        prisma.title.count({ where }),
    ]);

    res.json({
        success: true,
        data: { items, total, page: q.page, pageSize: q.pageSize, totalPages: Math.ceil(total / q.pageSize) },
    });
}));

// GET /titles/:id/tmdb — returns locally-stored fields merged with TMDB-enriched data (cast, runtime, rating)
titlesRouter.get("/:id/tmdb", asyncHandler(async (req, res) => {
    const title = await prisma.title.findUnique({ where: { id: req.params.id } });
    if (!title) throw new AppError(404, "Title not found");

    const base = {
        id: title.id,
        title: title.title,
        year: title.year,
        mediaType: title.mediaType,
        overview: title.overview,
        posterPath: title.posterPath,
        backdropPath: title.backdropPath,
        genres: title.genres,
        streamingOn: title.streamingOn,
        inLibrary: title.inLibrary,
        tmdbId: title.tmdbId,
    };

    const fallback = { ...base, runtime: null, seasonCount: null, episodeCount: null, voteAverage: null, cast: [] };

    if (!title.tmdbId) {
        return res.json({ success: true, data: fallback });
    }

    const config = await getIntegrationConfig();
    if (!config.sources.tmdbApiKey) {
        return res.json({ success: true, data: fallback });
    }

    const tmdbBase = "https://api.themoviedb.org/3";
    const tmdbPath = title.mediaType === "MOVIE" ? `movie/${title.tmdbId}` : `tv/${title.tmdbId}`;

    try {
        const response = await fetch(
            `${tmdbBase}/${tmdbPath}?api_key=${encodeURIComponent(config.sources.tmdbApiKey)}&append_to_response=credits&language=en-US`,
            { signal: AbortSignal.timeout(8000) }
        );
        if (!response.ok) {
            return res.json({ success: true, data: fallback });
        }
        const tmdb = await response.json() as Record<string, unknown>;
        const rawCast = (
            (tmdb.credits as { cast?: Array<{ name: string; character: string; profile_path: string | null }> } | undefined)?.cast ?? []
        );
        const cast = rawCast.slice(0, 8).map((c) => ({
            name: c.name,
            character: c.character,
            profilePath: c.profile_path,
        }));

        return res.json({
            success: true,
            data: {
                ...base,
                runtime: title.mediaType === "MOVIE" ? ((tmdb.runtime as number | null) ?? null) : null,
                seasonCount: title.mediaType === "SHOW" ? ((tmdb.number_of_seasons as number | null) ?? null) : null,
                episodeCount: title.mediaType === "SHOW" ? ((tmdb.number_of_episodes as number | null) ?? null) : null,
                voteAverage: ((tmdb.vote_average as number | null) ?? null) || null,
                cast,
            },
        });
    } catch {
        return res.json({ success: true, data: fallback });
    }
}));

// GET /titles/:id
titlesRouter.get("/:id", asyncHandler(async (req, res) => {
    const title = await prisma.title.findUnique({
        where: { id: req.params.id },
        include: {
            suggestion: { include: { decisions: { orderBy: { createdAt: "desc" } } } },
            requestRecord: true,
            trendSnapshots: { orderBy: { snapshotAt: "desc" }, take: 5 },
            watchSignals: true,
        },
    });
    if (!title) throw new AppError(404, "Title not found");
    res.json({ success: true, data: title });
}));

// PATCH /titles/:id/lifecycle — admin can directly update lifecycle fields
titlesRouter.patch("/:id/lifecycle", asyncHandler(async (req, res) => {
    const allowed = ["lifecyclePolicy", "isTemporary", "isPinned", "keepUntil", "cleanupEligible", "cleanupReason"];
    const update = Object.fromEntries(
        Object.entries(req.body as Record<string, unknown>).filter(([k]) => allowed.includes(k))
    );

    const title = await prisma.title.update({
        where: { id: req.params.id },
        data: update,
    });
    res.json({ success: true, data: title });
}));

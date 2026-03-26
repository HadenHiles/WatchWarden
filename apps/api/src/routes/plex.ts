import { Router } from "express";
import { z } from "zod";
import { prisma } from "@watchwarden/db";
import { validateBody } from "../middleware/validation";

export const plexRouter = Router();

const VALID_FILTERS = ["ACTIVE_TRENDING", "PINNED", "APPROVED"] as const;
const VALID_MEDIA_TYPES = ["MOVIE", "SHOW"] as const;

// GET /plex/collections — list all PlexCollection rows
plexRouter.get("/collections", async (_req, res) => {
    const collections = await prisma.plexCollection.findMany({
        orderBy: [{ mediaType: "asc" }, { name: "asc" }],
    });
    res.json({ success: true, data: collections });
});

const createCollectionSchema = z.object({
    name: z.string().min(1).max(100),
    sectionId: z.string().min(1),
    mediaType: z.enum(VALID_MEDIA_TYPES),
    filter: z.enum(VALID_FILTERS).default("ACTIVE_TRENDING"),
    enabled: z.boolean().default(true),
});

// POST /plex/collections — create a new managed collection
plexRouter.post("/collections", validateBody(createCollectionSchema), async (req, res) => {
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

    const collection = await prisma.plexCollection.create({ data: body });
    return res.status(201).json({ success: true, data: collection });
});

const updateCollectionSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    sectionId: z.string().min(1).optional(),
    filter: z.enum(VALID_FILTERS).optional(),
    enabled: z.boolean().optional(),
});

// PATCH /plex/collections/:id — update a collection
plexRouter.patch("/collections/:id", validateBody(updateCollectionSchema), async (req, res) => {
    const collection = await prisma.plexCollection.findUnique({ where: { id: req.params.id } });
    if (!collection) {
        return res.status(404).json({ success: false, error: "Collection not found" });
    }

    const updated = await prisma.plexCollection.update({
        where: { id: req.params.id },
        data: req.body as z.infer<typeof updateCollectionSchema>,
    });
    return res.json({ success: true, data: updated });
});

// DELETE /plex/collections/:id — remove WatchWarden's tracking of a collection
// (does NOT delete the collection from Plex)
plexRouter.delete("/collections/:id", async (req, res) => {
    const collection = await prisma.plexCollection.findUnique({ where: { id: req.params.id } });
    if (!collection) {
        return res.status(404).json({ success: false, error: "Collection not found" });
    }
    await prisma.plexCollection.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
});

// GET /plex/sections — proxy to Plex API to list library sections (used in the UI)
plexRouter.get("/sections", async (_req, res) => {
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
});

// GET /plex/collections/feed — all collections + top pending suggestions for each
// Used by the suggestions page to render one row per collection.
plexRouter.get("/collections/feed", async (_req, res) => {
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
});

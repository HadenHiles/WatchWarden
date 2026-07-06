import { Router } from "express";
import { z } from "zod";
import { prisma } from "@watchwarden/db";
import { asyncHandler } from "../middleware/error";
import { validateBody } from "../middleware/validation";

export const discoverRouter = Router();

const VALID_MEDIA_TYPES = ["MOVIE", "SHOW"] as const;

// GET /discover/sliders — list all WatchWarden-managed Jellyseerr discover sliders
discoverRouter.get("/sliders", asyncHandler(async (_req, res) => {
    const sliders = await prisma.jellyseerrDiscoverSlider.findMany({
        orderBy: [{ mediaType: "asc" }, { streamingProvider: "asc" }],
    });
    res.json({ success: true, data: sliders });
}));

const createSliderSchema = z.object({
    streamingProvider: z.string().min(1).max(100),
    mediaType: z.enum(VALID_MEDIA_TYPES),
    enabled: z.boolean().default(true),
});

// POST /discover/sliders — create a new managed discover slider
discoverRouter.post("/sliders", validateBody(createSliderSchema), asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSliderSchema>;

    const existing = await prisma.jellyseerrDiscoverSlider.findFirst({
        where: { streamingProvider: body.streamingProvider, mediaType: body.mediaType },
    });
    if (existing) {
        return res.status(409).json({
            success: false,
            error: `A discover slider for "${body.streamingProvider}" ${body.mediaType} already exists`,
        });
    }

    const slider = await prisma.jellyseerrDiscoverSlider.create({
        data: {
            name: `\uD83D\uDD25 WatchWarden: ${body.streamingProvider} ${body.mediaType === "MOVIE" ? "Movies" : "Shows"}`,
            streamingProvider: body.streamingProvider,
            mediaType: body.mediaType,
            enabled: body.enabled,
        },
    });
    return res.status(201).json({ success: true, data: slider });
}));

const updateSliderSchema = z.object({
    enabled: z.boolean().optional(),
});

// PATCH /discover/sliders/:id — toggle enabled state
discoverRouter.patch("/sliders/:id", validateBody(updateSliderSchema), asyncHandler(async (req, res) => {
    const slider = await prisma.jellyseerrDiscoverSlider.findUnique({ where: { id: req.params.id } });
    if (!slider) {
        return res.status(404).json({ success: false, error: "Discover slider not found" });
    }

    const updated = await prisma.jellyseerrDiscoverSlider.update({
        where: { id: req.params.id },
        data: req.body as z.infer<typeof updateSliderSchema>,
    });
    return res.json({ success: true, data: updated });
}));

// DELETE /discover/sliders/:id — remove a WatchWarden-managed slider
discoverRouter.delete("/sliders/:id", asyncHandler(async (req, res) => {
    const slider = await prisma.jellyseerrDiscoverSlider.findUnique({ where: { id: req.params.id } });
    if (!slider) {
        return res.status(404).json({ success: false, error: "Discover slider not found" });
    }
    await prisma.jellyseerrDiscoverSlider.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
}));

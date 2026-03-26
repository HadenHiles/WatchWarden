import { Router } from "express";
import { z } from "zod";
import { prisma } from "@watchwarden/db";
import { validateBody } from "../middleware/validation";
import { AppError, asyncHandler } from "../middleware/error";

export const sourcesRouter = Router();

// GET /sources
sourcesRouter.get("/", asyncHandler(async (_req, res) => {
    const sources = await prisma.sourceConfig.findMany({ orderBy: { sourceName: "asc" } });
    res.json({ success: true, data: sources });
}));

// GET /sources/:sourceId
sourcesRouter.get("/:sourceId", asyncHandler(async (req, res) => {
    const source = await prisma.sourceConfig.findUnique({
        where: { sourceId: req.params.sourceId },
    });
    if (!source) throw new AppError(404, "Source not found");
    res.json({ success: true, data: source });
}));

const updateSourceSchema = z.object({
    enabled: z.boolean().optional(),
    region: z.string().nullable().optional(),
    config: z.record(z.unknown()).optional(),
});

// PATCH /sources/:sourceId
sourcesRouter.patch("/:sourceId", validateBody(updateSourceSchema), asyncHandler(async (req, res) => {
    const source = await prisma.sourceConfig.findUnique({
        where: { sourceId: req.params.sourceId },
    });
    if (!source) throw new AppError(404, "Source not found");

    const updated = await prisma.sourceConfig.update({
        where: { sourceId: req.params.sourceId },
        data: req.body as object,
    });
    res.json({ success: true, data: updated });
}));

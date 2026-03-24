import { Router } from "express";
import { z } from "zod";
import { prisma } from "@watchwarden/db";
import { AppError } from "../middleware/error";
import { validateQuery } from "../middleware/validation";

export const titlesRouter = Router();

const listQuerySchema = z.object({
    mediaType: z.enum(["MOVIE", "SHOW"]).optional(),
    status: z.string().optional(),
    inLibrary: z.coerce.boolean().optional(),
    cleanupEligible: z.coerce.boolean().optional(),
    isPinned: z.coerce.boolean().optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(25),
    sortBy: z.enum(["title", "year", "createdAt", "updatedAt"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// GET /titles
titlesRouter.get("/", validateQuery(listQuerySchema), async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;

    const where = {
        ...(q.mediaType ? { mediaType: q.mediaType } : {}),
        ...(q.status ? { status: q.status as never } : {}),
        ...(q.inLibrary !== undefined ? { inLibrary: q.inLibrary } : {}),
        ...(q.cleanupEligible !== undefined ? { cleanupEligible: q.cleanupEligible } : {}),
        ...(q.isPinned !== undefined ? { isPinned: q.isPinned } : {}),
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
});

// GET /titles/:id
titlesRouter.get("/:id", async (req, res) => {
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
});

// PATCH /titles/:id/lifecycle — admin can directly update lifecycle fields
titlesRouter.patch("/:id/lifecycle", async (req, res) => {
    const allowed = ["lifecyclePolicy", "isTemporary", "isPinned", "keepUntil", "cleanupEligible", "cleanupReason"];
    const update = Object.fromEntries(
        Object.entries(req.body as Record<string, unknown>).filter(([k]) => allowed.includes(k))
    );

    const title = await prisma.title.update({
        where: { id: req.params.id },
        data: update,
    });
    res.json({ success: true, data: title });
});

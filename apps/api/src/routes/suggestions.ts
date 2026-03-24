import { Router } from "express";
import { z } from "zod";
import { prisma } from "@watchwarden/db";
import { AppError } from "../middleware/error";
import { validateQuery } from "../middleware/validation";

export const suggestionsRouter = Router();

const listQuerySchema = z.object({
    mediaType: z.enum(["MOVIE", "SHOW"]).optional(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "SNOOZED"]).optional(),
    minScore: z.coerce.number().min(0).max(1).optional(),
    isPinned: z.coerce.boolean().optional(),
    inLibrary: z.coerce.boolean().optional(),
    isRequested: z.coerce.boolean().optional(),
    cleanupEligible: z.coerce.boolean().optional(),
    sortBy: z.enum(["finalScore", "generatedAt", "title"]).default("finalScore"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(25),
});

// GET /suggestions
suggestionsRouter.get("/", validateQuery(listQuerySchema), async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;

    const titleWhere = {
        ...(q.mediaType ? { mediaType: q.mediaType } : {}),
        ...(q.isPinned !== undefined ? { isPinned: q.isPinned } : {}),
        ...(q.inLibrary !== undefined ? { inLibrary: q.inLibrary } : {}),
        ...(q.isRequested !== undefined ? { isRequested: q.isRequested } : {}),
        ...(q.cleanupEligible !== undefined ? { cleanupEligible: q.cleanupEligible } : {}),
    };

    const where = {
        ...(q.status ? { status: q.status } : {}),
        ...(q.minScore !== undefined ? { finalScore: { gte: q.minScore } } : {}),
        title: Object.keys(titleWhere).length ? titleWhere : undefined,
    };

    // Determine orderBy — title.title requires a relation sort
    const orderBy =
        q.sortBy === "title"
            ? { title: { title: q.sortOrder as "asc" | "desc" } }
            : { [q.sortBy]: q.sortOrder as "asc" | "desc" };

    const [items, total] = await Promise.all([
        prisma.suggestion.findMany({
            where,
            orderBy,
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
            include: {
                title: true,
                decisions: { orderBy: { createdAt: "desc" }, take: 1 },
            },
        }),
        prisma.suggestion.count({ where }),
    ]);

    return res.json({
        success: true,
        data: { items, total, page: q.page, pageSize: q.pageSize, totalPages: Math.ceil(total / q.pageSize) },
    });
});

// GET /suggestions/:id
suggestionsRouter.get("/:id", async (req, res) => {
    const suggestion = await prisma.suggestion.findUnique({
        where: { id: req.params.id },
        include: {
            title: {
                include: {
                    trendSnapshots: { orderBy: { snapshotAt: "desc" }, take: 3 },
                    watchSignals: true,
                    requestRecord: true,
                },
            },
            decisions: { orderBy: { createdAt: "desc" } },
        },
    });
    if (!suggestion) throw new AppError(404, "Suggestion not found");
    return res.json({ success: true, data: suggestion });
});

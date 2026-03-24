import { Router } from "express";
import { z } from "zod";
import { prisma } from "@watchwarden/db";
import { validateQuery } from "../middleware/validation";

export const auditRouter = Router();

const listQuerySchema = z.object({
    action: z.string().optional(),
    entityType: z.string().optional(),
    titleId: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(50),
});

// GET /audit
auditRouter.get("/", validateQuery(listQuerySchema), async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;

    const where = {
        ...(q.action ? { action: { contains: q.action } } : {}),
        ...(q.entityType ? { entityType: q.entityType } : {}),
        ...(q.titleId ? { titleId: q.titleId } : {}),
    };

    const [items, total] = await Promise.all([
        prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
            include: {
                title: { select: { title: true, mediaType: true } },
            },
        }),
        prisma.auditLog.count({ where }),
    ]);

    res.json({
        success: true,
        data: { items, total, page: q.page, pageSize: q.pageSize, totalPages: Math.ceil(total / q.pageSize) },
    });
});

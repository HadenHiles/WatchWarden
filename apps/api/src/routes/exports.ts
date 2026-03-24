import { Router } from "express";
import { prisma } from "@watchwarden/db";
import { ExportService } from "../services/export.service";

export const exportsRouter = Router();
const exportService = new ExportService();

// GET /exports — list published export records
exportsRouter.get("/", async (req, res) => {
    const page = parseInt(String(req.query.page ?? 1), 10);
    const pageSize = Math.min(parseInt(String(req.query.pageSize ?? 20), 10), 100);

    const [items, total] = await Promise.all([
        prisma.publishedExport.findMany({
            orderBy: { generatedAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
        prisma.publishedExport.count(),
    ]);

    res.json({
        success: true,
        data: { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
});

// POST /exports/generate — trigger an immediate export generation
exportsRouter.post("/generate", async (_req, res) => {
    const results = await exportService.generateAllExports();
    res.json({ success: true, data: results });
});

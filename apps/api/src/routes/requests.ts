import { Router } from "express";
import { prisma } from "@watchwarden/db";
import { createLogger } from "@watchwarden/config";
import { AppError, asyncHandler } from "../middleware/error";
import { RequestService } from "../services/request.service";

export const requestsRouter = Router();
const requestService = new RequestService();
const logger = createLogger("requests-route");

// POST /requests/backfill — submit Jellyseerr requests for all APPROVED titles that
// never had a request submitted (e.g. approvals made before the auto-submit fix).
// Skips titles that already have an active (PENDING / PROCESSING / AVAILABLE) request.
requestsRouter.post("/backfill", asyncHandler(async (_req, res) => {
    // Find APPROVED titles with no request, or only a FAILED/DECLINED request
    const titles = await prisma.title.findMany({
        where: {
            status: "APPROVED",
            tmdbId: { not: null },
            OR: [
                { requestRecord: null },
                { requestRecord: { requestStatus: { in: ["FAILED", "DECLINED"] } } },
            ],
        },
        select: { id: true, title: true },
    });

    logger.info(`Backfill: found ${titles.length} approved title(s) without an active request`);

    const results = await Promise.allSettled(
        titles.map((t) => requestService.submitRequest(t.id))
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    res.json({
        success: true,
        data: { total: titles.length, submitted: succeeded, failed },
    });
}));

// GET /requests — all request records
requestsRouter.get("/", asyncHandler(async (req, res) => {
    const page = parseInt(String(req.query.page ?? 1), 10);
    const pageSize = Math.min(parseInt(String(req.query.pageSize ?? 25), 10), 100);
    const status = req.query.status as string | undefined;

    const where = status ? { requestStatus: status as never } : {};

    const [items, total] = await Promise.all([
        prisma.requestRecord.findMany({
            where,
            orderBy: { requestedAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: { title: { select: { title: true, mediaType: true, year: true, posterPath: true } } },
        }),
        prisma.requestRecord.count({ where }),
    ]);

    res.json({
        success: true,
        data: { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
}));

// GET /requests/:titleId — request record for a specific title
requestsRouter.get("/:titleId", asyncHandler(async (req, res) => {
    const record = await prisma.requestRecord.findUnique({
        where: { titleId: req.params.titleId },
        include: { title: true },
    });
    if (!record) throw new AppError(404, "Request record not found");
    res.json({ success: true, data: record });
}));

// POST /requests/:titleId/retry — retry a failed request
requestsRouter.post("/:titleId/retry", asyncHandler(async (req, res) => {
    const record = await prisma.requestRecord.findUnique({
        where: { titleId: req.params.titleId },
        include: { title: true },
    });
    if (!record) throw new AppError(404, "Request record not found");
    if (!["FAILED", "DECLINED"].includes(record.requestStatus)) {
        throw new AppError(400, "Can only retry FAILED or DECLINED requests");
    }

    const result = await requestService.submitRequest(req.params.titleId);
    res.json({ success: true, data: result });
}));

// POST /requests/:titleId — submit a new request (idempotent — upserts if already exists)
requestsRouter.post("/:titleId", asyncHandler(async (req, res) => {
    const result = await requestService.submitRequest(req.params.titleId);
    res.json({ success: true, data: result });
}));

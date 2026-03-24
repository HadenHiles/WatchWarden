import { Router } from "express";
import { prisma } from "@watchwarden/db";
import { AppError } from "../middleware/error";
import { RequestService } from "../services/request.service";

export const requestsRouter = Router();
const requestService = new RequestService();

// GET /requests — all request records
requestsRouter.get("/", async (req, res) => {
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
});

// GET /requests/:titleId — request record for a specific title
requestsRouter.get("/:titleId", async (req, res) => {
    const record = await prisma.requestRecord.findUnique({
        where: { titleId: req.params.titleId },
        include: { title: true },
    });
    if (!record) throw new AppError(404, "Request record not found");
    res.json({ success: true, data: record });
});

// POST /requests/:titleId/retry — retry a failed request
requestsRouter.post("/:titleId/retry", async (req, res) => {
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
});

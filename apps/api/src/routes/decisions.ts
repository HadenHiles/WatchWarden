import { Router } from "express";
import { z } from "zod";
import { prisma } from "@watchwarden/db";
import { validateBody } from "../middleware/validation";
import { AppError } from "../middleware/error";
import { DecisionService } from "../services/decision.service";

export const decisionsRouter = Router();

const decisionSchema = z.object({
    suggestionId: z.string(),
    action: z.enum(["APPROVE", "REJECT", "SNOOZE", "PIN", "UNPIN", "MARK_PERMANENT", "MARK_TEMPORARY", "EXTEND_RETENTION", "FORCE_CLEANUP_ELIGIBLE", "UNDO"]),
    reason: z.string().optional(),
    snoozeDays: z.number().int().positive().optional(),
    extendDays: z.number().int().positive().optional(),
});

const bulkDecisionSchema = z.object({
    suggestionIds: z.array(z.string()).min(1).max(50),
    action: z.enum(["APPROVE", "REJECT", "SNOOZE", "PIN", "MARK_TEMPORARY", "EXTEND_RETENTION"]),
    reason: z.string().optional(),
    snoozeDays: z.number().int().positive().optional(),
    extendDays: z.number().int().positive().optional(),
});

const service = new DecisionService();

// POST /decisions — single decision
decisionsRouter.post("/", validateBody(decisionSchema), async (req, res) => {
    const input = req.body as z.infer<typeof decisionSchema>;
    const result = await service.applyDecision(input);
    res.json({ success: true, data: result });
});

// POST /decisions/bulk — bulk decision
decisionsRouter.post("/bulk", validateBody(bulkDecisionSchema), async (req, res) => {
    const { suggestionIds, action, reason, snoozeDays, extendDays } = req.body as z.infer<typeof bulkDecisionSchema>;

    const results = await Promise.allSettled(
        suggestionIds.map((id) =>
            service.applyDecision({ suggestionId: id, action, reason, snoozeDays, extendDays })
        )
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    res.json({ success: true, data: { total: suggestionIds.length, succeeded, failed } });
});

// GET /decisions — list recent decisions
decisionsRouter.get("/", async (req, res) => {
    const page = parseInt(String(req.query.page ?? 1), 10);
    const pageSize = Math.min(parseInt(String(req.query.pageSize ?? 25), 10), 100);

    const [items, total] = await Promise.all([
        prisma.suggestionDecision.findMany({
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: {
                suggestion: {
                    include: { title: { select: { title: true, mediaType: true, posterPath: true } } },
                },
            },
        }),
        prisma.suggestionDecision.count(),
    ]);

    res.json({
        success: true,
        data: { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
});

// GET /decisions/:suggestionId — all decisions for a suggestion
decisionsRouter.get("/:suggestionId", async (req, res) => {
    const suggestion = await prisma.suggestion.findUnique({
        where: { id: req.params.suggestionId },
    });
    if (!suggestion) throw new AppError(404, "Suggestion not found");

    const decisions = await prisma.suggestionDecision.findMany({
        where: { suggestionId: req.params.suggestionId },
        orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: decisions });
});

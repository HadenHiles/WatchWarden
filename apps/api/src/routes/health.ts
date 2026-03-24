import { Router } from "express";
import { prisma } from "@watchwarden/db";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
    try {
        // Quick DB connectivity check
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: "ok", service: "watchwarden-api", db: "ok", timestamp: new Date().toISOString() });
    } catch {
        res.status(503).json({ status: "degraded", service: "watchwarden-api", db: "error" });
    }
});

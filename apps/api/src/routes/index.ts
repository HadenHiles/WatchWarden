import { Router } from "express";
import type { ApiEnv } from "@watchwarden/config";
import { healthRouter } from "./health";
import { authRouter } from "./auth";
import { settingsRouter } from "./settings";
import { sourcesRouter } from "./sources";
import { jobsRouter } from "./jobs";
import { titlesRouter } from "./titles";
import { suggestionsRouter } from "./suggestions";
import { decisionsRouter } from "./decisions";
import { requestsRouter } from "./requests";
import { exportsRouter } from "./exports";
import { auditRouter } from "./audit";
import { plexRouter } from "./plex";
import { statsRouter } from "./stats";
import { requireAuth } from "../middleware/auth";

export function createRouter(env: ApiEnv) {
    const router = Router();

    // Public endpoints
    router.use("/health", healthRouter);
    router.use("/auth", authRouter(env));

    // Protected endpoints (require admin session or API_SECRET bearer token)
    router.use("/settings", requireAuth, settingsRouter);
    router.use("/sources", requireAuth, sourcesRouter);
    router.use("/jobs", requireAuth, jobsRouter);
    router.use("/titles", requireAuth, titlesRouter);
    router.use("/suggestions", requireAuth, suggestionsRouter);
    router.use("/decisions", requireAuth, decisionsRouter);
    router.use("/requests", requireAuth, requestsRouter);
    router.use("/exports", requireAuth, exportsRouter);
    router.use("/audit", requireAuth, auditRouter);
    router.use("/plex", requireAuth, plexRouter);
    router.use("/stats", requireAuth, statsRouter);

    return router;
}

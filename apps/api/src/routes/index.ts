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
import { plexRouter, curationStatusHandler, curationRefreshHandler, retentionKeepHandler } from "./plex";
import { statsRouter } from "./stats";
import { discoverRouter } from "./discover";
import { requireAuth, requireCurationRead, requireCurationControl } from "../middleware/auth";

export function createRouter(env: ApiEnv) {
    const router = Router();

    // Public endpoints
    router.use("/health", healthRouter);
    router.use("/auth", authRouter(env));
    router.get("/plex/curation-status", requireCurationRead, curationStatusHandler);
    router.post("/plex/curation-refresh", requireCurationControl, curationRefreshHandler);
    router.post("/plex/retention/:titleId/keep", requireCurationControl, retentionKeepHandler);

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
    router.use("/discover", requireAuth, discoverRouter);
    router.use("/stats", requireAuth, statsRouter);

    return router;
}

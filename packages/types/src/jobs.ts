import type { JobStatus } from "./media";

// ─── Job run record ───────────────────────────────────────────────────────────

export interface JobRun {
    id: string;
    jobName: string;
    status: JobStatus;
    startedAt: Date;
    finishedAt: Date | null;
    duration: number | null;
    itemsProcessed: number | null;
    error: string | null;
    metadata: Record<string, unknown> | null;
}

// ─── Named jobs the system manages ───────────────────────────────────────────

export type JobName =
    | "trend-sync"
    | "tautulli-sync"
    | "scoring"
    | "jellyseerr-status-sync"
    | "library-sync"
    | "lifecycle-eval"
    | "export";

export interface JobStatusSummary {
    jobName: JobName;
    lastRun: JobRun | null;
    recentRuns: JobRun[];
    successCount: number;
    failureCount: number;
    isRunning: boolean;
}

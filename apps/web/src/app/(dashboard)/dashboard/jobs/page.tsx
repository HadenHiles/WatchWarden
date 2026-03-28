"use client";

import { useState } from "react";
import useSWR from "swr";
import { Play, ChevronDown, ChevronUp } from "lucide-react";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { formatDate } from "@/lib/utils";
import { apiUrl } from "@/lib/api-client";

const fetcher = (url: string) =>
    fetch(url, { credentials: "include" }).then((r) => r.json());

const JOB_META: Record<string, { label: string; description: string }> = {
    "trend-sync": {
        label: "Trend Sync",
        description: "Fetches trending titles from TMDB and Trakt and upserts them into the local database.",
    },
    "tautulli-sync": {
        label: "Tautulli Sync",
        description: "Pulls recent Plex watch history from Tautulli and records local watch signals for scoring.",
    },
    "scoring": {
        label: "Scoring",
        description: "Recalculates suggestion scores for all active titles using trend data, watch signals, and editorial boosts.",
    },
    "jellyseerr-status-sync": {
        label: "Jellyseerr Status Sync",
        description: "Polls Jellyseerr for status updates on pending media requests and syncs them back to WatchWarden.",
    },
    "library-sync": {
        label: "Library Sync",
        description: "Syncs TMDB streaming provider availability (watchlist / watch providers) for all tracked titles.",
    },
    "lifecycle-eval": {
        label: "Lifecycle Evaluation",
        description: "Evaluates retention policies for approved titles and marks ones that are eligible for cleanup.",
    },
    "export": {
        label: "Export",
        description: "Generates JSON export files (active trending, cleanup eligible) consumed by Plex smart collections.",
    },
    "plex-library-sync": {
        label: "Plex Library Sync",
        description: "Scans the Plex library to update in-library status and plexRatingKey on all tracked titles.",
    },
    "plex-sync": {
        label: "Plex Collection Sync",
        description: "Resolves current members for each managed Plex collection and pushes the updated item list to Plex.",
    },
};

interface JobRun {
    id: string;
    status: string;
    startedAt: string;
    completedAt?: string;
    duration?: number;
    error?: string;
}

interface JobSummary {
    jobName: string;
    lastRun: JobRun | null;
    recentRuns: JobRun[];
    successCount: number;
    failureCount: number;
}

export default function JobsPage() {
    const { data, isLoading, mutate } = useSWR<{ data: JobSummary[] }>(
        apiUrl("/jobs"),
        fetcher,
        { refreshInterval: 15000 }
    );
    const [triggering, setTriggering] = useState<string | null>(null);
    const [expandedJob, setExpandedJob] = useState<string | null>(null);

    async function triggerJob(jobName: string) {
        setTriggering(jobName);
        try {
            await fetch(apiUrl(`/jobs/${jobName}/trigger`), {
                method: "POST",
                credentials: "include",
            });
            setTimeout(() => mutate(), 2000);
        } finally {
            setTriggering(null);
        }
    }

    const jobs = data?.data ?? [];

    return (
        <div className="space-y-4 max-w-3xl">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-white">Jobs</h1>
                <p className="text-xs text-gray-500">Auto-refreshes every 15s</p>
            </div>

            {isLoading && (
                <div className="space-y-2">
                    {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="h-16 rounded-xl bg-gray-800 animate-pulse" />
                    ))}
                </div>
            )}

            <div className="space-y-2">
                {jobs.map((job) => {
                    const meta = JOB_META[job.jobName];
                    return (
                        <div key={job.jobName} className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-white">
                                            {meta?.label ?? job.jobName}
                                        </span>
                                        {job.lastRun && (
                                            <JobStatusBadge status={job.lastRun.status as never} />
                                        )}
                                        {job.failureCount > 0 && (
                                            <span className="text-xs text-red-400">{job.failureCount} failed</span>
                                        )}
                                    </div>
                                    {meta?.description && (
                                        <p className="text-xs text-gray-500 max-w-md">{meta.description}</p>
                                    )}
                                    {job.lastRun ? (
                                        <div className="text-xs text-gray-600">
                                            Last run: {formatDate(job.lastRun.startedAt)}
                                            {job.lastRun.duration != null && ` — ${(job.lastRun.duration / 1000).toFixed(1)}s`}
                                            {job.lastRun.error && (
                                                <span className="text-red-400 ml-2">{job.lastRun.error}</span>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-gray-600">Never run</span>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    {job.recentRuns && job.recentRuns.length > 1 && (
                                        <button
                                            onClick={() => setExpandedJob(expandedJob === job.jobName ? null : job.jobName)}
                                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                                        >
                                            {expandedJob === job.jobName ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                            History
                                        </button>
                                    )}
                                    <button
                                        onClick={() => triggerJob(job.jobName)}
                                        disabled={triggering === job.jobName || job.lastRun?.status === "RUNNING"}
                                        className="flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700 transition-colors disabled:opacity-50"
                                    >
                                        <Play className="w-3 h-3" />
                                        {triggering === job.jobName ? "Queuing…" : "Trigger"}
                                    </button>
                                </div>
                            </div>

                            {expandedJob === job.jobName && job.recentRuns && job.recentRuns.length > 1 && (
                                <div className="border-t border-gray-800 px-4 py-2 space-y-1">
                                    <p className="text-xs text-gray-600 uppercase tracking-wide mb-1.5">Recent runs</p>
                                    {job.recentRuns.slice(1).map((run) => (
                                        <div key={run.id} className="flex items-center gap-3 text-xs text-gray-500">
                                            <JobStatusBadge status={run.status as never} />
                                            <span>{formatDate(run.startedAt)}</span>
                                            {run.duration != null && <span>{(run.duration / 1000).toFixed(1)}s</span>}
                                            {run.error && <span className="text-red-400 truncate">{run.error}</span>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

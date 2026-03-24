"use client";

import { useState } from "react";
import useSWR from "swr";
import { Play } from "lucide-react";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { formatDate } from "@/lib/utils";
import { apiUrl } from "@/lib/api-client";

const fetcher = (url: string) =>
    fetch(url, { credentials: "include" }).then((r) => r.json());

interface JobSummary {
    jobName: string;
    lastRun: {
        status: string;
        startedAt: string;
        completedAt?: string;
        duration?: number;
        error?: string;
    } | null;
}

export default function JobsPage() {
    const { data, isLoading, mutate } = useSWR<{ data: JobSummary[] }>(
        apiUrl("/jobs"),
        fetcher,
        { refreshInterval: 15000 }
    );
    const [triggering, setTriggering] = useState<string | null>(null);

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
                {jobs.map((job) => (
                    <div
                        key={job.jobName}
                        className="flex items-center justify-between rounded-xl bg-gray-900 border border-gray-800 px-4 py-3"
                    >
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-sm text-white">{job.jobName}</span>
                                {job.lastRun && (
                                    <JobStatusBadge status={job.lastRun.status as never} />
                                )}
                            </div>
                            {job.lastRun ? (
                                <div className="text-xs text-gray-500">
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

                        <button
                            onClick={() => triggerJob(job.jobName)}
                            disabled={triggering === job.jobName || job.lastRun?.status === "RUNNING"}
                            className="flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700 transition-colors disabled:opacity-50"
                        >
                            <Play className="w-3 h-3" />
                            {triggering === job.jobName ? "Queuing…" : "Trigger"}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

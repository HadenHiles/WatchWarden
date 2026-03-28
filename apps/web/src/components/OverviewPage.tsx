"use client";

import Link from "next/link";
import useSWR from "swr";
import { AlertTriangle, Film, Tv, Loader2, Trash2, ChevronRight, RefreshCw } from "lucide-react";
import { apiUrl } from "@/lib/api-client";

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((r) => r.json());

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatsData {
    suggestions: { pendingMovies: number; pendingShows: number };
    titles: {
        approved: number;
        requested: number;
        available: number;
        trending: number;
        cleanupEligible: number;
        pinned: number;
        inLibrary: number;
    };
    jobs: Array<{
        jobName: string;
        last: {
            id: string;
            status: "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";
            startedAt: string;
            completedAt: string | null;
            errorMessage: string | null;
        } | null;
    }>;
    recentDecisions: Array<{
        id: string;
        action: string;
        createdAt: string;
        suggestion: {
            title: { title: string; mediaType: string; posterPath: string | null };
        };
    }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const JOB_LABELS: Record<string, string> = {
    "trend-sync": "Trend Sync",
    "tautulli-sync": "Tautulli Sync",
    "scoring": "Scoring",
    "jellyseerr-status-sync": "Jellyseerr Sync",
    "library-sync": "Library Sync",
    "lifecycle-eval": "Lifecycle Eval",
    "export": "Export",
    "plex-library-sync": "Plex Library",
    "plex-sync": "Plex Sync",
};

const DECISION_LABELS: Record<string, { label: string; color: string }> = {
    APPROVE: { label: "Approved", color: "text-green-400" },
    REJECT: { label: "Rejected", color: "text-red-400" },
    SNOOZE: { label: "Snoozed", color: "text-brand-400" },
    PIN: { label: "Pinned", color: "text-pink-400" },
    UNPIN: { label: "Unpinned", color: "text-gray-400" },
    UNDO: { label: "Undone", color: "text-gray-400" },
    MARK_PERMANENT: { label: "Marked permanent", color: "text-teal-400" },
    MARK_TEMPORARY: { label: "Marked temporary", color: "text-sky-400" },
    EXTEND_RETENTION: { label: "Extended", color: "text-purple-400" },
    FORCE_CLEANUP_ELIGIBLE: { label: "Forced cleanup", color: "text-orange-400" },
};

function timeAgo(date: string): string {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function JobDot({ status }: { status: "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED" | null }) {
    if (!status) return <span className="w-2 h-2 rounded-full bg-gray-700 inline-block" />;
    if (status === "RUNNING") return <span className="w-2 h-2 rounded-full bg-sky-400 inline-block animate-pulse" />;
    if (status === "COMPLETED") return <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />;
    if (status === "FAILED") return <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />;
    return <span className="w-2 h-2 rounded-full bg-gray-600 inline-block" />;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OverviewPage() {
    const { data, isLoading, mutate } = useSWR<{ data: StatsData }>(
        apiUrl("/stats"),
        fetcher,
        { refreshInterval: 30_000 }
    );

    const stats = data?.data;
    const failedJobs = stats?.jobs.filter((j) => j.last?.status === "FAILED") ?? [];
    const pendingTotal = (stats?.suggestions.pendingMovies ?? 0) + (stats?.suggestions.pendingShows ?? 0);

    return (
        <div className="space-y-6 max-w-4xl w-full">
            <div className="flex items-center justify-between">
                <h1 className="text-lg font-semibold text-white tracking-tight">Overview</h1>
                <button
                    onClick={() => mutate()}
                    className="p-1.5 rounded-lg text-gray-600 hover:text-gray-300 transition-colors"
                    title="Refresh"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {/* ── Attention banner ── */}
            {!isLoading && (failedJobs.length > 0 || (stats?.titles.cleanupEligible ?? 0) > 0) && (
                <div className="space-y-2">
                    {failedJobs.map((j) => (
                        <div key={j.jobName} className="flex items-center gap-3 rounded-xl bg-red-950/30 border border-red-900/40 px-4 py-3">
                            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                            <span className="text-sm text-red-300">
                                <span className="font-semibold">{JOB_LABELS[j.jobName] ?? j.jobName}</span> job failed
                                {j.last?.errorMessage && <span className="text-red-400/70 ml-1.5">— {j.last.errorMessage}</span>}
                            </span>
                            <Link href="/dashboard/jobs" className="ml-auto text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1">
                                View <ChevronRight className="w-3 h-3" />
                            </Link>
                        </div>
                    ))}
                    {(stats?.titles.cleanupEligible ?? 0) > 0 && (
                        <div className="flex items-center gap-3 rounded-xl bg-orange-950/30 border border-orange-900/40 px-4 py-3">
                            <Trash2 className="w-4 h-4 text-orange-400 flex-shrink-0" />
                            <span className="text-sm text-orange-300">
                                <span className="font-semibold">{stats!.titles.cleanupEligible}</span> title{stats!.titles.cleanupEligible !== 1 ? "s" : ""} eligible for cleanup
                            </span>
                            <Link href="/dashboard/library?status=CLEANUP_ELIGIBLE" className="ml-auto text-xs text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-1">
                                Review <ChevronRight className="w-3 h-3" />
                            </Link>
                        </div>
                    )}
                </div>
            )}

            {/* ── Pending suggestions CTA ── */}
            <div className="rounded-xl bg-gray-900 border border-gray-800/80 p-5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-white">Pending Review</h2>
                    {isLoading && <Loader2 className="w-4 h-4 text-gray-600 animate-spin" />}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Link
                        href="/dashboard/suggestions?tab=movies"
                        className="group flex items-center gap-3 rounded-lg bg-gray-800/60 border border-gray-700/60 hover:border-brand-500/40 hover:bg-gray-800/90 px-4 py-3.5 transition-all"
                    >
                        <Film className="w-5 h-5 text-gray-500 group-hover:text-brand-400 transition-colors flex-shrink-0" />
                        <div className="min-w-0">
                            <div className="text-2xl font-bold text-white tabular-nums">
                                {isLoading ? "—" : stats?.suggestions.pendingMovies ?? 0}
                            </div>
                            <div className="text-xs text-gray-500">Movies</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-700 group-hover:text-brand-400 ml-auto transition-colors" />
                    </Link>
                    <Link
                        href="/dashboard/suggestions?tab=shows"
                        className="group flex items-center gap-3 rounded-lg bg-gray-800/60 border border-gray-700/60 hover:border-brand-500/40 hover:bg-gray-800/90 px-4 py-3.5 transition-all"
                    >
                        <Tv className="w-5 h-5 text-gray-500 group-hover:text-brand-400 transition-colors flex-shrink-0" />
                        <div className="min-w-0">
                            <div className="text-2xl font-bold text-white tabular-nums">
                                {isLoading ? "—" : stats?.suggestions.pendingShows ?? 0}
                            </div>
                            <div className="text-xs text-gray-500">TV Shows</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-700 group-hover:text-brand-400 ml-auto transition-colors" />
                    </Link>
                </div>
                {!isLoading && pendingTotal > 0 && (
                    <Link
                        href="/dashboard/suggestions"
                        className="mt-3 flex items-center justify-center gap-2 w-full rounded-lg bg-brand-500 hover:bg-brand-600 text-gray-950 text-sm font-semibold py-2.5 transition-colors"
                    >
                        Review all {pendingTotal} pending
                        <ChevronRight className="w-4 h-4" />
                    </Link>
                )}
            </div>

            {/* ── Pipeline stats ── */}
            <div className="rounded-xl bg-gray-900 border border-gray-800/80 p-5">
                <h2 className="text-sm font-semibold text-white mb-4">Pipeline</h2>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                    {[
                        { label: "Approved", value: stats?.titles.approved, href: "/dashboard/library?status=APPROVED", color: "text-green-400" },
                        { label: "Requested", value: stats?.titles.requested, href: "/dashboard/library?status=REQUESTED", color: "text-purple-400" },
                        { label: "Available", value: stats?.titles.available, href: "/dashboard/library?status=AVAILABLE", color: "text-teal-400" },
                        { label: "Trending", value: stats?.titles.trending, href: "/dashboard/library?status=ACTIVE_TRENDING", color: "text-sky-400" },
                        { label: "Pinned", value: stats?.titles.pinned, href: "/dashboard/library?status=PINNED", color: "text-pink-400" },
                        { label: "In Library", value: stats?.titles.inLibrary, href: "/dashboard/library", color: "text-gray-300" },
                    ].map(({ label, value, href, color }) => (
                        <Link
                            key={label}
                            href={href}
                            className="group flex flex-col rounded-lg bg-gray-800/50 border border-gray-700/50 hover:border-gray-600/70 px-3 py-3 transition-all text-center"
                        >
                            <span className={`text-xl font-bold tabular-nums ${color}`}>
                                {isLoading ? "—" : value ?? 0}
                            </span>
                            <span className="text-[11px] text-gray-600 mt-0.5">{label}</span>
                        </Link>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* ── Job health ── */}
                <div className="rounded-xl bg-gray-900 border border-gray-800/80 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold text-white">Automation Health</h2>
                        <Link href="/dashboard/jobs" className="text-xs text-gray-600 hover:text-gray-300 transition-colors">
                            Manage →
                        </Link>
                    </div>
                    {isLoading ? (
                        <div className="space-y-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="h-7 rounded-lg bg-gray-800/60 animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {stats?.jobs.map((j) => (
                                <div key={j.jobName} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                                    <JobDot status={j.last?.status ?? null} />
                                    <span className="text-xs text-gray-400 flex-1 truncate">{JOB_LABELS[j.jobName] ?? j.jobName}</span>
                                    <span className="text-[11px] text-gray-700 tabular-nums flex-shrink-0">
                                        {j.last ? timeAgo(j.last.startedAt) : "never"}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Recent decisions ── */}
                <div className="rounded-xl bg-gray-900 border border-gray-800/80 p-5">
                    <h2 className="text-sm font-semibold text-white mb-4">Recent Decisions</h2>
                    {isLoading ? (
                        <div className="space-y-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="h-7 rounded-lg bg-gray-800/60 animate-pulse" />
                            ))}
                        </div>
                    ) : !stats?.recentDecisions.length ? (
                        <p className="text-sm text-gray-700">No decisions yet.</p>
                    ) : (
                        <div className="space-y-1.5">
                            {stats.recentDecisions.map((d) => {
                                const meta = DECISION_LABELS[d.action] ?? { label: d.action, color: "text-gray-400" };
                                return (
                                    <div key={d.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                                        <span className={`text-xs font-medium flex-shrink-0 w-20 ${meta.color}`}>{meta.label}</span>
                                        <span className="text-xs text-gray-400 flex-1 truncate">{d.suggestion.title.title}</span>
                                        <span className="text-[11px] text-gray-700 tabular-nums flex-shrink-0">{timeAgo(d.createdAt)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

"use client";

import { useState } from "react";
import useSWR from "swr";
import Image from "next/image";
import { RotateCcw, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { apiUrl } from "@/lib/api-client";

const fetcher = (url: string) =>
    fetch(url, { credentials: "include" }).then((r) => r.json());

interface RequestRecord {
    id: string;
    titleId: string;
    requestStatus: string;
    requestedAt: string;
    updatedAt: string;
    jellyseerrRequestId?: number | null;
    failureReason?: string | null;
    retryCount: number;
    title: {
        title: string;
        mediaType: "MOVIE" | "SHOW";
        year?: number | null;
        posterPath?: string | null;
    };
}

const STATUS_COLORS: Record<string, string> = {
    PENDING: "text-yellow-400",
    APPROVED: "text-blue-400",
    PROCESSING: "text-purple-400",
    AVAILABLE: "text-teal-400",
    DECLINED: "text-red-400",
    FAILED: "text-red-500",
};

export default function RequestsPage() {
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [retrying, setRetrying] = useState<string | null>(null);
    const [backfilling, setBackfilling] = useState(false);
    const [backfillResult, setBackfillResult] = useState<{
        total: number; submitted: number; failed: number;
    } | null>(null);
    const [backfillError, setBackfillError] = useState<string | null>(null);

    const params = new URLSearchParams();
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    params.set("page", String(page));
    params.set("pageSize", "25");

    const { data, isLoading, mutate } = useSWR<{
        data: { items: RequestRecord[]; total: number; page: number; totalPages: number };
    }>(apiUrl(`/requests?${params.toString()}`), fetcher);

    const items = data?.data?.items ?? [];
    const pagination = data?.data;

    async function retryRequest(titleId: string) {
        setRetrying(titleId);
        try {
            await fetch(apiUrl(`/requests/${titleId}/retry`), {
                method: "POST",
                credentials: "include",
            });
            mutate();
        } finally {
            setRetrying(null);
        }
    }

    async function runBackfill() {
        setBackfilling(true);
        setBackfillResult(null);
        setBackfillError(null);
        try {
            const res = await fetch(apiUrl("/requests/backfill"), {
                method: "POST",
                credentials: "include",
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
                setBackfillError(json.error ?? "Backfill failed");
            } else {
                setBackfillResult(json.data);
                mutate();
            }
        } catch (e) {
            setBackfillError(e instanceof Error ? e.message : "Network error");
        } finally {
            setBackfilling(false);
        }
    }

    return (
        <div className="space-y-4 max-w-4xl">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-white">Requests</h1>
                <div className="flex items-center gap-3">
                    <button
                        onClick={runBackfill}
                        disabled={backfilling}
                        title="Submit Jellyseerr requests for all approved titles that were never sent"
                        className="flex items-center gap-1.5 text-sm rounded-lg px-3 py-1.5 bg-brand-600/20 hover:bg-brand-600/30 text-brand-400 border border-brand-600/40 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${backfilling ? "animate-spin" : ""}`} />
                        {backfilling ? "Backfilling…" : "Backfill Approved"}
                    </button>
                    <select
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                        className="text-sm rounded-lg bg-gray-800 border border-gray-700 text-gray-300 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="PENDING">Pending</option>
                        <option value="APPROVED">Approved</option>
                        <option value="PROCESSING">Processing</option>
                        <option value="AVAILABLE">Available</option>
                        <option value="DECLINED">Declined</option>
                        <option value="FAILED">Failed</option>
                    </select>
                </div>
            </div>

            {/* Backfill result banner */}
            {backfillResult && (
                <div className="flex items-start gap-3 rounded-xl border border-teal-700/50 bg-teal-900/20 px-4 py-3 text-sm text-teal-300">
                    <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>
                        <span className="font-medium">Backfill complete.</span>{" "}
                        {backfillResult.total === 0
                            ? "No approved titles were missing a request."
                            : `${backfillResult.submitted} of ${backfillResult.total} approved title(s) submitted to Jellyseerr${backfillResult.failed > 0 ? ` (${backfillResult.failed} failed — check the table below)` : "."}`}
                    </div>
                    <button onClick={() => setBackfillResult(null)} className="ml-auto text-teal-500 hover:text-teal-300 text-xs">✕</button>
                </div>
            )}

            {/* Backfill error banner */}
            {backfillError && (
                <div className="flex items-start gap-3 rounded-xl border border-red-700/50 bg-red-900/20 px-4 py-3 text-sm text-red-300">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div><span className="font-medium">Backfill failed:</span> {backfillError}</div>
                    <button onClick={() => setBackfillError(null)} className="ml-auto text-red-500 hover:text-red-300 text-xs">✕</button>
                </div>
            )}

            {isLoading && (
                <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-16 rounded-xl bg-gray-800 animate-pulse" />
                    ))}
                </div>
            )}

            {!isLoading && items.length === 0 && (
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-12 text-center text-gray-500">
                    No requests found.
                </div>
            )}

            {items.length > 0 && (
                <div className="rounded-xl border border-gray-800 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-800/50 text-gray-400 uppercase text-xs tracking-wide">
                            <tr>
                                <th className="px-4 py-3 text-left" colSpan={2}>Title</th>
                                <th className="px-4 py-3 text-left">Status</th>
                                <th className="px-4 py-3 text-left">Jellyseerr ID</th>
                                <th className="px-4 py-3 text-left">Retries</th>
                                <th className="px-4 py-3 text-left">Requested</th>
                                <th className="px-4 py-3 text-left"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {items.map((r) => {
                                const posterUrl = r.title.posterPath
                                    ? (r.title.posterPath.startsWith("http")
                                        ? r.title.posterPath
                                        : `https://image.tmdb.org/t/p/w92${r.title.posterPath}`)
                                    : null;
                                return (
                                    <tr key={r.id} className="bg-gray-900 hover:bg-gray-800/50 transition-colors">
                                        <td className="px-4 py-3 w-10">
                                            {posterUrl ? (
                                                <Image src={posterUrl} alt={r.title.title} width={32} height={48}
                                                    className="rounded object-cover" />
                                            ) : (
                                                <div className="w-8 h-12 rounded bg-gray-700" />
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="font-medium text-white">{r.title.title}</span>
                                            {r.title.year && <span className="text-gray-500 ml-1">({r.title.year})</span>}
                                            <div className="text-xs text-gray-500 mt-0.5">
                                                {r.title.mediaType === "MOVIE" ? "Movie" : "TV"}
                                            </div>
                                            {r.failureReason && (
                                                <div className="text-xs text-red-400 mt-0.5 max-w-xs truncate"
                                                    title={r.failureReason}>
                                                    {r.failureReason}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs font-medium ${STATUS_COLORS[r.requestStatus] ?? "text-gray-400"}`}>
                                                {r.requestStatus}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                                            {r.jellyseerrRequestId ?? "—"}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-xs text-center">
                                            {r.retryCount}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                                            {formatDate(r.requestedAt)}
                                        </td>
                                        <td className="px-4 py-3">
                                            {(r.requestStatus === "FAILED" || r.requestStatus === "DECLINED") && (
                                                <button
                                                    onClick={() => retryRequest(r.titleId)}
                                                    disabled={retrying === r.titleId}
                                                    title="Retry request"
                                                    className="flex items-center gap-1 text-xs rounded-lg px-2 py-1 bg-gray-800 text-gray-400 hover:text-white border border-gray-700 transition-colors disabled:opacity-50"
                                                >
                                                    <RotateCcw className="w-3 h-3" />
                                                    Retry
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                    <span className="text-sm text-gray-500">
                        Page {page} of {pagination.totalPages} — {pagination.total} total
                    </span>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}
                            className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white disabled:opacity-40 transition-colors">
                            Prev
                        </button>
                        <button onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.totalPages}
                            className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white disabled:opacity-40 transition-colors">
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

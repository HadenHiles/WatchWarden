"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import { SuggestionCard, type SuggestionCardData } from "@/components/SuggestionCard";
import { apiUrl } from "@/lib/api-client";

const fetcher = (url: string) =>
    fetch(url, { credentials: "include" }).then((r) => r.json());

// ─── Source helpers ───────────────────────────────────────────────────────────

const SOURCE_ORDER = ["TMDB", "Trakt", "Other"] as const;
type SourceLabel = (typeof SOURCE_ORDER)[number];

function getPrimarySourceLabel(trendSnapshots?: Array<{ source: string; trendScore: number }>): SourceLabel {
    if (!trendSnapshots?.length) return "Other";
    const top = [...trendSnapshots].sort((a, b) => b.trendScore - a.trendScore)[0];
    if (top.source.startsWith("tmdb_")) return "TMDB";
    if (top.source.startsWith("trakt_")) return "Trakt";
    return "Other";
}

function groupBySource(items: SuggestionCardData[]): Array<[SourceLabel, SuggestionCardData[]]> {
    const grouped: Partial<Record<SourceLabel, SuggestionCardData[]>> = {};
    for (const item of items) {
        const label = getPrimarySourceLabel(item.title.trendSnapshots);
        (grouped[label] ??= []).push(item);
    }
    return SOURCE_ORDER.filter((l) => grouped[l]?.length).map((l) => [l, grouped[l]!]);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface SuggestionsPageProps {
    mediaType: "MOVIE" | "SHOW";
    hideHeading?: boolean;
}

export function SuggestionsPage({ mediaType, hideHeading }: SuggestionsPageProps) {
    const [sortBy, setSortBy] = useState<"finalScore" | "generatedAt">("finalScore");
    const [statusFilter, setStatusFilter] = useState<string>("PENDING");
    const [page, setPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkLoading, setBulkLoading] = useState(false);

    const url = apiUrl(
        `/suggestions?mediaType=${mediaType}&status=${statusFilter}&inLibrary=false&sortBy=${sortBy}&pageSize=25&page=${page}`
    );
    const { data, mutate, isLoading } = useSWR<{
        data: { items: SuggestionCardData[]; total: number; page: number; pageSize: number; totalPages: number };
    }>(url, fetcher);

    const handleDecision = useCallback(() => {
        mutate();
        setSelectedIds(new Set());
    }, [mutate]);

    const items = data?.data?.items ?? [];
    const pagination = data?.data;
    const allSelected = items.length > 0 && items.every((s) => selectedIds.has(s.id));
    const groups = groupBySource(items);

    function toggleAll() {
        setSelectedIds(allSelected ? new Set() : new Set(items.map((s) => s.id)));
    }

    function toggleOne(id: string) {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function bulkDecision(action: string) {
        if (selectedIds.size === 0 || bulkLoading) return;
        setBulkLoading(true);
        try {
            await fetch(apiUrl("/decisions/bulk"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ suggestionIds: [...selectedIds], action }),
                credentials: "include",
            });
            setSelectedIds(new Set());
            mutate();
        } finally {
            setBulkLoading(false);
        }
    }

    return (
        <div className="space-y-5">
            {!hideHeading && (
                <div className="flex items-center justify-between">
                    <h1 className="text-lg font-semibold text-white tracking-tight">
                        {mediaType === "MOVIE" ? "Movie" : "TV Show"} Suggestions
                    </h1>

                    <div className="flex items-center gap-2">
                        <select
                            value={statusFilter}
                            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); setSelectedIds(new Set()); }}
                            className="text-xs rounded-lg bg-gray-800/80 border border-gray-700/60 text-gray-400 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500/60 hover:border-gray-600 transition-colors"
                        >
                            <option value="PENDING">Pending</option>
                            <option value="APPROVED">Approved</option>
                            <option value="REJECTED">Rejected</option>
                            <option value="SNOOZED">Snoozed</option>
                            <option value="FULFILLED">Fulfilled</option>
                        </select>

                        <select
                            value={sortBy}
                            onChange={(e) => { setSortBy(e.target.value as typeof sortBy); setPage(1); }}
                            className="text-xs rounded-lg bg-gray-800/80 border border-gray-700/60 text-gray-400 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500/60 hover:border-gray-600 transition-colors"
                        >
                            <option value="finalScore">By Score</option>
                            <option value="generatedAt">By Date</option>
                        </select>
                    </div>
                </div>
            )}
            {hideHeading && (
                <div className="flex items-center gap-2 justify-end">
                    <select
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(1); setSelectedIds(new Set()); }}
                        className="text-xs rounded-lg bg-gray-800/80 border border-gray-700/60 text-gray-400 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500/60 hover:border-gray-600 transition-colors"
                    >
                        <option value="PENDING">Pending</option>
                        <option value="APPROVED">Approved</option>
                        <option value="REJECTED">Rejected</option>
                        <option value="SNOOZED">Snoozed</option>
                        <option value="FULFILLED">Fulfilled</option>
                    </select>

                    <select
                        value={sortBy}
                        onChange={(e) => { setSortBy(e.target.value as typeof sortBy); setPage(1); }}
                        className="text-xs rounded-lg bg-gray-800/80 border border-gray-700/60 text-gray-400 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500/60 hover:border-gray-600 transition-colors"
                    >
                        <option value="finalScore">By Score</option>
                        <option value="generatedAt">By Date</option>
                    </select>
                </div>
            )}

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 rounded-xl bg-gray-900/90 border border-brand-500/20 px-4 py-2.5 animate-fade-in">
                    <span className="text-xs font-semibold text-brand-400">{selectedIds.size} selected</span>
                    <div className="w-px h-4 bg-gray-800" />
                    <button onClick={() => bulkDecision("APPROVE")} disabled={bulkLoading}
                        className="text-xs rounded-lg px-3 py-1.5 bg-green-950/60 text-green-400 hover:bg-green-900/60 border border-green-900/60 transition-all disabled:opacity-50">
                        Approve All
                    </button>
                    <button onClick={() => bulkDecision("REJECT")} disabled={bulkLoading}
                        className="text-xs rounded-lg px-3 py-1.5 bg-red-950/60 text-red-400 hover:bg-red-900/60 border border-red-900/60 transition-all disabled:opacity-50">
                        Reject All
                    </button>
                    <button onClick={() => bulkDecision("SNOOZE")} disabled={bulkLoading}
                        className="text-xs rounded-lg px-3 py-1.5 bg-brand-950/60 text-brand-400 hover:bg-brand-900/40 border border-brand-900/60 transition-all disabled:opacity-50">
                        Snooze All
                    </button>
                    <button onClick={() => setSelectedIds(new Set())}
                        className="ml-auto text-xs text-gray-600 hover:text-gray-400 transition-colors">
                        Clear
                    </button>
                </div>
            )}

            {isLoading && (
                <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-32 rounded-xl bg-gray-900/60 animate-pulse" />
                    ))}
                </div>
            )}

            {!isLoading && items.length === 0 && (
                <div className="rounded-xl border border-gray-800/60 bg-gray-900/40 p-14 text-center text-gray-600">
                    No {statusFilter.toLowerCase()} suggestions.
                </div>
            )}

            {items.length > 0 && (
                <div className="space-y-1">
                    <div className="flex items-center gap-2 px-1 pb-1.5">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll}
                            className="w-4 h-4 accent-brand-500 cursor-pointer rounded" />
                        <span className="text-xs text-gray-600">Select all on this page</span>
                    </div>
                    <div className="space-y-6">
                        {groups.map(([label, groupItems]) => (
                            <div key={label}>
                                {/* Source group header */}
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                                        {label}
                                    </span>
                                    <span className="text-[11px] text-gray-700 tabular-nums">
                                        {groupItems.length}
                                    </span>
                                    <div className="flex-1 h-px bg-gray-800/60" />
                                </div>
                                <div className="space-y-3">
                                    {groupItems.map((s) => (
                                        <div key={s.id} className="flex items-start gap-2.5">
                                            <div className="pt-3.5 flex-shrink-0">
                                                <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleOne(s.id)}
                                                    className="w-4 h-4 accent-brand-500 cursor-pointer" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <SuggestionCard suggestion={s} onDecision={handleDecision} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-3">
                    <span className="text-xs text-gray-600">
                        {((page - 1) * (pagination.pageSize ?? 25)) + 1}–{Math.min(page * (pagination.pageSize ?? 25), pagination.total)} of {pagination.total}
                    </span>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}
                            className="text-xs px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/60 text-gray-500 hover:text-gray-200 hover:border-gray-600 disabled:opacity-40 transition-all">
                            Prev
                        </button>
                        <span className="text-xs text-gray-600 tabular-nums">{page} / {pagination.totalPages}</span>
                        <button onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.totalPages}
                            className="text-xs px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/60 text-gray-500 hover:text-gray-200 hover:border-gray-600 disabled:opacity-40 transition-all">
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}


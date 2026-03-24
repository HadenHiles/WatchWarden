"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import { SuggestionCard, type SuggestionCardData } from "@/components/SuggestionCard";
import { apiUrl } from "@/lib/api-client";

const fetcher = (url: string) =>
    fetch(url, { credentials: "include" }).then((r) => r.json());

interface SuggestionsPageProps {
    mediaType: "MOVIE" | "SHOW";
}

export function SuggestionsPage({ mediaType }: SuggestionsPageProps) {
    const [sortBy, setSortBy] = useState<"finalScore" | "generatedAt">("finalScore");
    const [statusFilter, setStatusFilter] = useState<string>("PENDING");
    const [page, setPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkLoading, setBulkLoading] = useState(false);

    const url = apiUrl(
        `/suggestions?mediaType=${mediaType}&status=${statusFilter}&sortBy=${sortBy}&pageSize=25&page=${page}`
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
        <div className="space-y-4 max-w-3xl">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-white">
                    {mediaType === "MOVIE" ? "Movie" : "TV Show"} Suggestions
                </h1>

                <div className="flex items-center gap-2">
                    <select
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(1); setSelectedIds(new Set()); }}
                        className="text-sm rounded-lg bg-gray-800 border border-gray-700 text-gray-300 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                        <option value="PENDING">Pending</option>
                        <option value="APPROVED">Approved</option>
                        <option value="REJECTED">Rejected</option>
                        <option value="SNOOZED">Snoozed</option>
                    </select>

                    <select
                        value={sortBy}
                        onChange={(e) => { setSortBy(e.target.value as typeof sortBy); setPage(1); }}
                        className="text-sm rounded-lg bg-gray-800 border border-gray-700 text-gray-300 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                        <option value="finalScore">By Score</option>
                        <option value="generatedAt">By Date</option>
                    </select>
                </div>
            </div>

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 rounded-xl bg-gray-900 border border-brand-700 px-4 py-2.5">
                    <span className="text-sm font-medium text-brand-300">{selectedIds.size} selected</span>
                    <button onClick={() => bulkDecision("APPROVE")} disabled={bulkLoading}
                        className="text-xs rounded-lg px-3 py-1.5 bg-green-900/50 text-green-300 hover:bg-green-900 border border-green-800 transition-colors disabled:opacity-50">
                        Approve All
                    </button>
                    <button onClick={() => bulkDecision("REJECT")} disabled={bulkLoading}
                        className="text-xs rounded-lg px-3 py-1.5 bg-red-900/50 text-red-300 hover:bg-red-900 border border-red-800 transition-colors disabled:opacity-50">
                        Reject All
                    </button>
                    <button onClick={() => bulkDecision("SNOOZE")} disabled={bulkLoading}
                        className="text-xs rounded-lg px-3 py-1.5 bg-yellow-900/50 text-yellow-300 hover:bg-yellow-900 border border-yellow-800 transition-colors disabled:opacity-50">
                        Snooze All
                    </button>
                    <button onClick={() => setSelectedIds(new Set())}
                        className="ml-auto text-xs text-gray-500 hover:text-gray-300 transition-colors">
                        Clear selection
                    </button>
                </div>
            )}

            {isLoading && (
                <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-28 rounded-xl bg-gray-800 animate-pulse" />
                    ))}
                </div>
            )}

            {!isLoading && items.length === 0 && (
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-12 text-center text-gray-500">
                    No {statusFilter.toLowerCase()} suggestions found.
                </div>
            )}

            {items.length > 0 && (
                <div className="space-y-1">
                    <div className="flex items-center gap-2 px-1 pb-1">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll}
                            className="w-4 h-4 accent-brand-500 cursor-pointer" />
                        <span className="text-xs text-gray-500">Select all on this page</span>
                    </div>
                    <div className="space-y-3">
                        {items.map((s) => (
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
            )}

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                    <span className="text-sm text-gray-500">
                        {((page - 1) * (pagination.pageSize ?? 25)) + 1}–{Math.min(page * (pagination.pageSize ?? 25), pagination.total)} of {pagination.total}
                    </span>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}
                            className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white disabled:opacity-40 transition-colors">
                            Prev
                        </button>
                        <span className="text-sm text-gray-500">{page} / {pagination.totalPages}</span>
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

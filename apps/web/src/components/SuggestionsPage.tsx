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

    const url = apiUrl(
        `/suggestions?mediaType=${mediaType}&status=${statusFilter}&sortBy=${sortBy}&limit=50`
    );
    const { data, mutate, isLoading } = useSWR<{ data: { items: SuggestionCardData[] } }>(url, fetcher);

    const handleDecision = useCallback(() => {
        mutate();
    }, [mutate]);

    const items = data?.data?.items ?? [];

    return (
        <div className="space-y-4 max-w-3xl">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-white">
                    {mediaType === "MOVIE" ? "Movie" : "TV Show"} Suggestions
                </h1>

                <div className="flex items-center gap-2">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="text-sm rounded-lg bg-gray-800 border border-gray-700 text-gray-300 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                        <option value="PENDING">Pending</option>
                        <option value="APPROVED">Approved</option>
                        <option value="REJECTED">Rejected</option>
                        <option value="SNOOZED">Snoozed</option>
                    </select>

                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                        className="text-sm rounded-lg bg-gray-800 border border-gray-700 text-gray-300 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                        <option value="finalScore">By Score</option>
                        <option value="generatedAt">By Date</option>
                    </select>
                </div>
            </div>

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

            <div className="space-y-3">
                {items.map((s) => (
                    <SuggestionCard key={s.id} suggestion={s} onDecision={handleDecision} />
                ))}
            </div>
        </div>
    );
}

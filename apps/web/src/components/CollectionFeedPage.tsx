"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import useSWR from "swr";
import { Check, X, Loader2, Film, RefreshCw, Plus, ChevronRight } from "lucide-react";
import { apiUrl } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((r) => r.json());

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeedSuggestion {
    id: string;
    finalScore: number;
    title: {
        id: string;
        title: string;
        year?: number | null;
        mediaType: "MOVIE" | "SHOW";
        posterPath?: string | null;
        overview?: string | null;
        inLibrary: boolean;
        isRequested: boolean;
        plexRatingKey?: string | null;
        status: string;
        trendSnapshots: Array<{ source: string; trendScore: number }>;
    };
}

interface FeedCollection {
    id: string;
    name: string;
    mediaType: "MOVIE" | "SHOW";
    filter: string;
    enabled: boolean;
    itemCount: number;
    lastSyncAt: string | null;
    suggestions: FeedSuggestion[];
}

// ─── Source label helpers ─────────────────────────────────────────────────────

function getSourceBadge(snapshots: Array<{ source: string; trendScore: number }>) {
    if (!snapshots?.length) return null;
    const top = [...snapshots].sort((a, b) => b.trendScore - a.trendScore)[0];
    if (top.source.startsWith("tmdb_")) return { label: "TMDB", cls: "bg-blue-950/60 text-blue-300 border-blue-800/50" };
    if (top.source.startsWith("trakt_")) return { label: "Trakt", cls: "bg-red-950/60 text-red-300 border-red-800/50" };
    return { label: "Trend", cls: "bg-gray-800/60 text-gray-400 border-gray-700/50" };
}

// ─── Single poster card ───────────────────────────────────────────────────────

function SuggestionPosterCard({
    suggestion,
    onApprove,
    onReject,
}: {
    suggestion: FeedSuggestion;
    onApprove: (suggestionId: string, inLibrary: boolean) => Promise<void>;
    onReject: (suggestionId: string) => Promise<void>;
}) {
    const { title } = suggestion;
    const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
    const [done, setDone] = useState<"approve" | "reject" | null>(null);

    const posterUrl = title.posterPath
        ? `https://image.tmdb.org/t/p/w185${title.posterPath}`
        : null;

    const sourceBadge = getSourceBadge(title.trendSnapshots);

    async function handle(action: "approve" | "reject") {
        if (loading || done) return;
        setLoading(action);
        try {
            if (action === "approve") {
                await onApprove(suggestion.id, title.inLibrary);
            } else {
                await onReject(suggestion.id);
            }
            setDone(action);
        } finally {
            setLoading(null);
        }
    }

    if (done === "reject") return null;

    return (
        <div className={cn(
            "relative flex-shrink-0 w-36 rounded-xl overflow-hidden bg-gray-900 border transition-all duration-200",
            done === "approve"
                ? "border-green-500/50 ring-1 ring-green-500/30"
                : "border-gray-800/80 hover:border-gray-700/80"
        )}>
            {/* Poster */}
            <div className="relative w-full aspect-[2/3] bg-gray-800">
                {posterUrl ? (
                    <Image src={posterUrl} alt={title.title} fill className="object-cover" sizes="144px" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-700">
                        <Film className="w-8 h-8" />
                    </div>
                )}

                {/* Overlay tags */}
                <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
                    {title.inLibrary && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-900/90 text-teal-300 border border-teal-700/50 backdrop-blur-sm">
                            In Plex
                        </span>
                    )}
                    {title.isRequested && !title.inLibrary && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-900/90 text-purple-300 border border-purple-700/50 backdrop-blur-sm">
                            Requested
                        </span>
                    )}
                    {sourceBadge && (
                        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border backdrop-blur-sm", sourceBadge.cls)}>
                            {sourceBadge.label}
                        </span>
                    )}
                </div>

                {/* Approved check overlay */}
                {done === "approve" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-green-950/70 backdrop-blur-sm">
                        <Check className="w-10 h-10 text-green-400" strokeWidth={3} />
                    </div>
                )}
            </div>

            {/* Title */}
            <div className="px-2 pt-2 pb-1 min-h-0">
                <p className="text-xs font-medium text-white leading-snug line-clamp-2">
                    {title.title}
                    {title.year && <span className="text-gray-600 ml-1">({title.year})</span>}
                </p>
            </div>

            {/* Actions */}
            <div className="flex gap-1 px-2 pb-2 pt-1">
                <button
                    onClick={() => handle("approve")}
                    disabled={!!loading || !!done}
                    title={title.inLibrary ? "Add to collection" : "Request + add to collection"}
                    className={cn(
                        "flex-1 flex items-center justify-center rounded-lg py-1.5 border transition-all disabled:opacity-50",
                        done === "approve"
                            ? "bg-green-500/20 border-green-500/40 text-green-400"
                            : "bg-gray-800/60 border-gray-700/60 text-gray-400 hover:bg-green-950/60 hover:border-green-800/60 hover:text-green-400"
                    )}
                >
                    {loading === "approve"
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                    onClick={() => handle("reject")}
                    disabled={!!loading || !!done}
                    title="Reject"
                    className="flex-1 flex items-center justify-center rounded-lg py-1.5 border bg-gray-800/60 border-gray-700/60 text-gray-400 hover:bg-red-950/60 hover:border-red-800/60 hover:text-red-400 transition-all disabled:opacity-50"
                >
                    {loading === "reject"
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <X className="w-3.5 h-3.5" />}
                </button>
            </div>
        </div>
    );
}

function CollectionRow({
    collection,
    onApprove,
    onReject,
}: {
    collection: FeedCollection;
    onApprove: (suggestionId: string, inLibrary: boolean) => Promise<void>;
    onReject: (suggestionId: string) => Promise<void>;
}) {
    const [items, setItems] = useState(collection.suggestions);

    function handleApprove(suggestionId: string, inLibrary: boolean) {
        return onApprove(suggestionId, inLibrary);
    }

    function handleReject(suggestionId: string) {
        return onReject(suggestionId).then(() => {
            setItems((prev) => prev.filter((s) => s.id !== suggestionId));
        });
    }

    const inPlexCount = items.filter((s) => s.title.inLibrary).length;

    if (items.length === 0) return null;

    return (
        <div className="space-y-3">
            {/* Row header */}
            <div className="flex items-center gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-white truncate">{collection.name}</h2>
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-800/60 border border-gray-700/50 text-gray-500 flex-shrink-0">
                            {collection.mediaType === "MOVIE" ? "Movies" : "Shows"}
                        </span>
                        {inPlexCount > 0 && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-teal-900/40 border border-teal-800/40 text-teal-400 flex-shrink-0">
                                {inPlexCount} in Plex
                            </span>
                        )}
                    </div>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                        {items.length} pending · {collection.itemCount} currently in collection
                    </p>
                </div>
                <div className="flex-1 h-px bg-gray-800/60" />
                <span className="text-[11px] text-gray-700 flex-shrink-0">{FILTER_LABELS[collection.filter] ?? collection.filter}</span>
            </div>

            {/* Horizontal scroll */}
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-800">
                {items.map((s) => (
                    <SuggestionPosterCard
                        key={s.id}
                        suggestion={s}
                        onApprove={handleApprove}
                        onReject={handleReject}
                    />
                ))}
            </div>
        </div>
    );
}

const FILTER_LABELS: Record<string, string> = {
    ACTIVE_TRENDING: "Active & Trending",
    PINNED: "Pinned",
    APPROVED: "Approved",
};

// ─── Main component ───────────────────────────────────────────────────────────

export function CollectionFeedPage() {
    const { data, isLoading, mutate } = useSWR<{ data: FeedCollection[] }>(
        apiUrl("/plex/collections/feed"),
        fetcher,
        { revalidateOnFocus: false }
    );

    const collections = data?.data ?? [];
    const populated = collections.filter((c) => c.suggestions.length > 0);

    const handleApprove = useCallback(async (suggestionId: string, inLibrary: boolean) => {
        await fetch(apiUrl("/decisions"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ suggestionId, action: "APPROVE" }),
            credentials: "include",
        });

        if (!inLibrary) {
            const suggestion = data?.data
                .flatMap((c) => c.suggestions)
                .find((s) => s.id === suggestionId);
            if (suggestion) {
                await fetch(apiUrl(`/requests/${suggestion.title.id}`), {
                    method: "POST",
                    credentials: "include",
                }).catch(() => {/* non-fatal */ });
            }
        }
    }, [data]);

    const handleReject = useCallback(async (suggestionId: string) => {
        await fetch(apiUrl("/decisions"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ suggestionId, action: "REJECT" }),
            credentials: "include",
        });
    }, []);

    if (!isLoading && collections.length === 0) {
        return (
            <div className="space-y-4 max-w-4xl">
                <h1 className="text-lg font-semibold text-white tracking-tight">Suggestions</h1>
                <div className="rounded-xl border border-gray-800/60 bg-gray-900/40 p-14 text-center space-y-3">
                    <p className="text-gray-500">No Plex collections configured yet.</p>
                    <Link
                        href="/dashboard/plex/collections"
                        className="inline-flex items-center gap-2 text-sm rounded-lg px-4 py-2 bg-brand-500 hover:bg-brand-600 text-gray-950 font-semibold transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Create a collection
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 max-w-5xl">
            <div className="flex items-center justify-between">
                <h1 className="text-lg font-semibold text-white tracking-tight">Suggestions</h1>
                <div className="flex items-center gap-3">
                    <Link
                        href="/dashboard/plex/collections"
                        className="text-xs text-gray-600 hover:text-gray-300 transition-colors flex items-center gap-1"
                    >
                        Manage collections <ChevronRight className="w-3 h-3" />
                    </Link>
                    <button
                        onClick={() => mutate()}
                        className="p-1.5 rounded-lg text-gray-600 hover:text-gray-300 transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
                <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-green-400" /> Approve + add to collection (or request if not in Plex)</span>
                <span className="flex items-center gap-1.5"><X className="w-3 h-3 text-red-400" /> Reject</span>
                <span className="flex items-center gap-1.5"><span className="px-1 rounded bg-teal-900/50 text-teal-300 border border-teal-800/40">In Plex</span> Already in your library</span>
                <span className="flex items-center gap-1.5"><span className="px-1 rounded bg-blue-900/50 text-blue-300 border border-blue-800/40">TMDB</span> <span className="px-1 rounded bg-red-900/50 text-red-300 border border-red-800/40">Trakt</span> Trend source</span>
            </div>

            {isLoading && (
                <div className="space-y-8">
                    {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="space-y-3">
                            <div className="h-5 w-48 rounded bg-gray-800/60 animate-pulse" />
                            <div className="flex gap-3">
                                {Array.from({ length: 6 }).map((_, j) => (
                                    <div key={j} className="flex-shrink-0 w-36 aspect-[2/3] rounded-xl bg-gray-900/60 animate-pulse" />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!isLoading && populated.length === 0 && (
                <div className="rounded-xl border border-gray-800/60 bg-gray-900/40 p-14 text-center text-gray-600">
                    No pending suggestions right now.
                </div>
            )}

            {populated.map((collection) => (
                <CollectionRow
                    key={collection.id}
                    collection={collection}
                    onApprove={handleApprove}
                    onReject={handleReject}
                />
            ))}
        </div>
    );
}

"use client";

import { useState } from "react";
import useSWR from "swr";
import {
    Plus,
    Trash2,
    ToggleLeft,
    ToggleRight,
    RefreshCw,
    Loader2,
    Clapperboard,
    Film,
    Tv2,
    AlertCircle,
    Sparkles,
    TrendingUp,
} from "lucide-react";
import { apiUrl } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((r) => r.json());

interface PlexSection {
    key: string;
    title: string;
    type: "movie" | "show" | string;
}

interface PlexCollection {
    id: string;
    name: string;
    plexKey: string | null;
    sectionId: string;
    mediaType: "MOVIE" | "SHOW";
    collectionType: "SMART" | "TOP_TRENDING";
    filter: "ACTIVE_TRENDING" | "PINNED" | "APPROVED";
    streamingProvider: string | null;
    maxItems: number;
    enabled: boolean;
    lastSyncAt: string | null;
    itemCount: number;
}

const FILTER_LABELS: Record<string, string> = {
    ACTIVE_TRENDING: "Active & Trending",
    PINNED: "Pinned Titles",
    APPROVED: "Approved Titles",
};

const FILTER_DESCRIPTIONS: Record<string, string> = {
    ACTIVE_TRENDING: "Titles currently trending that WatchWarden is actively watching",
    PINNED: "Titles manually pinned by an admin — curated picks",
    APPROVED: "Titles approved for acquisition that are now in the library",
};

const STREAMING_PROVIDERS = [
    "Netflix", "Disney+", "Hulu", "Amazon Prime Video", "Apple TV+",
    "Paramount+", "Max", "Peacock", "Crunchyroll", "Shudder",
];

const INPUT_CLS =
    "w-full rounded-lg bg-gray-800/80 border border-gray-700/60 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-500/60 focus:border-brand-500/40 placeholder-gray-600 transition-all";

export default function PlexCollectionsPage() {
    const { data: collectionsData, mutate } = useSWR<{ data: PlexCollection[] }>(
        apiUrl("/plex/collections"),
        fetcher
    );
    const { data: sectionsData } = useSWR<{ data: PlexSection[] }>(
        apiUrl("/plex/sections"),
        fetcher
    );

    const collections = collectionsData?.data ?? [];
    const sections = sectionsData?.data ?? [];

    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        name: "",
        sectionId: "",
        mediaType: "MOVIE" as "MOVIE" | "SHOW",
        collectionType: "SMART" as "SMART" | "TOP_TRENDING",
        filter: "ACTIVE_TRENDING" as "ACTIVE_TRENDING" | "PINNED" | "APPROVED",
        streamingProvider: "",
        maxItems: 5,
    });
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    const [triggeringSync, setTriggeringSync] = useState(false);

    const movieSections = sections.filter((s) => s.type === "movie");
    const showSections = sections.filter((s) => s.type === "show");
    const availableSections = form.mediaType === "MOVIE" ? movieSections : showSections;

    function resetForm() {
        setForm({
            name: "",
            sectionId: "",
            mediaType: "MOVIE",
            collectionType: "SMART",
            filter: "ACTIVE_TRENDING",
            streamingProvider: "",
            maxItems: 5,
        });
        setCreateError(null);
    }

    async function handleCreate() {
        if (!form.name || !form.sectionId) return;
        if (form.collectionType === "TOP_TRENDING" && !form.streamingProvider.trim()) {
            setCreateError("Streaming provider is required for Top Trending collections");
            return;
        }
        setCreating(true);
        setCreateError(null);
        try {
            const payload = {
                name: form.name,
                sectionId: form.sectionId,
                mediaType: form.mediaType,
                collectionType: form.collectionType,
                ...(form.collectionType === "SMART"
                    ? { filter: form.filter }
                    : { streamingProvider: form.streamingProvider.trim(), maxItems: form.maxItems }),
            };
            const res = await fetch(apiUrl("/plex/collections"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok) {
                setCreateError(json.error ?? "Failed to create collection");
                return;
            }
            setShowForm(false);
            resetForm();
            await mutate();
        } finally {
            setCreating(false);
        }
    }

    async function handleToggle(collection: PlexCollection) {
        await fetch(apiUrl(`/plex/collections/${collection.id}`), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ enabled: !collection.enabled }),
        });
        await mutate();
    }

    async function handleDelete(collection: PlexCollection) {
        if (!confirm(`Remove "${collection.name}" from WatchWarden? This will NOT delete the collection from Plex.`)) return;
        await fetch(apiUrl(`/plex/collections/${collection.id}`), {
            method: "DELETE",
            credentials: "include",
        });
        await mutate();
    }

    async function handleTriggerSync() {
        setTriggeringSync(true);
        try {
            await fetch(apiUrl("/jobs/plex-library-sync/trigger"), {
                method: "POST",
                credentials: "include",
            });
            await new Promise((r) => setTimeout(r, 500));
            await fetch(apiUrl("/jobs/plex-sync/trigger"), {
                method: "POST",
                credentials: "include",
            });
        } finally {
            setTimeout(() => setTriggeringSync(false), 2000);
        }
    }

    const plexConfigured = sectionsData && !("error" in (sectionsData as object))
        && Array.isArray(sectionsData.data);

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                        <Clapperboard className="w-4.5 h-4.5 text-brand-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white">Plex Collections</h1>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Automated collections synced directly to your Plex server
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleTriggerSync}
                        disabled={triggeringSync || !plexConfigured}
                        className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors disabled:opacity-40"
                    >
                        {triggeringSync ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <RefreshCw className="w-4 h-4" />
                        )}
                        Sync Now
                    </button>
                    <button
                        onClick={() => setShowForm(true)}
                        disabled={!plexConfigured}
                        className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-gray-950 font-semibold transition-colors disabled:opacity-40"
                    >
                        <Plus className="w-4 h-4" />
                        Add Collection
                    </button>
                </div>
            </div>

            {/* Plex not configured warning */}
            {sectionsData && !plexConfigured && (
                <div className="flex items-start gap-3 rounded-xl border border-yellow-700/50 bg-yellow-900/20 p-4 text-sm text-yellow-300">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>
                        Plex is not configured. Go to{" "}
                        <a href="/dashboard/settings" className="underline underline-offset-2 hover:text-yellow-200">
                            Settings
                        </a>{" "}
                        and enter your Plex Server URL and token.
                    </span>
                </div>
            )}

            {/* Create form */}
            {showForm && (
                <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-5 space-y-5">
                    <h2 className="font-semibold text-white text-sm">New Collection</h2>

                    {/* Collection type toggle */}
                    <div className="space-y-1.5">
                        <label className="text-xs text-gray-400">Collection Type</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setForm((f) => ({ ...f, collectionType: "SMART" }))}
                                className={cn(
                                    "rounded-lg border px-4 py-3 text-left transition-colors",
                                    form.collectionType === "SMART"
                                        ? "border-brand-500/60 bg-brand-500/10 text-brand-300"
                                        : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300"
                                )}
                            >
                                <div className="flex items-center gap-2 font-medium text-sm">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    Smart Collection
                                </div>
                                <p className="text-xs mt-1 opacity-70 leading-relaxed">
                                    Scored suggestions — trending titles + family watch patterns
                                </p>
                            </button>
                            <button
                                type="button"
                                onClick={() => setForm((f) => ({ ...f, collectionType: "TOP_TRENDING" }))}
                                className={cn(
                                    "rounded-lg border px-4 py-3 text-left transition-colors",
                                    form.collectionType === "TOP_TRENDING"
                                        ? "border-brand-500/60 bg-brand-500/10 text-brand-300"
                                        : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300"
                                )}
                            >
                                <div className="flex items-center gap-2 font-medium text-sm">
                                    <TrendingUp className="w-3.5 h-3.5" />
                                    Top Trending
                                </div>
                                <p className="text-xs mt-1 opacity-70 leading-relaxed">
                                    Top-ranked titles available on a specific streaming service
                                </p>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5 col-span-2">
                            <label className="text-xs text-gray-400">Collection Name</label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder={
                                    form.collectionType === "TOP_TRENDING"
                                        ? "Top Netflix Movies"
                                        : "Hot on FamFlix"
                                }
                                className={INPUT_CLS}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs text-gray-400">Media Type</label>
                            <select
                                value={form.mediaType}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        mediaType: e.target.value as "MOVIE" | "SHOW",
                                        sectionId: "",
                                    }))
                                }
                                className={INPUT_CLS}
                            >
                                <option value="MOVIE">Movies</option>
                                <option value="SHOW">TV Shows</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs text-gray-400">Plex Library Section</label>
                            <select
                                value={form.sectionId}
                                onChange={(e) => setForm((f) => ({ ...f, sectionId: e.target.value }))}
                                className={INPUT_CLS}
                                disabled={availableSections.length === 0}
                            >
                                <option value="">Select a section…</option>
                                {availableSections.map((s) => (
                                    <option key={s.key} value={s.key}>
                                        {s.title}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* SMART — filter picker */}
                        {form.collectionType === "SMART" && (
                            <div className="space-y-1.5 col-span-2">
                                <label className="text-xs text-gray-400">Filter</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(["ACTIVE_TRENDING", "PINNED", "APPROVED"] as const).map((f) => (
                                        <button
                                            key={f}
                                            type="button"
                                            onClick={() => setForm((prev) => ({ ...prev, filter: f }))}
                                            className={cn(
                                                "rounded-lg border px-3 py-2 text-xs text-left transition-colors",
                                                form.filter === f
                                                    ? "border-brand-500/60 bg-brand-500/10 text-brand-300"
                                                    : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300"
                                            )}
                                        >
                                            <div className="font-medium">{FILTER_LABELS[f]}</div>
                                            <div className="text-gray-500 mt-0.5 leading-relaxed">
                                                {FILTER_DESCRIPTIONS[f]}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* TOP_TRENDING — provider + maxItems */}
                        {form.collectionType === "TOP_TRENDING" && (
                            <>
                                <div className="space-y-1.5 col-span-2">
                                    <label className="text-xs text-gray-400">Streaming Provider</label>
                                    <input
                                        type="text"
                                        list="providers-list"
                                        value={form.streamingProvider}
                                        onChange={(e) => setForm((f) => ({ ...f, streamingProvider: e.target.value }))}
                                        placeholder="Netflix"
                                        className={INPUT_CLS}
                                    />
                                    <datalist id="providers-list">
                                        {STREAMING_PROVIDERS.map((p) => (
                                            <option key={p} value={p} />
                                        ))}
                                    </datalist>
                                    <p className="text-xs text-gray-600">
                                        Must match the provider name stored on titles (e.g. &quot;Netflix&quot;, &quot;Disney+&quot;)
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs text-gray-400">Max Items</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={50}
                                        value={form.maxItems}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, maxItems: Math.max(1, parseInt(e.target.value) || 5) }))
                                        }
                                        className={INPUT_CLS}
                                    />
                                    <p className="text-xs text-gray-600">Top N titles by trend score (1–50)</p>
                                </div>
                            </>
                        )}
                    </div>

                    {createError && (
                        <p className="text-sm text-red-400 rounded-lg bg-red-900/20 border border-red-800 px-3 py-2">
                            {createError}
                        </p>
                    )}
                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={() => { setShowForm(false); resetForm(); }}
                            className="text-sm px-3 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleCreate}
                            disabled={creating || !form.name || !form.sectionId}
                            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-gray-950 font-semibold transition-colors disabled:opacity-40"
                        >
                            {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Create Collection
                        </button>
                    </div>
                </div>
            )}

            {/* Empty state */}
            {collections.length === 0 && !showForm && (
                <div className="rounded-xl border border-dashed border-gray-700/60 p-12 text-center">
                    <Clapperboard className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-400">No collections yet</p>
                    <p className="text-xs text-gray-600 mt-1 mb-4">
                        Create a collection to start syncing titles directly to Plex
                    </p>
                    {plexConfigured && (
                        <button
                            onClick={() => setShowForm(true)}
                            className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-gray-950 font-semibold transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Add your first collection
                        </button>
                    )}
                </div>
            )}

            {/* Collection list */}
            {collections.length > 0 && (
                <div className="space-y-3">
                    {collections.map((c) => (
                        <div
                            key={c.id}
                            className={cn(
                                "rounded-xl border p-4 transition-colors",
                                c.enabled
                                    ? "border-gray-700/60 bg-gray-900/50"
                                    : "border-gray-800/40 bg-gray-900/20 opacity-60"
                            )}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                                        c.enabled ? "bg-brand-500/10 border border-brand-500/20" : "bg-gray-800/60 border border-gray-700/40"
                                    )}>
                                        {c.mediaType === "MOVIE" ? (
                                            <Film className={cn("w-4 h-4", c.enabled ? "text-brand-400" : "text-gray-600")} />
                                        ) : (
                                            <Tv2 className={cn("w-4 h-4", c.enabled ? "text-brand-400" : "text-gray-600")} />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-medium text-white text-sm truncate">{c.name}</p>
                                            {/* Collection type badge */}
                                            {c.collectionType === "TOP_TRENDING" ? (
                                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 flex-shrink-0">
                                                    <TrendingUp className="w-2.5 h-2.5" />
                                                    Top Trending
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 border border-brand-500/30 text-brand-400 flex-shrink-0">
                                                    <Sparkles className="w-2.5 h-2.5" />
                                                    Smart
                                                </span>
                                            )}
                                            {/* Filter or provider badge */}
                                            {c.collectionType === "SMART" ? (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 flex-shrink-0">
                                                    {FILTER_LABELS[c.filter] ?? c.filter}
                                                </span>
                                            ) : c.streamingProvider ? (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 flex-shrink-0">
                                                    {c.streamingProvider} · top {c.maxItems}
                                                </span>
                                            ) : null}
                                        </div>
                                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                                            <span className="text-xs text-gray-500">
                                                {c.mediaType === "MOVIE" ? "Movies" : "TV Shows"}
                                            </span>
                                            <span className="text-xs text-gray-600">·</span>
                                            <span className="text-xs text-gray-500">
                                                {c.itemCount} item{c.itemCount !== 1 ? "s" : ""}
                                            </span>
                                            {c.plexKey && (
                                                <>
                                                    <span className="text-xs text-gray-600">·</span>
                                                    <span className="text-xs text-green-500/80">Synced to Plex</span>
                                                </>
                                            )}
                                            {c.lastSyncAt && (
                                                <>
                                                    <span className="text-xs text-gray-600">·</span>
                                                    <span className="text-xs text-gray-600">
                                                        Last synced {new Date(c.lastSyncAt).toLocaleDateString()}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <button
                                        onClick={() => handleToggle(c)}
                                        title={c.enabled ? "Disable collection" : "Enable collection"}
                                        className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800/60 transition-colors"
                                    >
                                        {c.enabled ? (
                                            <ToggleRight className="w-5 h-5 text-brand-400" />
                                        ) : (
                                            <ToggleLeft className="w-5 h-5" />
                                        )}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(c)}
                                        title="Remove from WatchWarden"
                                        className="p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* How it works footer */}
            <div className="rounded-xl border border-gray-800/40 p-4 text-xs text-gray-500 space-y-2 leading-relaxed">
                <p className="font-medium text-gray-400">How collections work</p>
                <p>
                    <span className="text-brand-400 font-medium">Smart Collections</span> are driven by WatchWarden&apos;s
                    scoring engine — titles that score highly based on trending signals, local watch history, and editorial
                    boosts are automatically added or removed as scores change.
                </p>
                <p>
                    <span className="text-amber-400 font-medium">Top Trending</span> collections pull the highest-scored
                    titles already in your Plex library that are available on a specific streaming service, capped at the
                    number you choose.
                </p>
                <p>
                    Collections sync on a schedule (default every 6h 45min). Use{" "}
                    <span className="text-gray-300">Sync Now</span> for an immediate library scan + collection update.
                    Collections are created in Plex automatically on first sync and appear on the home screen for all users.
                </p>
            </div>
        </div>
    );
}

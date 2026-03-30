"use client";

import { useState, useRef } from "react";
import useSWR from "swr";
import {
    Plus,
    Pencil,
    List,
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
    X,
    Search,
    Send,
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
    streamingProviders: string[];
    maxItemsPerProvider: number;
    enabled: boolean;
    autoRequest: boolean;
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
    // ── Global services available in Canada ─────────────────────────────────
    "Netflix",
    "Amazon Prime Video",
    "Disney Plus",           // TMDB CA canonical name
    "Apple TV Plus",         // TMDB CA canonical name
    "Crave",                 // Major Canadian — Bell Media
    "Max",
    "Paramount Plus",        // TMDB CA canonical name
    "Crunchyroll",
    "Shudder",
    "BritBox",
    "AMC+",
    "STARZ",
    "Plex",
    "Kanopy",
    // ── Canadian-specific ────────────────────────────────────────────────────
    "CBC Gem",               // Free — Canadian Broadcasting Corporation
    "Tubi TV",              // TMDB CA canonical name
    "Pluto TV",
    "hayu",                  // Reality TV — TMDB uses lowercase
    "STACKTV",               // Corus / Global / HGTV Canada etc.
    "Super Channel On Demand",
    // ── US-only (appear via US fallback in trend-sync) ────────────────────
    "Hulu",
    "Peacock",
    // ── Alternate spellings stored by older TMDB responses ───────────────
    "Prime Video",
    "Disney+",
    "Apple TV+",
    "Paramount+",
    "HBO Max",
    "Tubi",
];

const INPUT_CLS =
    "w-full rounded-lg bg-gray-800/80 border border-gray-700/60 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-500/60 focus:border-brand-500/40 placeholder-gray-600 transition-all";

/** Small inline component for adding providers via a text+datalist input */
function ProviderInput({ current, onAdd }: { current: string[]; onAdd: (p: string) => void }) {
    const ref = useRef<HTMLInputElement>(null);

    function commit() {
        const val = ref.current?.value.trim();
        if (val) {
            onAdd(val);
            if (ref.current) ref.current.value = "";
        }
    }

    return (
        <div className="flex gap-2">
            <input
                ref={ref}
                type="text"
                list="providers-list"
                placeholder="Add provider…"
                className={INPUT_CLS}
                onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commit(); }
                }}
            />
            <datalist id="providers-list">
                {STREAMING_PROVIDERS.filter((p) => !current.includes(p)).map((p) => (
                    <option key={p} value={p} />
                ))}
            </datalist>
            <button
                type="button"
                onClick={commit}
                className="flex-shrink-0 px-3 py-2 rounded-lg border border-gray-700 text-sm text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
            >
                <Plus className="w-4 h-4" />
            </button>
        </div>
    );
}

interface CollectionItem {
    id: string;
    title: string;
    year: number | null;
    posterPath: string | null;
    mediaType: "MOVIE" | "SHOW";
    streamingOn: string[];
    inLibrary: boolean;
    isRequested: boolean;
    manuallyAdded: boolean;
    manuallyExcluded: boolean;
    trendSnapshots: Array<{ trendScore: number; providerId: string | null; providerRank: number | null }>;
}

function CollectionItemsPanel({ collectionId, mediaType }: { collectionId: string; mediaType: "MOVIE" | "SHOW" }) {
    const { data, error, mutate } = useSWR<{ data: CollectionItem[] }>(
        apiUrl(`/plex/collections/${collectionId}/items`),
        fetcher
    );

    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<Array<{ id: string; title: string; year: number | null; posterPath: string | null }>>([]);
    const [searching, setSearching] = useState(false);
    const [addingId, setAddingId] = useState<string | null>(null);
    const [removingId, setRemovingId] = useState<string | null>(null);

    async function handleSearch(q: string) {
        setSearchQuery(q);
        if (q.length < 2) { setSearchResults([]); return; }
        setSearching(true);
        try {
            const res = await fetch(apiUrl(`/titles?search=${encodeURIComponent(q)}&mediaType=${mediaType}&pageSize=10`), { credentials: "include" });
            const json = await res.json();
            setSearchResults(json.data?.items ?? []);
        } finally {
            setSearching(false);
        }
    }

    async function handleAddTitle(titleId: string) {
        setAddingId(titleId);
        try {
            await fetch(apiUrl(`/plex/collections/${collectionId}/titles`), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ titleId, action: "include" }),
            });
            setSearchQuery("");
            setSearchResults([]);
            await mutate();
        } finally {
            setAddingId(null);
        }
    }

    async function handleRemoveTitle(titleId: string) {
        setRemovingId(titleId);
        try {
            await fetch(apiUrl(`/plex/collections/${collectionId}/titles/${titleId}`), {
                method: "DELETE",
                credentials: "include",
            });
            await mutate();
        } finally {
            setRemovingId(null);
        }
    }

    async function handleExcludeTitle(titleId: string) {
        setRemovingId(titleId);
        try {
            await fetch(apiUrl(`/plex/collections/${collectionId}/titles`), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ titleId, action: "exclude" }),
            });
            await mutate();
        } finally {
            setRemovingId(null);
        }
    }

    if (!data && !error) {
        return (
            <div className="border-t border-gray-700/40 p-8 flex justify-center">
                <Loader2 className="w-5 h-5 text-gray-600 animate-spin" />
            </div>
        );
    }

    const items = data?.data ?? [];

    return (
        <div className="border-t border-gray-700/40">
            <div className="px-4 py-2 bg-gray-900/40 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <List className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-xs text-gray-500">{items.length} title{items.length !== 1 ? "s" : ""} in collection</span>
                </div>
                <span className="text-xs text-gray-600">Hover a poster to remove</span>
            </div>

            {/* Manual title search + add */}
            <div className="px-4 py-2 border-b border-gray-700/30">
                <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder="Search to manually add a title…"
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-gray-800/60 border border-gray-700/60 text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-500/50"
                    />
                    {searching && <Loader2 className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 animate-spin" />}
                </div>
                {searchResults.length > 0 && (
                    <div className="mt-1 rounded-lg border border-gray-700/60 bg-gray-900 overflow-hidden divide-y divide-gray-700/40 max-h-48 overflow-y-auto">
                        {searchResults.map((r) => (
                            <div key={r.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800/60 transition-colors">
                                {r.posterPath ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={`https://image.tmdb.org/t/p/w92${r.posterPath}`} alt="" className="w-7 h-10 rounded object-cover bg-gray-800 flex-shrink-0" loading="lazy" />
                                ) : (
                                    <div className="w-7 h-10 rounded bg-gray-800 flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-white font-medium truncate">{r.title}</p>
                                    {r.year && <p className="text-[10px] text-gray-500">{r.year}</p>}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleAddTitle(r.id)}
                                    disabled={addingId === r.id}
                                    className="flex-shrink-0 flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-brand-500/15 border border-brand-500/30 text-brand-400 hover:bg-brand-500/30 transition-colors disabled:opacity-40"
                                >
                                    {addingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                                    Add
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {items.length === 0 ? (
                <div className="p-6 text-center">
                    <p className="text-sm text-gray-500">No items in this collection yet.</p>
                    <p className="text-xs text-gray-600 mt-1">Items appear after the next sync runs or use the search above to add titles manually.</p>
                </div>
            ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2 p-4 max-h-64 overflow-y-auto">
                    {items.map((item) => (
                        <div key={item.id} className="group relative">
                            {item.posterPath ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={`https://image.tmdb.org/t/p/w185${item.posterPath}`}
                                    alt={item.title}
                                    className="w-full aspect-[2/3] rounded object-cover bg-gray-800"
                                    loading="lazy"
                                />
                            ) : (
                                <div className="w-full aspect-[2/3] rounded bg-gray-800 flex items-center justify-center">
                                    {item.mediaType === "MOVIE"
                                        ? <Film className="w-6 h-6 text-gray-600" />
                                        : <Tv2 className="w-6 h-6 text-gray-600" />
                                    }
                                </div>
                            )}
                            {item.manuallyAdded && (
                                <div className="absolute top-0.5 left-0.5">
                                    <span className="text-[8px] px-1 py-0.5 rounded bg-brand-500/80 text-white font-medium">Added</span>
                                </div>
                            )}
                            <div className="absolute inset-0 rounded bg-gray-950/85 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-1 text-center">
                                <p className="text-[10px] text-white font-medium leading-tight line-clamp-2">{item.title}</p>
                                {item.year && <p className="text-[9px] text-gray-400 mt-0.5">{item.year}</p>}
                                <div className="flex gap-1 mt-1.5">
                                    {item.manuallyAdded ? (
                                        <button
                                            type="button"
                                            title="Remove manual addition"
                                            onClick={() => handleRemoveTitle(item.id)}
                                            disabled={removingId === item.id}
                                            className="flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/40 transition-colors disabled:opacity-40"
                                        >
                                            {removingId === item.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <X className="w-2.5 h-2.5" />}
                                            Remove
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            title="Exclude from collection"
                                            onClick={() => handleExcludeTitle(item.id)}
                                            disabled={removingId === item.id}
                                            className="flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/40 transition-colors disabled:opacity-40"
                                        >
                                            {removingId === item.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <X className="w-2.5 h-2.5" />}
                                            Exclude
                                        </button>
                                    )}
                                    {item.manuallyExcluded && (
                                        <button
                                            type="button"
                                            title="Clear exclusion"
                                            onClick={() => handleRemoveTitle(item.id)}
                                            disabled={removingId === item.id}
                                            className="flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/40 transition-colors disabled:opacity-40"
                                        >
                                            <Send className="w-2.5 h-2.5" />
                                            Restore
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

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
        streamingProviders: [] as string[],
        maxItemsPerProvider: 10,
        autoRequest: false,
    });
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    const [triggeringSync, setTriggeringSync] = useState(false);
    const [expandedItemsId, setExpandedItemsId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({
        name: "",
        filter: "ACTIVE_TRENDING" as "ACTIVE_TRENDING" | "PINNED" | "APPROVED",
        streamingProviders: [] as string[],
        maxItemsPerProvider: 10,
        autoRequest: false,
    });
    const [editError, setEditError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

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
            streamingProviders: [] as string[],
            maxItemsPerProvider: 10,
            autoRequest: false,
        });
        setCreateError(null);
    }

    async function handleCreate() {
        if (!form.name || !form.sectionId) return;
        if (form.collectionType === "TOP_TRENDING" && form.streamingProviders.length === 0) {
            setCreateError("At least one streaming provider is required for Top Trending collections");
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
                autoRequest: form.autoRequest,
                ...(form.collectionType === "SMART"
                    ? { filter: form.filter }
                    : { streamingProviders: form.streamingProviders, maxItemsPerProvider: form.maxItemsPerProvider }),
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

    function handleStartEdit(c: PlexCollection) {
        setShowForm(false);
        resetForm();
        setExpandedItemsId(null);
        setEditingId(c.id);
        setEditForm({
            name: c.name,
            filter: c.filter,
            streamingProviders: [...c.streamingProviders],
            maxItemsPerProvider: c.maxItemsPerProvider,
            autoRequest: c.autoRequest,
        });
        setEditError(null);
    }

    function handleCancelEdit() {
        setEditingId(null);
        setEditError(null);
    }

    async function handleSaveEdit() {
        if (!editForm.name) return;
        const col = collections.find((c) => c.id === editingId);
        if (col?.collectionType === "TOP_TRENDING" && editForm.streamingProviders.length === 0) {
            setEditError("At least one streaming provider is required");
            return;
        }
        setSaving(true);
        setEditError(null);
        try {
            const payload: Record<string, unknown> = { name: editForm.name, autoRequest: editForm.autoRequest };
            if (col?.collectionType === "SMART") {
                payload.filter = editForm.filter;
            } else if (col?.collectionType === "TOP_TRENDING") {
                payload.streamingProviders = editForm.streamingProviders;
                payload.maxItemsPerProvider = editForm.maxItemsPerProvider;
            }
            const res = await fetch(apiUrl(`/plex/collections/${editingId}`), {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok) {
                setEditError(json.error ?? "Failed to save changes");
                return;
            }
            setEditingId(null);
            await mutate();
        } finally {
            setSaving(false);
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
                        onClick={() => { setShowForm(true); setEditingId(null); setExpandedItemsId(null); }}
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

                        {/* TOP_TRENDING — providers tag input + maxItems */}
                        {form.collectionType === "TOP_TRENDING" && (
                            <>
                                <div className="space-y-1.5 col-span-2">
                                    <label className="text-xs text-gray-400">Streaming Providers</label>
                                    {/* Tag pills */}
                                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                                        {form.streamingProviders.map((p) => (
                                            <span key={p} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-brand-500/15 border border-brand-500/30 text-brand-300">
                                                {p}
                                                <button
                                                    type="button"
                                                    onClick={() => setForm((f) => ({ ...f, streamingProviders: f.streamingProviders.filter((x) => x !== p) }))}
                                                    className="leading-none text-brand-400 hover:text-red-400 transition-colors"
                                                    aria-label={`Remove ${p}`}
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    {/* Add provider input */}
                                    <ProviderInput
                                        current={form.streamingProviders}
                                        onAdd={(p) => setForm((f) => ({
                                            ...f,
                                            streamingProviders: f.streamingProviders.includes(p)
                                                ? f.streamingProviders
                                                : [...f.streamingProviders, p],
                                        }))}
                                    />
                                    <p className="text-xs text-gray-600">
                                        Provider names must match what&apos;s stored on titles (e.g. &quot;Netflix&quot;, &quot;Disney+&quot;)
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs text-gray-400">Max Items Per Provider</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={50}
                                        value={form.maxItemsPerProvider}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, maxItemsPerProvider: Math.max(1, parseInt(e.target.value) || 10) }))
                                        }
                                        className={INPUT_CLS}
                                    />
                                    <p className="text-xs text-gray-600">Top N titles per provider, interleaved (#1 Netflix, #1 Prime, #1 Disney+, #2 Netflix…)</p>
                                </div>
                            </>
                        )}

                        {/* Auto-request toggle */}
                        <div className="col-span-2 flex items-center justify-between rounded-lg border border-gray-700/60 bg-gray-800/40 px-4 py-3">
                            <div>
                                <p className="text-sm font-medium text-white">Auto-request in Jellyseerr</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Automatically submit Jellyseerr requests for collection titles not yet in your library
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setForm((f) => ({ ...f, autoRequest: !f.autoRequest }))}
                                className={cn(
                                    "relative flex-shrink-0 w-10 h-5 rounded-full transition-colors",
                                    form.autoRequest ? "bg-brand-500" : "bg-gray-700"
                                )}
                            >
                                <span className={cn(
                                    "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                                    form.autoRequest ? "translate-x-5" : "translate-x-0"
                                )} />
                            </button>
                        </div>
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
                            onClick={() => { setShowForm(true); setEditingId(null); }}
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
                                "rounded-xl border overflow-hidden transition-colors",
                                c.enabled
                                    ? "border-gray-700/60 bg-gray-900/50"
                                    : "border-gray-800/40 bg-gray-900/20 opacity-60"
                            )}
                        >
                            <div className="flex items-start justify-between gap-4 p-4">
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
                                            ) : c.streamingProviders?.length ? (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 flex-shrink-0">
                                                    {c.streamingProviders.join(", ")} · top {c.maxItemsPerProvider}/provider
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
                                        onClick={() => { setEditingId(null); setExpandedItemsId(expandedItemsId === c.id ? null : c.id); }}
                                        title="View collection items"
                                        className={cn(
                                            "p-2 rounded-lg transition-colors",
                                            expandedItemsId === c.id && editingId !== c.id
                                                ? "text-brand-400 bg-brand-500/10"
                                                : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                        )}
                                    >
                                        <List className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleStartEdit(c)}
                                        title="Edit collection settings"
                                        className={cn(
                                            "p-2 rounded-lg transition-colors",
                                            editingId === c.id
                                                ? "text-brand-400 bg-brand-500/10"
                                                : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                        )}
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
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

                            {/* Inline edit panel */}
                            {editingId === c.id && (
                                <div className="border-t border-gray-700/40 p-4 bg-gray-900/80 space-y-4">
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Edit Collection</p>
                                    <div className="space-y-1.5">
                                        <label className="text-xs text-gray-400">Name</label>
                                        <input
                                            type="text"
                                            value={editForm.name}
                                            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                                            className={INPUT_CLS}
                                        />
                                    </div>
                                    {c.collectionType === "SMART" && (
                                        <div className="space-y-1.5">
                                            <label className="text-xs text-gray-400">Filter</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {(["ACTIVE_TRENDING", "PINNED", "APPROVED"] as const).map((f) => (
                                                    <button
                                                        key={f}
                                                        type="button"
                                                        onClick={() => setEditForm((ef) => ({ ...ef, filter: f }))}
                                                        className={cn(
                                                            "rounded-lg border px-3 py-2 text-xs text-left transition-colors",
                                                            editForm.filter === f
                                                                ? "border-brand-500/60 bg-brand-500/10 text-brand-300"
                                                                : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300"
                                                        )}
                                                    >
                                                        <div className="font-medium">{FILTER_LABELS[f]}</div>
                                                        <div className="text-gray-500 mt-0.5 text-[10px] leading-relaxed">{FILTER_DESCRIPTIONS[f]}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {c.collectionType === "TOP_TRENDING" && (
                                        <div className="space-y-3">
                                            <div className="space-y-1.5">
                                                <label className="text-xs text-gray-400">Streaming Providers</label>
                                                <div className="flex flex-wrap gap-1.5 mb-1.5">
                                                    {editForm.streamingProviders.map((p) => (
                                                        <span key={p} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-brand-500/15 border border-brand-500/30 text-brand-300">
                                                            {p}
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditForm((ef) => ({ ...ef, streamingProviders: ef.streamingProviders.filter((x) => x !== p) }))}
                                                                className="leading-none text-brand-400 hover:text-red-400 transition-colors"
                                                            >&times;</button>
                                                        </span>
                                                    ))}
                                                </div>
                                                <ProviderInput
                                                    current={editForm.streamingProviders}
                                                    onAdd={(p) => setEditForm((ef) => ({
                                                        ...ef,
                                                        streamingProviders: ef.streamingProviders.includes(p)
                                                            ? ef.streamingProviders
                                                            : [...ef.streamingProviders, p],
                                                    }))}
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs text-gray-400">Max Items Per Provider</label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={50}
                                                    value={editForm.maxItemsPerProvider}
                                                    onChange={(e) => setEditForm((ef) => ({ ...ef, maxItemsPerProvider: Math.max(1, parseInt(e.target.value) || 10) }))}
                                                    className={INPUT_CLS}
                                                />
                                                <p className="text-xs text-gray-600">Top N per provider, interleaved across providers</p>
                                            </div>
                                        </div>
                                    )}
                                    {/* Auto-request toggle */}
                                    <div className="flex items-center justify-between rounded-lg border border-gray-700/60 bg-gray-800/40 px-4 py-3">
                                        <div>
                                            <p className="text-xs font-medium text-white">Auto-request in Jellyseerr</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">Submit requests for collection titles not yet in library</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setEditForm((ef) => ({ ...ef, autoRequest: !ef.autoRequest }))}
                                            className={cn(
                                                "relative flex-shrink-0 w-10 h-5 rounded-full transition-colors",
                                                editForm.autoRequest ? "bg-brand-500" : "bg-gray-700"
                                            )}
                                        >
                                            <span className={cn(
                                                "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                                                editForm.autoRequest ? "translate-x-5" : "translate-x-0"
                                            )} />
                                        </button>
                                    </div>
                                    {editError && (
                                        <p className="text-sm text-red-400 rounded-lg bg-red-900/20 border border-red-800 px-3 py-2">{editError}</p>
                                    )}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleCancelEdit}
                                            className="text-sm px-3 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSaveEdit}
                                            disabled={saving || !editForm.name}
                                            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-gray-950 font-semibold transition-colors disabled:opacity-40"
                                        >
                                            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                            Save Changes
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Items panel */}
                            {expandedItemsId === c.id && editingId !== c.id && (
                                <CollectionItemsPanel collectionId={c.id} mediaType={c.mediaType} />
                            )}
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
                    <span className="text-amber-400 font-medium">Top Trending</span> collections pull from streaming
                    platform-specific popularity rankings (via TMDB Discover) for each selected provider. With multiple
                    providers, titles are interleaved by rank: #1 Netflix, #1 Prime, #1 Disney+, #2 Netflix… giving
                    you an accurate per-platform top list ordered by position.
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

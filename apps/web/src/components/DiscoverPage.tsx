"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, Trash2, Radio, Tv2, Film } from "lucide-react";
import { apiUrl } from "@/lib/api-client";

const fetcher = (url: string) =>
    fetch(url, { credentials: "include" }).then((r) => r.json());

interface DiscoverSlider {
    id: string;
    jellyseerrSliderId: number | null;
    name: string;
    streamingProvider: string;
    mediaType: "MOVIE" | "SHOW";
    enabled: boolean;
    lastSyncAt: string | null;
    itemCount: number;
}

const POPULAR_PROVIDERS = [
    "Netflix",
    "Amazon Prime Video",
    "Disney+",
    "Apple TV+",
    "Max",
    "Paramount+",
    "Crave",
    "Hulu",
    "Peacock",
    "Crunchyroll",
];

export function DiscoverPage() {
    const { data, mutate, isLoading } = useSWR<{ data: DiscoverSlider[] }>(
        apiUrl("/discover/sliders"),
        fetcher,
    );

    const [adding, setAdding] = useState(false);
    const [newProvider, setNewProvider] = useState(POPULAR_PROVIDERS[0]);
    const [newMediaType, setNewMediaType] = useState<"MOVIE" | "SHOW">("MOVIE");
    const [saving, setSaving] = useState(false);

    const sliders = data?.data ?? [];

    async function createSlider() {
        setSaving(true);
        try {
            await fetch(apiUrl("/discover/sliders"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ streamingProvider: newProvider, mediaType: newMediaType }),
                credentials: "include",
            });
            await mutate();
            setAdding(false);
        } finally {
            setSaving(false);
        }
    }

    async function toggleSlider(slider: DiscoverSlider) {
        await fetch(apiUrl(`/discover/sliders/${slider.id}`), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: !slider.enabled }),
            credentials: "include",
        });
        await mutate();
    }

    async function deleteSlider(id: string) {
        await fetch(apiUrl(`/discover/sliders/${id}`), {
            method: "DELETE",
            credentials: "include",
        });
        await mutate();
    }

    const grouped = sliders.reduce<Record<string, DiscoverSlider[]>>((acc, s) => {
        (acc[s.streamingProvider] ??= []).push(s);
        return acc;
    }, {});

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-white">Jellyseerr Discover</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        WatchWarden surfaces curated streaming content to Jellyseerr&apos;s Discover tab so your
                        users can request it — no automatic downloads.
                    </p>
                </div>
                <button
                    onClick={() => setAdding((v) => !v)}
                    className="flex items-center gap-1.5 text-sm rounded-lg px-3 py-2 bg-brand-600/20 text-brand-400 hover:bg-brand-600/30 border border-brand-800/60 transition-all"
                >
                    <Plus className="w-4 h-4" />
                    Add Slider
                </button>
            </div>

            {/* Add form */}
            {adding && (
                <div className="rounded-xl bg-gray-900 border border-gray-800/80 p-4 space-y-3">
                    <p className="text-sm font-medium text-white">New Discover Slider</p>
                    <div className="flex gap-3 flex-wrap">
                        <select
                            value={newProvider}
                            onChange={(e) => setNewProvider(e.target.value)}
                            className="flex-1 min-w-0 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                        >
                            {POPULAR_PROVIDERS.map((p) => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                        <select
                            value={newMediaType}
                            onChange={(e) => setNewMediaType(e.target.value as "MOVIE" | "SHOW")}
                            className="w-32 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                        >
                            <option value="MOVIE">Movies</option>
                            <option value="SHOW">Shows</option>
                        </select>
                        <button
                            onClick={createSlider}
                            disabled={saving}
                            className="rounded-lg px-4 py-2 bg-brand-600 text-white text-sm hover:bg-brand-500 disabled:opacity-50 transition-all"
                        >
                            {saving ? "Creating…" : "Create"}
                        </button>
                        <button
                            onClick={() => setAdding(false)}
                            className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="text-sm text-gray-600 py-8 text-center">Loading…</div>
            ) : sliders.length === 0 ? (
                <div className="rounded-xl bg-gray-900/60 border border-gray-800/60 p-8 text-center">
                    <Radio className="w-8 h-8 text-gray-700 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-500">No discover sliders configured</p>
                    <p className="text-xs text-gray-700 mt-1">
                        Add a slider to surface trending content from a streaming platform in Jellyseerr.
                        Sliders are created automatically on the first discover sync run.
                    </p>
                </div>
            ) : (
                <div className="space-y-6">
                    {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([provider, entries]) => (
                        <div key={provider} className="rounded-xl bg-gray-900 border border-gray-800/80 overflow-hidden">
                            <div className="px-4 py-3 border-b border-gray-800/60 flex items-center gap-2">
                                <span className="text-sm font-semibold text-white">{provider}</span>
                                <span className="text-xs text-gray-600">{entries.length} slider{entries.length !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="divide-y divide-gray-800/60">
                                {entries.map((slider) => (
                                    <div key={slider.id} className="flex items-center gap-4 px-4 py-3">
                                        <div className="flex-shrink-0 text-gray-600">
                                            {slider.mediaType === "MOVIE" ? <Film className="w-4 h-4" /> : <Tv2 className="w-4 h-4" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-white truncate">{slider.name}</p>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                {slider.jellyseerrSliderId ? (
                                                    <span className="text-[11px] text-green-500">
                                                        Synced to Jellyseerr #{slider.jellyseerrSliderId}
                                                    </span>
                                                ) : (
                                                    <span className="text-[11px] text-yellow-600">
                                                        Pending first sync
                                                    </span>
                                                )}
                                                {slider.itemCount > 0 && (
                                                    <span className="text-[11px] text-gray-600">
                                                        {slider.itemCount} title{slider.itemCount !== 1 ? "s" : ""}
                                                    </span>
                                                )}
                                                {slider.lastSyncAt && (
                                                    <span className="text-[11px] text-gray-700">
                                                        Last synced {new Date(slider.lastSyncAt).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => toggleSlider(slider)}
                                                className={`text-xs rounded-md px-2.5 py-1 border transition-all ${slider.enabled
                                                    ? "bg-green-950/40 text-green-400 border-green-900/60 hover:bg-red-950/40 hover:text-red-400 hover:border-red-900/60"
                                                    : "bg-gray-800/60 text-gray-500 border-gray-700/60 hover:bg-green-950/40 hover:text-green-400 hover:border-green-900/60"
                                                    }`}
                                            >
                                                {slider.enabled ? "Enabled" : "Disabled"}
                                            </button>
                                            <button
                                                onClick={() => deleteSlider(slider.id)}
                                                className="p-1.5 text-gray-700 hover:text-red-400 transition-colors rounded-md hover:bg-red-950/30"
                                                title="Remove slider"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="rounded-xl bg-gray-900/50 border border-gray-800/40 p-4">
                <p className="text-xs text-gray-600 leading-relaxed">
                    <span className="text-gray-400 font-medium">How it works:</span> WatchWarden tracks trending titles
                    on each streaming platform and creates managed sliders in Jellyseerr&apos;s Discover tab. Your household
                    users browse Jellyseerr, see WatchWarden&apos;s curated content, and request what they want — you
                    review and approve in Jellyseerr as normal. WatchWarden never auto-downloads anything.
                </p>
            </div>
        </div>
    );
}

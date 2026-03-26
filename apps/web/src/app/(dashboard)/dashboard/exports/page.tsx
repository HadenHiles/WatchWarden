"use client";

import { useState } from "react";
import useSWR from "swr";
import { RefreshCw } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { apiUrl } from "@/lib/api-client";

const fetcher = (url: string) =>
    fetch(url, { credentials: "include" }).then((r) => r.json());

interface PublishedExport {
    id: string;
    exportType: string;
    filePath: string;
    itemCount: number;
    generatedAt: string;
}

const EXPORT_TYPE_LABELS: Record<string, string> = {
    active_trending_movies: "Active Trending — Movies",
    active_trending_shows: "Active Trending — Shows",
    cleanup_eligible_movies: "Cleanup Eligible — Movies",
    cleanup_eligible_shows: "Cleanup Eligible — Shows",
    pinned_movies: "Pinned — Movies",
    pinned_shows: "Pinned — Shows",
    approved_movies: "Approved — Movies",
    approved_shows: "Approved — Shows",
};

export default function ExportsPage() {
    const { data, isLoading, mutate } = useSWR<{ data: { items: PublishedExport[]; total: number } }>(
        apiUrl("/exports"),
        fetcher
    );
    const [generating, setGenerating] = useState(false);
    const exports_ = data?.data?.items ?? [];

    async function triggerGenerate() {
        setGenerating(true);
        try {
            await fetch(apiUrl("/exports/generate"), {
                method: "POST",
                credentials: "include",
            });
            await mutate();
        } finally {
            setGenerating(false);
        }
    }

    return (
        <div className="space-y-4 max-w-3xl">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-white">Exports</h1>
                <button
                    onClick={triggerGenerate}
                    disabled={generating}
                    className="flex items-center gap-2 text-sm rounded-lg px-4 py-2 bg-brand-500 hover:bg-brand-600 text-gray-950 transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
                    {generating ? "Generating…" : "Generate Now"}
                </button>
            </div>

            <p className="text-sm text-gray-400">
                Export files are written to <code className="text-brand-400">EXPORT_OUTPUT_DIR</code> for
                Kometa and Maintainerr. Each run overwrites the previous file for that export type.
            </p>

            {isLoading && (
                <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-14 rounded-xl bg-gray-800 animate-pulse" />
                    ))}
                </div>
            )}

            {!isLoading && exports_.length === 0 && (
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-12 text-center text-gray-500">
                    No exports generated yet. Click <strong className="text-gray-300">Generate Now</strong> to create the first set.
                </div>
            )}

            {exports_.length > 0 && (
                <div className="rounded-xl border border-gray-800 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-800/50 text-gray-400 uppercase text-xs tracking-wide">
                            <tr>
                                <th className="px-4 py-3 text-left">Export Type</th>
                                <th className="px-4 py-3 text-left">Items</th>
                                <th className="px-4 py-3 text-left">File</th>
                                <th className="px-4 py-3 text-left">Generated</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {exports_.map((e) => (
                                <tr key={e.id} className="bg-gray-900 hover:bg-gray-800/50 transition-colors">
                                    <td className="px-4 py-3 font-medium text-white">
                                        {EXPORT_TYPE_LABELS[e.exportType] ?? e.exportType}
                                    </td>
                                    <td className="px-4 py-3 text-brand-400 font-mono">{e.itemCount}</td>
                                    <td className="px-4 py-3">
                                        <span
                                            className="font-mono text-xs text-gray-400 truncate max-w-xs block"
                                            title={e.filePath}
                                        >
                                            {e.filePath.split("/").pop()}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                                        {formatDate(e.generatedAt)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

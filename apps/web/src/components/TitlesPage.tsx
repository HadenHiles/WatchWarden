"use client";

import { useState } from "react";
import useSWR from "swr";
import Image from "next/image";
import { Pin, PinOff, Shield, Trash2 } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { LifecycleBadge } from "./LifecycleBadge";
import { formatDate } from "@/lib/utils";
import { apiUrl } from "@/lib/api-client";

const fetcher = (url: string) =>
    fetch(url, { credentials: "include" }).then((r) => r.json());

interface TitleRow {
    id: string;
    title: string;
    year?: number | null;
    mediaType: "MOVIE" | "SHOW";
    posterPath?: string | null;
    status: string;
    lifecyclePolicy: string;
    inLibrary: boolean;
    isRequested: boolean;
    cleanupEligible: boolean;
    isPinned: boolean;
    createdAt: string;
    updatedAt: string;
}

interface TitlesPageProps {
    heading: string;
    status?: string;
    cleanupEligible?: boolean;
    isPinned?: boolean;
    hideHeading?: boolean;
}

export function TitlesPage({ heading, status, cleanupEligible, isPinned, hideHeading }: TitlesPageProps) {
    const [mediaFilter, setMediaFilter] = useState<"ALL" | "MOVIE" | "SHOW">("ALL");
    const [page, setPage] = useState(1);
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (cleanupEligible !== undefined) params.set("cleanupEligible", String(cleanupEligible));
    if (isPinned !== undefined) params.set("isPinned", String(isPinned));
    if (mediaFilter !== "ALL") params.set("mediaType", mediaFilter);
    params.set("pageSize", "25");
    params.set("page", String(page));

    const url = apiUrl(`/titles?${params.toString()}`);
    const { data, isLoading, mutate } = useSWR<{ data: { items: TitleRow[]; total: number; page: number; pageSize: number; totalPages: number } }>(url, fetcher);
    const items = data?.data?.items ?? [];

    async function updateLifecycle(titleId: string, update: Record<string, unknown>) {
        setUpdatingId(titleId);
        try {
            await fetch(apiUrl(`/titles/${titleId}/lifecycle`), {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(update),
                credentials: "include",
            });
            mutate();
        } finally {
            setUpdatingId(null);
        }
    }

    return (
        <div className="space-y-4">
            {!hideHeading ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h1 className="text-lg font-semibold text-white tracking-tight">{heading}</h1>
                    <div className="flex gap-1.5">
                        {(["ALL", "MOVIE", "SHOW"] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setMediaFilter(t)}
                                className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${mediaFilter === t
                                    ? "bg-brand-500/10 border-brand-500/30 text-brand-400 font-medium"
                                    : "bg-gray-800/60 border-gray-700/60 text-gray-500 hover:text-gray-200 hover:border-gray-600"
                                    }`}
                            >
                                {t === "ALL" ? "All" : t === "MOVIE" ? "Movies" : "Shows"}
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="flex gap-1.5 justify-end">
                    {(["ALL", "MOVIE", "SHOW"] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setMediaFilter(t)}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${mediaFilter === t
                                ? "bg-brand-500/10 border-brand-500/30 text-brand-400 font-medium"
                                : "bg-gray-800/60 border-gray-700/60 text-gray-500 hover:text-gray-200 hover:border-gray-600"
                                }`}
                        >
                            {t === "ALL" ? "All" : t === "MOVIE" ? "Movies" : "Shows"}
                        </button>
                    ))}
                </div>
            )}

            {isLoading && (
                <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-16 rounded-xl bg-gray-900/60 animate-pulse" />
                    ))}
                </div>
            )}

            {!isLoading && items.length === 0 && (
                <div className="rounded-xl border border-gray-800/60 bg-gray-900/40 p-14 text-center text-gray-600">
                    No titles found.
                </div>
            )}

            <div className="rounded-xl border border-gray-800/60 overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                    <thead className="bg-gray-800/40 text-gray-600 uppercase text-[10px] tracking-[0.1em]">
                        <tr>
                            <th className="px-4 py-3 text-left" colSpan={2}>Title</th>
                            <th className="px-4 py-3 text-left">Status</th>
                            <th className="px-4 py-3 text-left">Policy</th>
                            <th className="px-4 py-3 text-left">Library</th>
                            <th className="px-4 py-3 text-left">Updated</th>
                            <th className="px-4 py-3 text-left">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60">
                        {items.map((t) => {
                            // posterPath is stored as the raw fragment (e.g. "/abc.jpg");
                            // prepend the TMDB image base to construct the full URL.
                            const posterUrl = t.posterPath
                                ? (t.posterPath.startsWith("http") ? t.posterPath : `https://image.tmdb.org/t/p/w92${t.posterPath}`)
                                : null;
                            return (
                                <tr key={t.id} className="bg-gray-900/60 hover:bg-gray-800/40 transition-colors">
                                    <td className="px-4 py-3 w-10">
                                        {posterUrl ? (
                                            <Image
                                                src={posterUrl}
                                                alt={t.title}
                                                width={32}
                                                height={48}
                                                className="rounded-md object-cover shadow-sm"
                                            />
                                        ) : (
                                            <div className="w-8 h-12 rounded-md bg-gray-800" />
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="font-medium text-white text-sm">{t.title}</span>
                                        {t.year && <span className="text-gray-600 ml-1.5 text-xs">({t.year})</span>}
                                        <div className="text-xs text-gray-600 mt-0.5">
                                            {t.mediaType === "MOVIE" ? "Movie" : "TV"}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge status={t.status} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <LifecycleBadge policy={t.lifecyclePolicy} />
                                    </td>
                                    <td className="px-4 py-3">
                                        {t.inLibrary ? (
                                            <span className="text-xs text-teal-500">In library</span>
                                        ) : t.isRequested ? (
                                            <span className="text-xs text-purple-400">Requested</span>
                                        ) : (
                                            <span className="text-xs text-gray-700">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 text-xs tabular-nums">{formatDate(t.updatedAt)}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => updateLifecycle(t.id, { isPinned: !t.isPinned })}
                                                disabled={updatingId === t.id}
                                                title={t.isPinned ? "Unpin" : "Pin"}
                                                className={`p-1.5 rounded-lg border transition-all disabled:opacity-50 ${t.isPinned
                                                    ? "bg-pink-950/60 text-pink-400 hover:bg-pink-900/60 border-pink-900/60"
                                                    : "bg-gray-800/60 text-gray-600 hover:text-pink-400 border-gray-700/60"
                                                    }`}
                                            >
                                                {t.isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                                            </button>
                                            <button
                                                onClick={() => updateLifecycle(t.id, { lifecyclePolicy: t.lifecyclePolicy === "PERMANENT" ? "TEMPORARY_TRENDING" : "PERMANENT" })}
                                                disabled={updatingId === t.id}
                                                title={t.lifecyclePolicy === "PERMANENT" ? "Mark temporary" : "Mark permanent"}
                                                className={`p-1.5 rounded-lg border transition-all disabled:opacity-50 ${t.lifecyclePolicy === "PERMANENT"
                                                    ? "bg-brand-950/60 text-brand-400 hover:bg-brand-900/40 border-brand-900/60"
                                                    : "bg-gray-800/60 text-gray-600 hover:text-brand-400 border-gray-700/60"
                                                    }`}
                                            >
                                                <Shield className="w-3 h-3" />
                                            </button>
                                            {!t.cleanupEligible && (
                                                <button
                                                    onClick={() => updateLifecycle(t.id, { cleanupEligible: true })}
                                                    disabled={updatingId === t.id}
                                                    title="Force cleanup eligible"
                                                    className="p-1.5 rounded-lg border bg-gray-800/60 text-gray-600 hover:text-orange-400 border-gray-700/60 transition-all disabled:opacity-50"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {
                data?.data && data.data.totalPages > 1 && (
                    <div className="flex items-center justify-between py-2">
                        <span className="text-xs text-gray-600 tabular-nums">
                            {((page - 1) * 25) + 1}–{Math.min(page * 25, data.data.total)} of {data.data.total}
                        </span>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}
                                className="text-xs px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/60 text-gray-500 hover:text-gray-200 hover:border-gray-600 disabled:opacity-40 transition-all">
                                Prev
                            </button>
                            <span className="text-xs text-gray-600 tabular-nums">{page} / {data.data.totalPages}</span>
                            <button onClick={() => setPage((p) => p + 1)} disabled={page >= data.data.totalPages}
                                className="text-xs px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/60 text-gray-500 hover:text-gray-200 hover:border-gray-600 disabled:opacity-40 transition-all">
                                Next
                            </button>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

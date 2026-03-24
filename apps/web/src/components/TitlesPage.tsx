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
}

export function TitlesPage({ heading, status, cleanupEligible, isPinned }: TitlesPageProps) {
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
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-white">{heading}</h1>
                <div className="flex gap-2">
                    {(["ALL", "MOVIE", "SHOW"] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setMediaFilter(t)}
                            className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${mediaFilter === t
                                ? "bg-brand-600 border-brand-600 text-white"
                                : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                                }`}
                        >
                            {t === "ALL" ? "All" : t === "MOVIE" ? "Movies" : "Shows"}
                        </button>
                    ))}
                </div>
            </div>

            {isLoading && (
                <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-16 rounded-xl bg-gray-800 animate-pulse" />
                    ))}
                </div>
            )}

            {!isLoading && items.length === 0 && (
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-12 text-center text-gray-500">
                    No titles found.
                </div>
            )}

            <div className="rounded-xl border border-gray-800 overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gray-800/50 text-gray-400 uppercase text-xs tracking-wide">
                        <tr>
                            <th className="px-4 py-3 text-left" colSpan={2}>Title</th>
                            <th className="px-4 py-3 text-left">Status</th>
                            <th className="px-4 py-3 text-left">Policy</th>
                            <th className="px-4 py-3 text-left">Library</th>
                            <th className="px-4 py-3 text-left">Updated</th>
                            <th className="px-4 py-3 text-left">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {items.map((t) => {
                            // posterPath is stored as the raw fragment (e.g. "/abc.jpg");
                            // prepend the TMDB image base to construct the full URL.
                            const posterUrl = t.posterPath
                                ? (t.posterPath.startsWith("http") ? t.posterPath : `https://image.tmdb.org/t/p/w92${t.posterPath}`)
                                : null;
                            return (
                                <tr key={t.id} className="bg-gray-900 hover:bg-gray-800/50 transition-colors">
                                    <td className="px-4 py-3 w-10">
                                        {posterUrl ? (
                                            <Image
                                                src={posterUrl}
                                                alt={t.title}
                                                width={32}
                                                height={48}
                                                className="rounded object-cover"
                                            />
                                        ) : (
                                            <div className="w-8 h-12 rounded bg-gray-700" />
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="font-medium text-white">{t.title}</span>
                                        {t.year && <span className="text-gray-500 ml-1">({t.year})</span>}
                                        <div className="text-xs text-gray-500 mt-0.5">
                                            {t.mediaType === "MOVIE" ? "Movie" : "TV"}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge status={t.status} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <LifecycleBadge policy={t.lifecyclePolicy} />
                                    </td>
                                    <td className="px-4 py-3 text-gray-400">
                                        {t.inLibrary ? (
                                            <span className="text-teal-400">In library</span>
                                        ) : t.isRequested ? (
                                            <span className="text-purple-400">Requested</span>
                                        ) : (
                                            <span className="text-gray-600">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(t.updatedAt)}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => updateLifecycle(t.id, { isPinned: !t.isPinned })}
                                                disabled={updatingId === t.id}
                                                title={t.isPinned ? "Unpin" : "Pin"}
                                                className={`p-1.5 rounded-lg border transition-colors disabled:opacity-50 ${t.isPinned
                                                    ? "bg-pink-900/50 text-pink-300 hover:bg-pink-900 border-pink-800"
                                                    : "bg-gray-800 text-gray-500 hover:text-pink-300 border-gray-700"
                                                    }`}
                                            >
                                                {t.isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                                            </button>
                                            <button
                                                onClick={() => updateLifecycle(t.id, { lifecyclePolicy: t.lifecyclePolicy === "PERMANENT" ? "TEMPORARY_TRENDING" : "PERMANENT" })}
                                                disabled={updatingId === t.id}
                                                title={t.lifecyclePolicy === "PERMANENT" ? "Mark temporary" : "Mark permanent"}
                                                className={`p-1.5 rounded-lg border transition-colors disabled:opacity-50 ${t.lifecyclePolicy === "PERMANENT"
                                                    ? "bg-indigo-900/50 text-indigo-300 hover:bg-indigo-900 border-indigo-800"
                                                    : "bg-gray-800 text-gray-500 hover:text-indigo-300 border-gray-700"
                                                    }`}
                                            >
                                                <Shield className="w-3 h-3" />
                                            </button>
                                            {!t.cleanupEligible && (
                                                <button
                                                    onClick={() => updateLifecycle(t.id, { cleanupEligible: true })}
                                                    disabled={updatingId === t.id}
                                                    title="Force cleanup eligible"
                                                    className="p-1.5 rounded-lg border bg-gray-800 text-gray-500 hover:text-orange-300 border-gray-700 transition-colors disabled:opacity-50"
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
                        <span className="text-sm text-gray-500">
                            {((page - 1) * 25) + 1}–{Math.min(page * 25, data.data.total)} of {data.data.total}
                        </span>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}
                                className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white disabled:opacity-40 transition-colors">
                                Prev
                            </button>
                            <span className="text-sm text-gray-500">{page} / {data.data.totalPages}</span>
                            <button onClick={() => setPage((p) => p + 1)} disabled={page >= data.data.totalPages}
                                className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white disabled:opacity-40 transition-colors">
                                Next
                            </button>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

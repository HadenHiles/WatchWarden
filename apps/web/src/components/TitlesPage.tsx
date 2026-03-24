"use client";

import { useState } from "react";
import useSWR from "swr";
import Image from "next/image";
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

    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (cleanupEligible !== undefined) params.set("cleanupEligible", String(cleanupEligible));
    if (isPinned !== undefined) params.set("isPinned", String(isPinned));
    if (mediaFilter !== "ALL") params.set("mediaType", mediaFilter);
    params.set("limit", "100");

    const url = apiUrl(`/titles?${params.toString()}`);
    const { data, isLoading } = useSWR<{ data: { items: TitleRow[] } }>(url, fetcher);
    const items = data?.data?.items ?? [];

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
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {items.map((t) => {
                            const posterUrl = t.posterPath
                                ? `https://image.tmdb.org/t/p/w92${t.posterPath}`
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
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

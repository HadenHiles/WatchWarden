"use client";

import { useEffect } from "react";
import Image from "next/image";
import useSWR from "swr";
import { X, Film, Tv2, Star, Loader2, Clock } from "lucide-react";
import { apiUrl } from "@/lib/api-client";

const fetcher = (url: string) =>
    fetch(url, { credentials: "include" }).then((r) => r.json());

interface TmdbDetails {
    id: string;
    title: string;
    year: number | null;
    mediaType: "MOVIE" | "SHOW";
    overview: string | null;
    posterPath: string | null;
    backdropPath: string | null;
    genres: string[];
    streamingOn: string[];
    inLibrary: boolean;
    runtime: number | null;
    seasonCount: number | null;
    episodeCount: number | null;
    voteAverage: number | null;
    cast: Array<{ name: string; character: string; profilePath: string | null }>;
}

export function TitleDetailsModal({
    titleId,
    onClose,
}: {
    titleId: string;
    onClose: () => void;
}) {
    const { data, isLoading } = useSWR<{ success: boolean; data: TmdbDetails }>(
        apiUrl(`/titles/${titleId}/tmdb`),
        fetcher
    );

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("keydown", onKey);
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = "";
        };
    }, [onClose]);

    const details = data?.data;
    const posterUrl = details?.posterPath
        ? `https://image.tmdb.org/t/p/w342${details.posterPath}`
        : null;
    const backdropUrl = details?.backdropPath
        ? `https://image.tmdb.org/t/p/w780${details.backdropPath}`
        : null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop overlay */}
            <div
                className="absolute inset-0 bg-gray-950/80 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal card */}
            <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-gray-900 border border-gray-800/80 shadow-2xl">
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-gray-950/70 text-gray-400 hover:text-white transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Loading state */}
                {isLoading && (
                    <div className="flex items-center justify-center py-24">
                        <Loader2 className="w-8 h-8 text-gray-600 animate-spin" />
                    </div>
                )}

                {!isLoading && details && (
                    <>
                        {/* Backdrop / hero */}
                        <div className="relative w-full h-44 bg-gray-800 overflow-hidden rounded-t-2xl">
                            {backdropUrl ? (
                                <Image
                                    src={backdropUrl}
                                    alt=""
                                    fill
                                    className="object-cover opacity-70"
                                    sizes="576px"
                                    priority
                                />
                            ) : posterUrl ? (
                                <Image
                                    src={posterUrl}
                                    alt=""
                                    fill
                                    className="object-cover blur-2xl scale-110 opacity-40"
                                    sizes="576px"
                                />
                            ) : null}
                            <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/30 to-transparent" />
                        </div>

                        {/* Poster + title row — poster bleeds up into the backdrop */}
                        <div className="flex gap-4 px-5 -mt-14 relative pb-4">
                            <div className="flex-shrink-0 w-20 self-end rounded-xl overflow-hidden shadow-xl border border-gray-700/60">
                                {posterUrl ? (
                                    <Image
                                        src={posterUrl}
                                        alt={details.title}
                                        width={80}
                                        height={120}
                                        className="w-full object-cover"
                                    />
                                ) : (
                                    <div className="w-20 h-[120px] bg-gray-800 flex items-center justify-center">
                                        {details.mediaType === "MOVIE"
                                            ? <Film className="w-6 h-6 text-gray-600" />
                                            : <Tv2 className="w-6 h-6 text-gray-600" />}
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 min-w-0 pt-16">
                                <h2 className="font-bold text-white text-base leading-snug">
                                    {details.title}
                                    {details.year && (
                                        <span className="text-gray-500 font-normal text-sm ml-1.5">
                                            ({details.year})
                                        </span>
                                    )}
                                </h2>
                                <div className="flex items-center gap-2.5 mt-1 flex-wrap">
                                    <span className="text-xs text-gray-500">
                                        {details.mediaType === "MOVIE" ? "Movie" : "TV Show"}
                                    </span>
                                    {details.voteAverage != null && details.voteAverage > 0 && (
                                        <span className="flex items-center gap-0.5 text-xs text-yellow-400">
                                            <Star className="w-3 h-3 fill-yellow-400" />
                                            {details.voteAverage.toFixed(1)}
                                        </span>
                                    )}
                                    {details.runtime != null && details.runtime > 0 && (
                                        <span className="flex items-center gap-0.5 text-xs text-gray-500">
                                            <Clock className="w-3 h-3" />
                                            {Math.floor(details.runtime / 60) > 0
                                                ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m`
                                                : `${details.runtime}m`}
                                        </span>
                                    )}
                                    {details.seasonCount != null && (
                                        <span className="text-xs text-gray-500">
                                            {details.seasonCount} season{details.seasonCount !== 1 ? "s" : ""}
                                        </span>
                                    )}
                                    {details.inLibrary && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-teal-900/80 text-teal-300 border border-teal-700/50">
                                            In Plex
                                        </span>
                                    )}
                                </div>
                                {details.genres.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {details.genres.map((g) => (
                                            <span
                                                key={g}
                                                className="text-[11px] px-2 py-0.5 rounded-full bg-gray-800/80 text-gray-400 border border-gray-700/60"
                                            >
                                                {g}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Overview */}
                        {details.overview && (
                            <div className="px-5 pb-4">
                                <p className="text-sm text-gray-400 leading-relaxed">{details.overview}</p>
                            </div>
                        )}

                        {/* Streaming */}
                        {details.streamingOn.length > 0 && (
                            <div className="px-5 pb-4">
                                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                                    Available on
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {details.streamingOn.map((p) => (
                                        <span
                                            key={p}
                                            className="text-xs px-2 py-0.5 rounded-full bg-gray-800/80 text-gray-300 border border-gray-700/60"
                                        >
                                            {p}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Cast */}
                        {details.cast.length > 0 && (
                            <div className="px-5 pb-5">
                                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
                                    Cast
                                </p>
                                <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
                                    {details.cast.map((c) => (
                                        <div key={c.name} className="text-center">
                                            <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-800 mx-auto border border-gray-700/50">
                                                {c.profilePath ? (
                                                    <Image
                                                        src={`https://image.tmdb.org/t/p/w185${c.profilePath}`}
                                                        alt={c.name}
                                                        width={48}
                                                        height={48}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <Film className="w-4 h-4 text-gray-600" />
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-white mt-1 leading-tight truncate">
                                                {c.name}
                                            </p>
                                            <p className="text-[9px] text-gray-600 truncate">{c.character}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

"use client";

import Image from "next/image";
import { useState } from "react";
import { CheckCircle, XCircle, Clock, Pin, RotateCcw, PinOff, Flag, Trash2, CalendarPlus, Film } from "lucide-react";
import { TitleDetailsModal } from "./TitleDetailsModal";
import { StatusBadge } from "./StatusBadge";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { cn, formatScore, scoreColor, formatDate } from "@/lib/utils";
import { apiUrl } from "@/lib/api-client";

export interface SuggestionCardData {
    id: string;
    status: string;
    finalScore: number;
    externalTrendScore: number;
    localInterestScore: number;
    freshnessScore: number;
    editorialBoost: number;
    scoreExplanation?: string | null;
    suggestedReasons?: string[];
    generatedAt: string;
    title: {
        id: string;
        title: string;
        year?: number | null;
        mediaType: "MOVIE" | "SHOW";
        posterPath?: string | null;
        overview?: string | null;
        status: string;
        lifecyclePolicy: string;
        isPinned: boolean;
        inLibrary: boolean;
        isRequested: boolean;
        cleanupEligible: boolean;
        trendSnapshots?: Array<{ source: string; trendScore: number }>;
    };
}

interface SuggestionCardProps {
    suggestion: SuggestionCardData;
    onDecision?: () => void;
}

export function SuggestionCard({ suggestion, onDecision }: SuggestionCardProps) {
    const { title, finalScore } = suggestion;
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState<string | null>(null);
    const [snoozeDays, setSnoozeDays] = useState(14);
    const [extendDays, setExtendDays] = useState(30);
    const [showSnoozeInput, setShowSnoozeInput] = useState(false);
    const [showExtendInput, setShowExtendInput] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);

    async function applyDecision(action: string, options?: { reason?: string; snoozeDays?: number; extendDays?: number }) {
        setLoading(action);
        try {
            await fetch(apiUrl("/decisions"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    suggestionId: suggestion.id,
                    action,
                    ...options,
                }),
                credentials: "include",
            });
            onDecision?.();
        } finally {
            setLoading(null);
        }
    }

    const posterUrl = title.posterPath
        ? `https://image.tmdb.org/t/p/w185${title.posterPath}`
        : null;

    return (
        <div className="group relative flex gap-4 rounded-xl bg-gray-900 border border-gray-800/80 p-4 hover:border-gray-700/80 hover:bg-gray-900/90 transition-all duration-200">
            {/* Poster */}
            <div
                className="flex-shrink-0 w-16 h-24 rounded-lg overflow-hidden bg-gray-800 shadow-lg cursor-pointer hover:ring-2 hover:ring-brand-500/40 transition-all"
                onClick={() => setDetailsOpen(true)}
                title="View details"
            >
                {posterUrl ? (
                    <Image src={posterUrl} alt={title.title} width={64} height={96} className="object-cover w-full h-full" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-700">
                        <Film className="w-5 h-5" />
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="font-semibold text-white text-sm leading-snug truncate">
                            {title.title}
                            {title.year && <span className="text-gray-600 font-normal ml-1.5 text-xs">({title.year})</span>}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                            <StatusBadge status={title.status} />
                            <span className="text-[11px] text-gray-600 font-medium">{title.mediaType === "MOVIE" ? "Movie" : "TV"}</span>
                        </div>
                    </div>
                    <div className={cn("text-2xl font-bold tabular-nums leading-none flex-shrink-0 pt-0.5", scoreColor(finalScore))}>
                        {formatScore(finalScore)}
                    </div>
                </div>

                {/* Reasons */}
                {suggestion.suggestedReasons && suggestion.suggestedReasons.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {suggestion.suggestedReasons.slice(0, 3).map((r) => (
                            <span key={r} className="text-[11px] bg-gray-800/80 text-gray-500 rounded-md px-2 py-0.5 border border-gray-800">
                                {r}
                            </span>
                        ))}
                    </div>
                )}

                {/* Score expanded */}
                {expanded && (
                    <div className="mt-1">
                        <ScoreBreakdown
                            externalTrendScore={suggestion.externalTrendScore}
                            localInterestScore={suggestion.localInterestScore}
                            freshnessScore={suggestion.freshnessScore}
                            editorialBoost={suggestion.editorialBoost}
                            finalScore={finalScore}
                            explanation={suggestion.scoreExplanation}
                        />
                    </div>
                )}

                {/* Actions + footer */}
                <div className="flex items-center gap-1.5 flex-wrap mt-auto pt-1">
                    {/* PENDING actions */}
                    {suggestion.status === "PENDING" && <>
                        <button onClick={() => applyDecision("APPROVE")} disabled={loading !== null}
                            className="flex items-center gap-1 text-xs rounded-lg px-2.5 py-1.5 bg-green-950/60 text-green-400 hover:bg-green-900/60 border border-green-900/60 hover:border-green-800 transition-all disabled:opacity-50">
                            <CheckCircle className="w-3 h-3" /> Approve
                        </button>
                        <button onClick={() => applyDecision("REJECT")} disabled={loading !== null}
                            className="flex items-center gap-1 text-xs rounded-lg px-2.5 py-1.5 bg-red-950/60 text-red-400 hover:bg-red-900/60 border border-red-900/60 hover:border-red-800 transition-all disabled:opacity-50">
                            <XCircle className="w-3 h-3" /> Reject
                        </button>
                        {showSnoozeInput ? (
                            <span className="flex items-center gap-1">
                                <input type="number" value={snoozeDays} min={1} max={365}
                                    onChange={(e) => setSnoozeDays(Number(e.target.value))}
                                    className="w-12 rounded-lg bg-gray-800 border border-gray-700 px-1.5 py-1 text-xs text-white text-center focus:outline-none focus:ring-1 focus:ring-brand-500" />
                                <button onClick={() => { applyDecision("SNOOZE", { snoozeDays }); setShowSnoozeInput(false); }} disabled={loading !== null}
                                    className="text-xs rounded-lg px-2.5 py-1.5 bg-brand-950/60 text-brand-400 hover:bg-brand-900/40 border border-brand-900/60 hover:border-brand-800 transition-all disabled:opacity-50">
                                    {snoozeDays}d
                                </button>
                                <button onClick={() => setShowSnoozeInput(false)} className="text-xs text-gray-600 hover:text-gray-400 px-1">✕</button>
                            </span>
                        ) : (
                            <button onClick={() => setShowSnoozeInput(true)} disabled={loading !== null}
                                className="flex items-center gap-1 text-xs rounded-lg px-2.5 py-1.5 bg-brand-950/60 text-brand-400 hover:bg-brand-900/40 border border-brand-900/60 hover:border-brand-800 transition-all disabled:opacity-50">
                                <Clock className="w-3 h-3" /> Snooze
                            </button>
                        )}
                        {!title.isPinned && (
                            <button onClick={() => applyDecision("PIN")} disabled={loading !== null}
                                className="flex items-center gap-1 text-xs rounded-lg px-2.5 py-1.5 bg-pink-950/60 text-pink-400 hover:bg-pink-900/60 border border-pink-900/60 hover:border-pink-800 transition-all disabled:opacity-50">
                                <Pin className="w-3 h-3" /> Pin
                            </button>
                        )}
                    </>}

                    {/* UNPIN — available on any non-pending status when pinned */}
                    {title.isPinned && suggestion.status !== "PENDING" && (
                        <button onClick={() => applyDecision("UNPIN")} disabled={loading !== null}
                            className="flex items-center gap-1 text-xs rounded-lg px-2.5 py-1.5 bg-pink-950/60 text-pink-400 hover:bg-pink-900/60 border border-pink-900/60 hover:border-pink-800 transition-all disabled:opacity-50">
                            <PinOff className="w-3 h-3" /> Unpin
                        </button>
                    )}

                    {/* APPROVED lifecycle actions */}
                    {suggestion.status === "APPROVED" && <>
                        {title.lifecyclePolicy !== "PERMANENT" ? (
                            <button onClick={() => applyDecision("MARK_PERMANENT")} disabled={loading !== null}
                                className="flex items-center gap-1 text-xs rounded-lg px-2.5 py-1.5 bg-gray-800/80 text-gray-300 hover:bg-gray-700/80 border border-gray-700/60 hover:border-gray-600 transition-all disabled:opacity-50">
                                <Flag className="w-3 h-3" /> Permanent
                            </button>
                        ) : (
                            <button onClick={() => applyDecision("MARK_TEMPORARY")} disabled={loading !== null}
                                className="flex items-center gap-1 text-xs rounded-lg px-2.5 py-1.5 bg-gray-800/80 text-gray-400 hover:bg-gray-700/80 border border-gray-700/60 transition-all disabled:opacity-50">
                                Temporary
                            </button>
                        )}
                        {showExtendInput ? (
                            <span className="flex items-center gap-1">
                                <input type="number" value={extendDays} min={1} max={365}
                                    onChange={(e) => setExtendDays(Number(e.target.value))}
                                    className="w-12 rounded-lg bg-gray-800 border border-gray-700 px-1.5 py-1 text-xs text-white text-center focus:outline-none focus:ring-1 focus:ring-brand-500" />
                                <button onClick={() => { applyDecision("EXTEND_RETENTION", { extendDays }); setShowExtendInput(false); }} disabled={loading !== null}
                                    className="text-xs rounded-lg px-2.5 py-1.5 bg-teal-950/60 text-teal-400 hover:bg-teal-900/60 border border-teal-900/60 hover:border-teal-800 transition-all disabled:opacity-50">
                                    +{extendDays}d
                                </button>
                                <button onClick={() => setShowExtendInput(false)} className="text-xs text-gray-600 hover:text-gray-400 px-1">✕</button>
                            </span>
                        ) : (
                            <button onClick={() => setShowExtendInput(true)} disabled={loading !== null}
                                className="flex items-center gap-1 text-xs rounded-lg px-2.5 py-1.5 bg-teal-950/60 text-teal-400 hover:bg-teal-900/60 border border-teal-900/60 hover:border-teal-800 transition-all disabled:opacity-50">
                                <CalendarPlus className="w-3 h-3" /> Extend
                            </button>
                        )}
                        {!title.cleanupEligible && (
                            <button onClick={() => applyDecision("FORCE_CLEANUP_ELIGIBLE")} disabled={loading !== null}
                                className="flex items-center gap-1 text-xs rounded-lg px-2.5 py-1.5 bg-orange-950/60 text-orange-400 hover:bg-orange-900/60 border border-orange-900/60 hover:border-orange-800 transition-all disabled:opacity-50">
                                <Trash2 className="w-3 h-3" /> Cleanup
                            </button>
                        )}
                        <button onClick={() => applyDecision("UNDO")} disabled={loading !== null}
                            className="flex items-center gap-1 text-xs rounded-lg px-2.5 py-1.5 bg-gray-800/60 text-gray-500 hover:text-gray-300 hover:bg-gray-700/60 border border-gray-800 transition-all disabled:opacity-50">
                            <RotateCcw className="w-3 h-3" /> Undo
                        </button>
                    </>}

                    {/* REJECTED / SNOOZED: undo only */}
                    {(suggestion.status === "REJECTED" || suggestion.status === "SNOOZED") && (
                        <button onClick={() => applyDecision("UNDO")} disabled={loading !== null}
                            className="flex items-center gap-1 text-xs rounded-lg px-2.5 py-1.5 bg-gray-800/60 text-gray-500 hover:text-gray-300 hover:bg-gray-700/60 border border-gray-800 transition-all disabled:opacity-50">
                            <RotateCcw className="w-3 h-3" /> Undo
                        </button>
                    )}

                    <button onClick={() => setExpanded((v) => !v)}
                        className="ml-auto text-[11px] text-gray-600 hover:text-gray-400 transition-colors">
                        {expanded ? "Hide" : "Details"}
                    </button>
                </div>
                <p className="text-[11px] text-gray-700">{formatDate(suggestion.generatedAt)}</p>
            </div>
        </div>
        {
        detailsOpen && (
            <TitleDetailsModal titleId={title.id} onClose={() => setDetailsOpen(false)} />
        )
    }
    );
}

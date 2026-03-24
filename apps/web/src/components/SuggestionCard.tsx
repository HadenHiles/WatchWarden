"use client";

import Image from "next/image";
import { useState } from "react";
import { CheckCircle, XCircle, Clock, Pin, RotateCcw, PinOff, Flag, Trash2, CalendarPlus } from "lucide-react";
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
        <div className="group relative flex gap-3 rounded-xl bg-gray-900 border border-gray-800 p-3 hover:border-gray-700 transition-colors">
            {/* Poster */}
            <div className="flex-shrink-0 w-14 h-20 rounded-lg overflow-hidden bg-gray-800">
                {posterUrl ? (
                    <Image src={posterUrl} alt={title.title} width={56} height={80} className="object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs text-center px-1">
                        No poster
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <h3 className="font-semibold text-white text-sm truncate">
                            {title.title}
                            {title.year && <span className="text-gray-500 font-normal ml-1">({title.year})</span>}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <StatusBadge status={title.status} />
                            <span className="text-xs text-gray-500">{title.mediaType === "MOVIE" ? "Movie" : "TV"}</span>
                        </div>
                    </div>
                    <div className={cn("text-xl font-bold tabular-nums flex-shrink-0", scoreColor(finalScore))}>
                        {formatScore(finalScore)}
                    </div>
                </div>

                {/* Reasons */}
                {suggestion.suggestedReasons && suggestion.suggestedReasons.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {suggestion.suggestedReasons.slice(0, 3).map((r) => (
                            <span key={r} className="text-xs bg-gray-800 text-gray-400 rounded px-1.5 py-0.5">
                                {r}
                            </span>
                        ))}
                    </div>
                )}

                {/* Score expanded */}
                {expanded && (
                    <div className="mt-2">
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
                <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {/* PENDING actions */}
                        {suggestion.status === "PENDING" && <>
                            <button onClick={() => applyDecision("APPROVE")} disabled={loading !== null}
                                className="flex items-center gap-1 text-xs rounded-lg px-2 py-1 bg-green-900/50 text-green-300 hover:bg-green-900 border border-green-800 transition-colors disabled:opacity-50">
                                <CheckCircle className="w-3 h-3" /> Approve
                            </button>
                            <button onClick={() => applyDecision("REJECT")} disabled={loading !== null}
                                className="flex items-center gap-1 text-xs rounded-lg px-2 py-1 bg-red-900/50 text-red-300 hover:bg-red-900 border border-red-800 transition-colors disabled:opacity-50">
                                <XCircle className="w-3 h-3" /> Reject
                            </button>
                            {showSnoozeInput ? (
                                <span className="flex items-center gap-1">
                                    <input type="number" value={snoozeDays} min={1} max={365}
                                        onChange={(e) => setSnoozeDays(Number(e.target.value))}
                                        className="w-12 rounded bg-gray-800 border border-gray-700 px-1.5 py-0.5 text-xs text-white text-center focus:outline-none" />
                                    <button onClick={() => { applyDecision("SNOOZE", { snoozeDays }); setShowSnoozeInput(false); }} disabled={loading !== null}
                                        className="text-xs rounded-lg px-2 py-1 bg-yellow-900/50 text-yellow-300 hover:bg-yellow-900 border border-yellow-800 transition-colors disabled:opacity-50">
                                        {snoozeDays}d
                                    </button>
                                    <button onClick={() => setShowSnoozeInput(false)} className="text-xs text-gray-600 hover:text-gray-300 px-1">✕</button>
                                </span>
                            ) : (
                                <button onClick={() => setShowSnoozeInput(true)} disabled={loading !== null}
                                    className="flex items-center gap-1 text-xs rounded-lg px-2 py-1 bg-yellow-900/50 text-yellow-300 hover:bg-yellow-900 border border-yellow-800 transition-colors disabled:opacity-50">
                                    <Clock className="w-3 h-3" /> Snooze
                                </button>
                            )}
                            {!title.isPinned && (
                                <button onClick={() => applyDecision("PIN")} disabled={loading !== null}
                                    className="flex items-center gap-1 text-xs rounded-lg px-2 py-1 bg-pink-900/50 text-pink-300 hover:bg-pink-900 border border-pink-800 transition-colors disabled:opacity-50">
                                    <Pin className="w-3 h-3" /> Pin
                                </button>
                            )}
                        </>}

                        {/* UNPIN — available on any non-pending status when pinned */}
                        {title.isPinned && suggestion.status !== "PENDING" && (
                            <button onClick={() => applyDecision("UNPIN")} disabled={loading !== null}
                                className="flex items-center gap-1 text-xs rounded-lg px-2 py-1 bg-pink-900/50 text-pink-300 hover:bg-pink-900 border border-pink-800 transition-colors disabled:opacity-50">
                                <PinOff className="w-3 h-3" /> Unpin
                            </button>
                        )}

                        {/* APPROVED lifecycle actions */}
                        {suggestion.status === "APPROVED" && <>
                            {title.lifecyclePolicy !== "PERMANENT" ? (
                                <button onClick={() => applyDecision("MARK_PERMANENT")} disabled={loading !== null}
                                    className="flex items-center gap-1 text-xs rounded-lg px-2 py-1 bg-indigo-900/50 text-indigo-300 hover:bg-indigo-900 border border-indigo-800 transition-colors disabled:opacity-50">
                                    <Flag className="w-3 h-3" /> Permanent
                                </button>
                            ) : (
                                <button onClick={() => applyDecision("MARK_TEMPORARY")} disabled={loading !== null}
                                    className="flex items-center gap-1 text-xs rounded-lg px-2 py-1 bg-gray-700/50 text-gray-300 hover:bg-gray-700 border border-gray-600 transition-colors disabled:opacity-50">
                                    Temporary
                                </button>
                            )}
                            {showExtendInput ? (
                                <span className="flex items-center gap-1">
                                    <input type="number" value={extendDays} min={1} max={365}
                                        onChange={(e) => setExtendDays(Number(e.target.value))}
                                        className="w-12 rounded bg-gray-800 border border-gray-700 px-1.5 py-0.5 text-xs text-white text-center focus:outline-none" />
                                    <button onClick={() => { applyDecision("EXTEND_RETENTION", { extendDays }); setShowExtendInput(false); }} disabled={loading !== null}
                                        className="text-xs rounded-lg px-2 py-1 bg-teal-900/50 text-teal-300 hover:bg-teal-900 border border-teal-800 transition-colors disabled:opacity-50">
                                        +{extendDays}d
                                    </button>
                                    <button onClick={() => setShowExtendInput(false)} className="text-xs text-gray-600 hover:text-gray-300 px-1">✕</button>
                                </span>
                            ) : (
                                <button onClick={() => setShowExtendInput(true)} disabled={loading !== null}
                                    className="flex items-center gap-1 text-xs rounded-lg px-2 py-1 bg-teal-900/50 text-teal-300 hover:bg-teal-900 border border-teal-800 transition-colors disabled:opacity-50">
                                    <CalendarPlus className="w-3 h-3" /> Extend
                                </button>
                            )}
                            {!title.cleanupEligible && (
                                <button onClick={() => applyDecision("FORCE_CLEANUP_ELIGIBLE")} disabled={loading !== null}
                                    className="flex items-center gap-1 text-xs rounded-lg px-2 py-1 bg-orange-900/50 text-orange-300 hover:bg-orange-900 border border-orange-800 transition-colors disabled:opacity-50">
                                    <Trash2 className="w-3 h-3" /> Cleanup
                                </button>
                            )}
                            <button onClick={() => applyDecision("UNDO")} disabled={loading !== null}
                                className="flex items-center gap-1 text-xs rounded-lg px-2 py-1 bg-gray-700/50 text-gray-400 hover:bg-gray-700 border border-gray-600 transition-colors disabled:opacity-50">
                                <RotateCcw className="w-3 h-3" /> Undo
                            </button>
                        </>}

                        {/* REJECTED / SNOOZED: undo only */}
                        {(suggestion.status === "REJECTED" || suggestion.status === "SNOOZED") && (
                            <button onClick={() => applyDecision("UNDO")} disabled={loading !== null}
                                className="flex items-center gap-1 text-xs rounded-lg px-2 py-1 bg-gray-700/50 text-gray-400 hover:bg-gray-700 border border-gray-600 transition-colors disabled:opacity-50">
                                <RotateCcw className="w-3 h-3" /> Undo
                            </button>
                        )}

                        <button onClick={() => setExpanded((v) => !v)}
                            className="ml-auto text-xs text-gray-500 hover:text-gray-300 transition-colors">
                            {expanded ? "Hide" : "Details"}
                        </button>
                    </div>
                    <p className="text-xs text-gray-600">{formatDate(suggestion.generatedAt)}</p>
                </div>
            </div>
        </div>
    );
}

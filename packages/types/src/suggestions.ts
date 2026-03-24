import type { TitleSummary, DecisionAction, LifecyclePolicy } from "./media";

// ─── Score components ─────────────────────────────────────────────────────────

export interface ScoreBreakdown {
    externalTrendScore: number;
    localInterestScore: number;
    freshnessScore: number;
    editorialBoost: number;
    finalScore: number;
}

export interface ScoreWeights {
    externalTrendScore: number;
    localInterestScore: number;
    freshnessScore: number;
    editorialBoost: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
    externalTrendScore: 0.45,
    localInterestScore: 0.35,
    freshnessScore: 0.1,
    editorialBoost: 0.1,
};

// ─── Suggestion ───────────────────────────────────────────────────────────────

export interface Suggestion {
    id: string;
    titleId: string;
    title: TitleSummary;

    externalTrendScore: number;
    localInterestScore: number;
    freshnessScore: number;
    editorialBoost: number;
    finalScore: number;

    scoreExplanation: string | null;
    suggestedReasons: string[];

    status: "PENDING" | "APPROVED" | "REJECTED" | "SNOOZED";
    snoozedUntil: Date | null;

    generatedAt: Date;
    updatedAt: Date;
}

// ─── Decision ────────────────────────────────────────────────────────────────

export interface SuggestionDecision {
    id: string;
    suggestionId: string;
    action: DecisionAction;
    reason: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
}

// ─── Request record ───────────────────────────────────────────────────────────

export interface RequestRecord {
    id: string;
    titleId: string;
    jellyseerrRequestId: number | null;
    requestStatus: "PENDING" | "PROCESSING" | "AVAILABLE" | "FAILED" | "DECLINED" | "APPROVED";
    requestedAt: Date;
    updatedAt: Date;
    rootFolder: string | null;
    qualityProfileId: number | null;
    requestedByBot: boolean;
    failureReason: string | null;
    retryCount: number;
    lastSyncAt: Date | null;
}

// ─── Suggestion list / filter params ─────────────────────────────────────────

export interface SuggestionFilters {
    mediaType?: "MOVIE" | "SHOW";
    status?: "PENDING" | "APPROVED" | "REJECTED" | "SNOOZED";
    source?: string;
    region?: string;
    inLibrary?: boolean;
    isRequested?: boolean;
    cleanupEligible?: boolean;
    isPinned?: boolean;
    minScore?: number;
    sortBy?: "finalScore" | "generatedAt" | "title";
    sortOrder?: "asc" | "desc";
    page?: number;
    pageSize?: number;
}

// ─── Snapshot from an external trend source ────────────────────────────────

export interface ExternalTrendSnapshot {
    id: string;
    titleId: string;
    source: string;
    region: string | null;
    rank: number | null;
    trendScore: number;
    rawMetadata: Record<string, unknown>;
    snapshotAt: Date;
    expiresAt: Date | null;
}

// ─── Normalized local watch signal from Tautulli ─────────────────────────────

export interface LocalWatchSignal {
    id: string;
    titleId: string;
    recentWatchCount: number;
    uniqueViewerCount: number;
    completionRate: number;
    watchSaturation: number;
    lastWatchedAt: Date | null;
    recencyScore: number;
    localInterestScore: number;
    multiUserBoost: number;
    completionPenalty: number;
    fetchedAt: Date;
}

// ─── Lifecycle / policy detail ────────────────────────────────────────────────

export interface LifecycleDetail {
    titleId: string;
    lifecyclePolicy: LifecyclePolicy;
    isTemporary: boolean;
    isPinned: boolean;
    keepUntil: Date | null;
    cleanupEligible: boolean;
    cleanupReason: string | null;
}

// ─── Core media types ─────────────────────────────────────────────────────────

export type MediaType = "MOVIE" | "SHOW";

/**
 * Canonical lifecycle status for a Title.
 *
 * State machine:
 *   candidate → suggested → approved → requested → available
 *             → active_trending → cleanup_eligible → expired
 *             → rejected (from suggested)
 *             → snoozed  (from suggested)
 *   any → pinned (admin override, suspends cleanup eligibility)
 */
export type TitleStatus =
    | "CANDIDATE"
    | "SUGGESTED"
    | "APPROVED"
    | "REJECTED"
    | "SNOOZED"
    | "REQUESTED"
    | "AVAILABLE"
    | "ACTIVE_TRENDING"
    | "CLEANUP_ELIGIBLE"
    | "EXPIRED"
    | "PINNED";

export type LifecyclePolicy =
    | "PERMANENT"
    | "TEMPORARY_TRENDING"
    | "WATCH_AND_EXPIRE"
    | "PINNED";

export type SuggestionStatus = "PENDING" | "APPROVED" | "REJECTED" | "SNOOZED";

export type DecisionAction =
    | "APPROVE"
    | "REJECT"
    | "SNOOZE"
    | "PIN"
    | "UNPIN"
    | "MARK_PERMANENT"
    | "MARK_TEMPORARY"
    | "EXTEND_RETENTION"
    | "FORCE_CLEANUP_ELIGIBLE"
    | "UNDO";

export type RequestStatus =
    | "PENDING"
    | "PROCESSING"
    | "AVAILABLE"
    | "FAILED"
    | "DECLINED"
    | "APPROVED";

export type JobStatus = "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";

// ─── Canonical Title representation ─────────────────────────────────────────

export interface Title {
    id: string;
    tmdbId: number | null;
    tvdbId: number | null;
    imdbId: string | null;
    title: string;
    originalTitle: string | null;
    mediaType: MediaType;
    year: number | null;
    overview: string | null;
    posterPath: string | null;
    backdropPath: string | null;
    genres: string[];

    // Lifecycle
    status: TitleStatus;
    lifecyclePolicy: LifecyclePolicy;
    isTemporary: boolean;
    isPinned: boolean;
    keepUntil: Date | null;
    cleanupEligible: boolean;
    cleanupReason: string | null;

    // Library / request state
    inLibrary: boolean;
    libraryCheckedAt: Date | null;
    isRequested: boolean;
    jellyseerrId: number | null;

    createdAt: Date;
    updatedAt: Date;
}

// ─── Slim summary used in list views ─────────────────────────────────────────

export interface TitleSummary
    extends Pick<
        Title,
        | "id"
        | "tmdbId"
        | "title"
        | "mediaType"
        | "year"
        | "posterPath"
        | "status"
        | "lifecyclePolicy"
        | "isPinned"
        | "cleanupEligible"
        | "inLibrary"
        | "isRequested"
    > { }

export const DEFAULT_MAX_STORAGE_BYTES = 1_000_000_000_000;

export interface StorageEvidence {
    observedAt: Date;
    complete: boolean;
    managedBytes: number;
    reservedBytes: number;
}

export function assessStorageAdmission(
    evidence: StorageEvidence | null, reservationBytes: number | null,
    maxStorageBytes = DEFAULT_MAX_STORAGE_BYTES, now = new Date(),
) {
    if (!Number.isSafeInteger(maxStorageBytes) || maxStorageBytes <= 0) throw new Error("Invalid storage maximum");
    if (!evidence || !evidence.complete || !Number.isSafeInteger(evidence.managedBytes) || evidence.managedBytes < 0
        || !Number.isSafeInteger(evidence.reservedBytes) || evidence.reservedBytes < 0
        || !Number.isFinite(evidence.observedAt.getTime()) || now.getTime() < evidence.observedAt.getTime()
        || now.getTime() - evidence.observedAt.getTime() > 30 * 60 * 1000) {
        return { allowed: false, reason: "storage_evidence_unknown", maxStorageBytes };
    }
    if (!Number.isSafeInteger(reservationBytes) || reservationBytes! <= 0) {
        return { allowed: false, reason: "acquisition_size_unknown", maxStorageBytes };
    }
    const committedBytes = evidence.managedBytes + evidence.reservedBytes;
    return { allowed: committedBytes + reservationBytes! <= maxStorageBytes,
        reason: committedBytes + reservationBytes! <= maxStorageBytes ? "within_budget" : "storage_budget_exhausted",
        maxStorageBytes, committedBytes, availableBytes: Math.max(0, maxStorageBytes - committedBytes) };
}

export interface RetentionEvidence {
    userRequested: boolean | null;
    pinned: boolean;
    permanent: boolean;
    keepUntil: Date | null;
    activePlayback: boolean | null;
    inProgress: boolean | null;
    watchlisted: boolean | null;
    lastWatchedAt: Date | null;
    playbackHistoryComplete: boolean;
    currentlyFeatured: boolean | null;
    outOfRotationSince: Date | null;
    minimumAvailabilityMet: boolean | null;
    demand: "sustained" | "cooling" | "uncertain";
}

export function assessRetention(evidence: RetentionEvidence, now = new Date()) {
    const protections = [
        evidence.userRequested === true && "user_requested",
        evidence.pinned && "pinned",
        evidence.permanent && "permanent",
        evidence.keepUntil && evidence.keepUntil > now && "explicit_retention",
        evidence.activePlayback === true && "active_playback",
        evidence.inProgress === true && "viewing_in_progress",
        evidence.watchlisted === true && "plex_watchlist",
        evidence.lastWatchedAt && evidence.lastWatchedAt <= now
            && now.getTime() - evidence.lastWatchedAt.getTime() <= 30 * 86400000 && "recent_playback",
        evidence.currentlyFeatured === true && "currently_featured",
        evidence.demand === "sustained" && "sustained_demand",
    ].filter((reason): reason is string => typeof reason === "string");
    if (protections.length) return { decision: "keep" as const, reasons: protections, deletionAuthorized: false, reviewKind: "none" as const };
    const missing = [
        evidence.userRequested === null && "requester_unknown",
        evidence.activePlayback === null && "active_playback_unknown",
        evidence.inProgress === null && "viewing_progress_unknown",
        evidence.watchlisted === null && "watchlist_coverage_unknown",
        !evidence.playbackHistoryComplete && "playback_history_incomplete",
        evidence.currentlyFeatured === null && "shelf_membership_unknown",
        evidence.minimumAvailabilityMet !== true && "availability_window_unverified",
        evidence.demand === "uncertain" && "demand_uncertain",
        (!evidence.outOfRotationSince || evidence.outOfRotationSince > now
            || now.getTime() - evidence.outOfRotationSince.getTime() < 30 * 86400000) && "rotation_grace_unmet",
    ].filter((reason): reason is string => typeof reason === "string");
    if (missing.length) return { decision: "review" as const, reasons: missing, deletionAuthorized: false,
        reviewKind: missing.length === 1 && missing[0] === "demand_uncertain" ? "owner_decision" as const : "investigation_required" as const };
    return { decision: "retirement_candidate" as const, reasons: ["past_grace_no_protection_and_cooling"], deletionAuthorized: false, reviewKind: "owner_decision" as const };
}
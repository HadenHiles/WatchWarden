import type { TitleStatus, LifecyclePolicy } from "@watchwarden/types";

export interface LifecycleTransitionInput {
    currentStatus: TitleStatus;
    inLibrary: boolean;
    isRequested: boolean;
    jellyseerrRequestStatus: string | null;
    finalScore: number;
    /** Most recent trend snapshot date */
    latestSnapshotAt: Date | null;
    keepUntil: Date | null;
    lifecyclePolicy: LifecyclePolicy;
    isPinned: boolean;
    cleanupEligible: boolean;
}

export interface LifecycleTransitionResult {
    newStatus: TitleStatus;
    cleanupEligible: boolean;
    cleanupReason: string | null;
    changed: boolean;
}

const STALE_THRESHOLD_DAYS = 21;
const SCORE_CLEANUP_THRESHOLD = 0.3;
const EXPIRED_DAYS_AFTER_CLEANUP = 90;

/**
 * Evaluates the lifecycle state machine for a title and returns the next state.
 *
 * State transitions:
 *   APPROVED → REQUESTED  (when inLibrary=false && jellyseerrStatus = processing/approved/available)
 *   REQUESTED → AVAILABLE (when inLibrary=true)
 *   AVAILABLE → ACTIVE_TRENDING (when score >= threshold && fresh)
 *   ACTIVE_TRENDING → CLEANUP_ELIGIBLE (when stale OR score < threshold OR keepUntil passed)
 *   CLEANUP_ELIGIBLE → EXPIRED (when cleanupEligible for 90+ days)
 *   * → PINNED (isPinned=true, overrides cleanup)
 */
export function evaluateLifecycleTransition(
    input: LifecycleTransitionInput
): LifecycleTransitionResult {
    const { currentStatus, inLibrary, isPinned, keepUntil, finalScore, latestSnapshotAt, lifecyclePolicy } = input;

    // Pinned items never move to cleanup or expired
    if (isPinned && currentStatus !== "PINNED") {
        return { newStatus: "PINNED", cleanupEligible: false, cleanupReason: null, changed: true };
    }

    // Un-pinning moves back to available or active_trending based on library status
    if (!isPinned && currentStatus === "PINNED") {
        const next = inLibrary ? "AVAILABLE" : "APPROVED";
        return { newStatus: next, cleanupEligible: false, cleanupReason: null, changed: true };
    }

    // Permanent policy: never eligible for cleanup
    if (lifecyclePolicy === "PERMANENT") {
        const unchanged = { newStatus: currentStatus, cleanupEligible: false, cleanupReason: null, changed: false };
        if (inLibrary && currentStatus === "REQUESTED") {
            return { newStatus: "AVAILABLE", cleanupEligible: false, cleanupReason: null, changed: true };
        }
        return unchanged;
    }

    switch (currentStatus) {
        case "APPROVED":
            if (input.jellyseerrRequestStatus !== null) {
                return { newStatus: "REQUESTED", cleanupEligible: false, cleanupReason: null, changed: true };
            }
            break;

        case "REQUESTED":
            if (inLibrary) {
                return { newStatus: "AVAILABLE", cleanupEligible: false, cleanupReason: null, changed: true };
            }
            break;

        case "AVAILABLE":
            if (finalScore >= 0.5 && isFresh(latestSnapshotAt)) {
                return { newStatus: "ACTIVE_TRENDING", cleanupEligible: false, cleanupReason: null, changed: true };
            }
            break;

        case "ACTIVE_TRENDING": {
            const { eligible, reason } = isCleanupEligible({ finalScore, latestSnapshotAt, keepUntil, lifecyclePolicy });
            if (eligible) {
                return { newStatus: "CLEANUP_ELIGIBLE", cleanupEligible: true, cleanupReason: reason, changed: true };
            }
            break;
        }

        case "CLEANUP_ELIGIBLE": {
            // Transition to expired after extended cleanup eligibility period
            if (input.cleanupEligible && keepUntil && keepUntil < new Date()) {
                const daysPast = (Date.now() - keepUntil.getTime()) / 86_400_000;
                if (daysPast > EXPIRED_DAYS_AFTER_CLEANUP) {
                    return { newStatus: "EXPIRED", cleanupEligible: true, cleanupReason: "Keep-until date passed", changed: true };
                }
            }
            break;
        }
    }

    return { newStatus: currentStatus, cleanupEligible: input.cleanupEligible, cleanupReason: input.cleanupEligible ? "Previously flagged" : null, changed: false };
}

function isFresh(snapshotAt: Date | null): boolean {
    if (!snapshotAt) return false;
    const daysOld = (Date.now() - snapshotAt.getTime()) / 86_400_000;
    return daysOld <= STALE_THRESHOLD_DAYS;
}

function isCleanupEligible(input: {
    finalScore: number;
    latestSnapshotAt: Date | null;
    keepUntil: Date | null;
    lifecyclePolicy: LifecyclePolicy;
}): { eligible: boolean; reason: string | null } {
    if (input.lifecyclePolicy === "PERMANENT") {
        return { eligible: false, reason: null };
    }

    if (!isFresh(input.latestSnapshotAt)) {
        return { eligible: true, reason: "Trend data has gone stale" };
    }

    if (input.finalScore < SCORE_CLEANUP_THRESHOLD) {
        return { eligible: true, reason: "Trend score dropped below cleanup threshold" };
    }

    if (input.keepUntil && input.keepUntil < new Date()) {
        return { eligible: true, reason: "Keep-until retention date has passed" };
    }

    return { eligible: false, reason: null };
}

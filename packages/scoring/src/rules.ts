/**
 * Hard-coded scoring rules.
 * All rule functions are pure — no DB access.  Applied by the engine after
 * computing the raw weighted score.
 */

/** Days after which a trend snapshot is considered stale */
const STALE_TREND_DAYS = 14;

/** Days after which a rejection is no longer penalized */
const REJECTION_DECAY_DAYS = 30;

/** Score multiplier for stale trends */
const STALE_TREND_PENALTY = 0.6;

/** Score multiplier for a recently-rejected title */
const RECENT_REJECTION_PENALTY = 0.5;

export interface RuleInput {
    snapshotAt: Date | null;
    lastRejectedAt: Date | null;
    uniqueViewerCount: number;
    completionRate: number;
    inLibrary: boolean;
    isRequested: boolean;
    isPermanentlyRejected: boolean;
    excludeInLibrary: boolean;
    excludeAlreadyRequested: boolean;
    excludePermanentlyRejected: boolean;
}

export interface RuleResult {
    /** If true, this title should be excluded entirely from suggestions */
    exclude: boolean;
    /** Multiplier applied to the raw score (between 0 and 2). Default: 1 */
    multiplier: number;
    reasons: string[];
}

/**
 * Evaluates all hard rules for a candidate title.
 * Returns an exclusion flag, a score multiplier, and human-readable reasons.
 */
export function evaluateRules(input: RuleInput): RuleResult {
    const reasons: string[] = [];
    let multiplier = 1;

    // ── Exclusion rules ────────────────────────────────────────────────────────

    if (input.excludePermanentlyRejected && input.isPermanentlyRejected) {
        return { exclude: true, multiplier: 0, reasons: ["Permanently rejected"] };
    }

    if (input.excludeInLibrary && input.inLibrary) {
        return { exclude: true, multiplier: 0, reasons: ["Already in library"] };
    }

    if (input.excludeAlreadyRequested && input.isRequested) {
        return { exclude: true, multiplier: 0, reasons: ["Already requested"] };
    }

    // Exclude titles fully watched by 2+ viewers
    if (input.uniqueViewerCount >= 2 && input.completionRate > 0.9) {
        return { exclude: true, multiplier: 0, reasons: ["Fully watched by 2+ family members"] };
    }

    // ── Score penalties ────────────────────────────────────────────────────────

    if (input.snapshotAt) {
        const daysOld = (Date.now() - input.snapshotAt.getTime()) / 86_400_000;
        if (daysOld > STALE_TREND_DAYS) {
            multiplier *= STALE_TREND_PENALTY;
            reasons.push(`Trend data is ${Math.floor(daysOld)} days old`);
        }
    }

    if (input.lastRejectedAt) {
        const daysSinceRejection = (Date.now() - input.lastRejectedAt.getTime()) / 86_400_000;
        if (daysSinceRejection < REJECTION_DECAY_DAYS) {
            const decay = daysSinceRejection / REJECTION_DECAY_DAYS;
            multiplier *= RECENT_REJECTION_PENALTY + decay * (1 - RECENT_REJECTION_PENALTY);
            reasons.push(`Recently rejected (${Math.floor(daysSinceRejection)} days ago)`);
        }
    }

    return { exclude: false, multiplier, reasons };
}

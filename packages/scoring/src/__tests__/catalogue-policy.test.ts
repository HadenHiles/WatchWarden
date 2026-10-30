import { describe, expect, it } from "vitest";
import { assessRetention, assessStorageAdmission, DEFAULT_MAX_STORAGE_BYTES, RetentionEvidence } from "../catalogue-policy";

const now = new Date("2026-10-29T12:00:00Z");
const evidence = { observedAt: now, complete: true, managedBytes: 900_000_000_000, reservedBytes: 50_000_000_000 };
const retention: RetentionEvidence = {
    userRequested: false, pinned: false, permanent: false, keepUntil: null,
    activePlayback: false, inProgress: false, watchlisted: false, lastWatchedAt: null,
    playbackHistoryComplete: true, currentlyFeatured: false, outOfRotationSince: new Date("2026-09-01"),
    minimumAvailabilityMet: true, demand: "cooling",
};

describe("bounded managed catalogue", () => {
    it("defaults to decimal 1 TB and counts existing retained titles plus reservations", () => {
        expect(DEFAULT_MAX_STORAGE_BYTES).toBe(1_000_000_000_000);
        expect(assessStorageAdmission(evidence, 50_000_000_000, undefined, now).allowed).toBe(true);
        expect(assessStorageAdmission(evidence, 50_000_000_001, undefined, now).reason).toBe("storage_budget_exhausted");
        expect(assessStorageAdmission(evidence, 1, 900_000_000_000, now).allowed).toBe(false);
    });

    it("blocks acquisitions on unknown sizes, incomplete or stale storage facts", () => {
        expect(assessStorageAdmission(null, 1, undefined, now).allowed).toBe(false);
        expect(assessStorageAdmission(evidence, null, undefined, now).reason).toBe("acquisition_size_unknown");
        expect(assessStorageAdmission({ ...evidence, complete: false }, 1, undefined, now).allowed).toBe(false);
        expect(assessStorageAdmission({ ...evidence, observedAt: new Date("2026-10-28") }, 1, undefined, now).allowed).toBe(false);
    });

    it.each(["activePlayback", "inProgress", "watchlisted", "userRequested", "pinned", "permanent", "currentlyFeatured"] as const)("keeps protected titles for %s regardless of shelf rotation", (field) => {
        expect(assessRetention({ ...retention, [field]: true }, now)).toMatchObject({ decision: "keep", deletionAuthorized: false });
    });

    it("keeps recent viewing and sustained demand without authorizing deletion", () => {
        expect(assessRetention({ ...retention, lastWatchedAt: new Date("2026-10-20") }, now).decision).toBe("keep");
        expect(assessRetention({ ...retention, demand: "sustained" }, now).decision).toBe("keep");
    });

    it("routes missing Watchlist, progress or demand evidence to review, not deletion", () => {
        expect(assessRetention({ ...retention, watchlisted: null, inProgress: null, demand: "uncertain" }, now))
            .toMatchObject({ decision: "review", reasons: ["viewing_progress_unknown", "watchlist_coverage_unknown", "demand_uncertain"], deletionAuthorized: false });
    });

    it("only identifies a retirement candidate after complete negative evidence and grace", () => {
        expect(assessRetention(retention, now)).toMatchObject({ decision: "retirement_candidate", deletionAuthorized: false });
        expect(assessRetention({ ...retention, outOfRotationSince: now }, now).decision).toBe("review");
    });

    it("only surfaces a demand coin toss to the owner after other evidence is complete", () => {
        expect(assessRetention({ ...retention, demand: "uncertain" }, now).reviewKind).toBe("owner_decision");
        expect(assessRetention({ ...retention, demand: "uncertain", watchlisted: null }, now).reviewKind).toBe("investigation_required");
    });
});
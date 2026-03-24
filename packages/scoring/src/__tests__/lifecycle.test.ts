import { describe, it, expect } from "vitest";
import { evaluateLifecycleTransition } from "../lifecycle-transitions";
import type { LifecycleTransitionInput } from "../lifecycle-transitions";

const BASE: LifecycleTransitionInput = {
    currentStatus: "APPROVED",
    lifecyclePolicy: "TEMPORARY_TRENDING",
    isRequested: false,
    inLibrary: false,
    isPinned: false,
    cleanupEligible: false,
    jellyseerrRequestStatus: null,
    finalScore: 0.7,
    latestSnapshotAt: new Date(),
    keepUntil: null,
};

describe("evaluateLifecycleTransition", () => {
    it("APPROVED → REQUESTED when jellyseerrRequestStatus is non-null", () => {
        const result = evaluateLifecycleTransition({
            ...BASE,
            currentStatus: "APPROVED",
            jellyseerrRequestStatus: "pending",
        });
        expect(result.newStatus).toBe("REQUESTED");
        expect(result.changed).toBe(true);
    });

    it("REQUESTED → AVAILABLE when inLibrary=true", () => {
        const result = evaluateLifecycleTransition({
            ...BASE,
            currentStatus: "REQUESTED",
            inLibrary: true,
        });
        expect(result.newStatus).toBe("AVAILABLE");
        expect(result.changed).toBe(true);
    });

    it("AVAILABLE → ACTIVE_TRENDING when score is high and snapshot is fresh", () => {
        const result = evaluateLifecycleTransition({
            ...BASE,
            currentStatus: "AVAILABLE",
            finalScore: 0.8,
            latestSnapshotAt: new Date(),
        });
        expect(result.newStatus).toBe("ACTIVE_TRENDING");
        expect(result.changed).toBe(true);
    });

    it("AVAILABLE stays when score is below threshold", () => {
        const result = evaluateLifecycleTransition({
            ...BASE,
            currentStatus: "AVAILABLE",
            finalScore: 0.2,
        });
        expect(result.newStatus).toBe("AVAILABLE");
        expect(result.changed).toBe(false);
    });

    it("ACTIVE_TRENDING → CLEANUP_ELIGIBLE when snapshot is stale", () => {
        const staleDate = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000); // 25 days ago
        const result = evaluateLifecycleTransition({
            ...BASE,
            currentStatus: "ACTIVE_TRENDING",
            latestSnapshotAt: staleDate,
        });
        expect(result.newStatus).toBe("CLEANUP_ELIGIBLE");
        expect(result.cleanupEligible).toBe(true);
        expect(result.changed).toBe(true);
    });

    it("ACTIVE_TRENDING → CLEANUP_ELIGIBLE when score drops below threshold", () => {
        const result = evaluateLifecycleTransition({
            ...BASE,
            currentStatus: "ACTIVE_TRENDING",
            finalScore: 0.1,
        });
        expect(result.newStatus).toBe("CLEANUP_ELIGIBLE");
        expect(result.changed).toBe(true);
    });

    it("PERMANENT policy prevents cleanup", () => {
        const result = evaluateLifecycleTransition({
            ...BASE,
            currentStatus: "ACTIVE_TRENDING",
            lifecyclePolicy: "PERMANENT",
            finalScore: 0.1,
            latestSnapshotAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        });
        expect(result.newStatus).toBe("ACTIVE_TRENDING");
        expect(result.cleanupEligible).toBe(false);
    });

    it("isPinned=true forces PINNED status", () => {
        const result = evaluateLifecycleTransition({
            ...BASE,
            currentStatus: "ACTIVE_TRENDING",
            isPinned: true,
        });
        expect(result.newStatus).toBe("PINNED");
        expect(result.changed).toBe(true);
    });

    it("un-pinning from PINNED moves to AVAILABLE when inLibrary", () => {
        const result = evaluateLifecycleTransition({
            ...BASE,
            currentStatus: "PINNED",
            isPinned: false,
            inLibrary: true,
        });
        expect(result.newStatus).toBe("AVAILABLE");
        expect(result.changed).toBe(true);
    });

    it("CLEANUP_ELIGIBLE → EXPIRED after keepUntil passed by 90+ days", () => {
        const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days ago
        const result = evaluateLifecycleTransition({
            ...BASE,
            currentStatus: "CLEANUP_ELIGIBLE",
            cleanupEligible: true,
            keepUntil: oldDate,
        });
        expect(result.newStatus).toBe("EXPIRED");
        expect(result.changed).toBe(true);
    });

    it("returns changed=false when no transition applies", () => {
        const result = evaluateLifecycleTransition({
            ...BASE,
            currentStatus: "APPROVED",
            jellyseerrRequestStatus: null,
        });
        expect(result.changed).toBe(false);
        expect(result.newStatus).toBe("APPROVED");
    });
});

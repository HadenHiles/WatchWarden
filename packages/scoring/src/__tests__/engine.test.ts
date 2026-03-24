import { describe, it, expect } from "vitest";
import { scoreTitle } from "../engine";
import type { ScoringInput } from "../engine";

const BASE_WEIGHTS = {
    externalTrendScore: 0.45,
    localInterestScore: 0.35,
    freshnessScore: 0.1,
    editorialBoost: 0.1,
};

const BASE_RULES: ScoringInput["rules"] = {
    snapshotAt: new Date(),
    lastRejectedAt: null,
    uniqueViewerCount: 0,
    completionRate: 0,
    inLibrary: false,
    isRequested: false,
    isPermanentlyRejected: false,
    excludeInLibrary: true,
    excludeAlreadyRequested: true,
    excludePermanentlyRejected: true,
};

describe("scoreTitle", () => {
    it("computes a weighted score from components", () => {
        const result = scoreTitle({
            externalTrendScore: 0.8,
            localInterestScore: 0.6,
            freshnessScore: 1.0,
            editorialBoost: 0.0,
            weights: BASE_WEIGHTS,
            rules: BASE_RULES,
        });

        expect(result.excluded).toBe(false);
        const expected = 0.8 * 0.45 + 0.6 * 0.35 + 1.0 * 0.1 + 0.0 * 0.1;
        expect(result.breakdown.finalScore).toBeCloseTo(expected, 4);
    });

    it("clamps score to [0, 1]", () => {
        const result = scoreTitle({
            externalTrendScore: 1.0,
            localInterestScore: 1.0,
            freshnessScore: 1.0,
            editorialBoost: 1.0,
            weights: BASE_WEIGHTS,
            rules: BASE_RULES,
        });
        expect(result.breakdown.finalScore).toBeLessThanOrEqual(1);
        expect(result.breakdown.finalScore).toBeGreaterThanOrEqual(0);
    });

    it("excludes titles already in the library", () => {
        const result = scoreTitle({
            externalTrendScore: 0.9,
            localInterestScore: 0.9,
            freshnessScore: 0.9,
            editorialBoost: 0.9,
            weights: BASE_WEIGHTS,
            rules: { ...BASE_RULES, inLibrary: true, excludeInLibrary: true },
        });
        expect(result.excluded).toBe(true);
        expect(result.breakdown.finalScore).toBe(0);
    });

    it("does NOT exclude library titles when excludeInLibrary=false", () => {
        const result = scoreTitle({
            externalTrendScore: 0.8,
            localInterestScore: 0.5,
            freshnessScore: 0.5,
            editorialBoost: 0.0,
            weights: BASE_WEIGHTS,
            rules: { ...BASE_RULES, inLibrary: true, excludeInLibrary: false },
        });
        expect(result.excluded).toBe(false);
    });

    it("excludes permanently rejected titles", () => {
        const result = scoreTitle({
            externalTrendScore: 0.9,
            localInterestScore: 0.9,
            freshnessScore: 0.9,
            editorialBoost: 0.0,
            weights: BASE_WEIGHTS,
            rules: { ...BASE_RULES, isPermanentlyRejected: true, excludePermanentlyRejected: true },
        });
        expect(result.excluded).toBe(true);
    });

    it("applies stale trend penalty to score", () => {
        const staleDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000); // 20 days ago
        const freshResult = scoreTitle({
            externalTrendScore: 0.8,
            localInterestScore: 0.5,
            freshnessScore: 0.8,
            editorialBoost: 0.0,
            weights: BASE_WEIGHTS,
            rules: { ...BASE_RULES, snapshotAt: new Date() },
        });
        const staleResult = scoreTitle({
            externalTrendScore: 0.8,
            localInterestScore: 0.5,
            freshnessScore: 0.8,
            editorialBoost: 0.0,
            weights: BASE_WEIGHTS,
            rules: { ...BASE_RULES, snapshotAt: staleDate },
        });
        expect(staleResult.breakdown.finalScore).toBeLessThan(freshResult.breakdown.finalScore);
    });

    it("applies rejection decay penalty for recently rejected titles", () => {
        const recentlyRejectedDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
        const normalResult = scoreTitle({
            externalTrendScore: 0.8,
            localInterestScore: 0.5,
            freshnessScore: 0.8,
            editorialBoost: 0.0,
            weights: BASE_WEIGHTS,
            rules: { ...BASE_RULES, lastRejectedAt: null },
        });
        const penalizedResult = scoreTitle({
            externalTrendScore: 0.8,
            localInterestScore: 0.5,
            freshnessScore: 0.8,
            editorialBoost: 0.0,
            weights: BASE_WEIGHTS,
            rules: { ...BASE_RULES, lastRejectedAt: recentlyRejectedDate },
        });
        expect(penalizedResult.breakdown.finalScore).toBeLessThan(normalResult.breakdown.finalScore);
    });

    it("includes reasons in output", () => {
        const result = scoreTitle({
            externalTrendScore: 0.7,
            localInterestScore: 0.4,
            freshnessScore: 0.9,
            editorialBoost: 0.0,
            weights: BASE_WEIGHTS,
            rules: BASE_RULES,
        });
        expect(Array.isArray(result.reasons)).toBe(true);
        expect(typeof result.explanation).toBe("string");
    });
});

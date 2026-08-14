import { describe, expect, it } from "vitest";
import { culturalHeat, isRecentlyReleased, resolvePlatformSnapshots, selectPublishedShelfIds } from "../shelf-ranking";

describe("shelf ranking", () => {
    const now = new Date("2026-08-13T12:00:00Z");
    it("ranks current high-ranked cultural titles above stale titles", () => {
        const current = culturalHeat({ tmdbTrends: [0.9, 0.8], rank: 1, snapshotAt: now, region: "CA" }, now);
        const stale = culturalHeat({ tmdbTrends: [0.9, 0.8], rank: 20, snapshotAt: new Date("2026-07-13"), region: "CA" }, now);
        expect(current).toBeGreaterThan(stale);
    });
    it("does not penalize a title when only one TMDB feed contains it", () => {
        const single = culturalHeat({ tmdbTrends: [0.8], rank: 1, snapshotAt: now }, now);
        const explicit = culturalHeat({ tmdbTrend: 0.8, rank: 1, snapshotAt: now }, now);
        expect(single).toBeCloseTo(explicit);
    });
    it("prefers CA, falls back to US, then lower rank deterministically", () => {
        const rows = resolvePlatformSnapshots([
            { titleId: "a", providerRank: 1, region: "US", snapshotAt: now },
            { titleId: "a", providerRank: 8, region: "CA", snapshotAt: now },
            { titleId: "b", providerRank: 2, region: "US", snapshotAt: now },
        ]);
        expect(rows.map((r) => [r.titleId, r.region])).toEqual([["b", "US"], ["a", "CA"]]);
    });
    it("enforces an enabled deterministic Home budget", () => {
        expect(selectPublishedShelfIds([
            { id: "b", enabled: true, publishToHome: true, homePriority: 1 },
            { id: "a", enabled: true, publishToHome: true, homePriority: 1 },
            { id: "c", enabled: false, publishToHome: true, homePriority: 0 },
        ], 1)).toEqual(["a"]);
    });
    it("determines recency from release date and configured window", () => {
        expect(isRecentlyReleased(new Date("2026-06-01"), now, 90)).toBe(true);
        expect(isRecentlyReleased(new Date("2026-01-01"), now, 90)).toBe(false);
        expect(isRecentlyReleased(null, now, 90)).toBe(false);
    });
});

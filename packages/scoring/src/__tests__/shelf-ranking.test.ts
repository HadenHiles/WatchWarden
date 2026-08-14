import { describe, expect, it } from "vitest";
import { culturalHeat, diversifyShelf, isRecentlyReleased, rankProviderHistory, resolvePlatformSnapshots, selectStreamingEditorialTitles, selectPublishedShelfIds } from "../shelf-ranking";

describe("shelf ranking", () => {
    const now = new Date("2026-08-13T12:00:00Z");
    it("merchandises Netflix shows across recent, original, rising, and evergreen lanes", () => {
        const shows = selectStreamingEditorialTitles([
            { id: "recent-a", providerRank: 8, firstAirDate: new Date("2026-07-01"), lastAirDate: null, isNetflixOriginal: false, rankMomentum: 0, stableDays: 2 },
            { id: "recent-b", providerRank: 9, firstAirDate: new Date("2026-06-01"), lastAirDate: null, isNetflixOriginal: false, rankMomentum: 0, stableDays: 2 },
            { id: "original", providerRank: 6, firstAirDate: new Date("2023-01-01"), lastAirDate: null, isNetflixOriginal: true, rankMomentum: 0, stableDays: 5 },
            { id: "rising", providerRank: 12, firstAirDate: new Date("2020-01-01"), lastAirDate: null, isNetflixOriginal: false, rankMomentum: 10, stableDays: 4 },
            { id: "evergreen", providerRank: 1, firstAirDate: new Date("1994-01-01"), lastAirDate: null, isNetflixOriginal: false, rankMomentum: 0, stableDays: 100 },
        ], 5, now);
        expect(shows.map((show) => show.id)).toEqual(["recent-a", "recent-b", "original", "rising", "evergreen"]);
    });
    it("diversifies a general shelf around a priority shelf", () => {
        expect(diversifyShelf(["a", "b", "c", "d", "e", "f"], ["a", "b", "c"], 4, 0.25))
            .toEqual(["a", "d", "e", "f"]);
    });
    it("relaxes overlap when unique candidates cannot fill the shelf", () => {
        expect(diversifyShelf(["a", "b", "c"], ["a", "b", "c"], 3, 0.25))
            .toEqual(["a", "b", "c"]);
    });
    it("ranks current high-ranked cultural titles above stale titles", () => {
        const current = culturalHeat({ tmdbTrends: [0.9, 0.8], rank: 1, snapshotAt: now, region: "CA" }, now);
        const stale = culturalHeat({ tmdbTrends: [0.9, 0.8], rank: 20, snapshotAt: new Date("2026-07-13"), region: "CA" }, now);
        expect(current).toBeGreaterThan(stale);
    });
    it("ranks sustained provider popularity across recent weeks", () => {
        expect(rankProviderHistory([
            { titleId: "sustained", providerRank: 2, snapshotAt: now },
            { titleId: "sustained", providerRank: 2, snapshotAt: new Date("2026-08-06T12:00:00Z") },
            { titleId: "one-day", providerRank: 1, snapshotAt: now },
            { titleId: "stale", providerRank: 1, snapshotAt: new Date("2026-07-13T12:00:00Z") },
        ], now)).toEqual(["sustained", "one-day", "stale"]);
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

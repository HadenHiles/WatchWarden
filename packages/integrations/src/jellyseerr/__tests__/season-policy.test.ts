import { describe, expect, it } from "vitest";
import { planSeasonExpansion, selectInitialSeasons } from "../season-policy";

const now = new Date("2026-10-29T12:00:00Z");
const seasons = [
    { seasonNumber: 0, episodeCount: 20, airDate: "2020-01-01" },
    { seasonNumber: 1, episodeCount: 10, airDate: "2021-01-01" },
    { seasonNumber: 2, episodeCount: 10, airDate: "2022-01-01" },
    { seasonNumber: 3, episodeCount: 10, airDate: "2026-10-01" },
    { seasonNumber: 4, episodeCount: 10, airDate: "2027-01-01" },
];
describe("bounded bot TV acquisition", () => {
    it("selects first and latest aired seasons, never the entire show or specials", () => {
        expect(selectInitialSeasons(seasons, now).seasons).toEqual([1, 3]);
        expect(selectInitialSeasons(seasons.filter(season => season.seasonNumber === 1), now).seasons).toEqual([1]);
    });
    it("defers unknown and oversized metadata instead of guessing", () => {
        expect(selectInitialSeasons([{ seasonNumber: 1 }], now).seasons).toEqual([]);
        expect(selectInitialSeasons([{ seasonNumber: 1, airDate: "2026-01-01", episodeCount: 100 }], now).reason).toBe("large_season_requires_review");
        expect(selectInitialSeasons(seasons, now, 10).seasons).toEqual([1]);
    });
    it("plans only the next missing aired season after distinct recent episodes", () => {
        expect(planSeasonExpansion({ seasons, ownedSeasons: [1, 3], watchingSeason: 1,
            distinctEpisodesWatched: 2, lastWatchedAt: now, userRequested: false }, now))
            .toMatchObject({ nextSeason: 2, protectFromRotationExpiry: true, acquisitionAuthorized: false });
        expect(planSeasonExpansion({ seasons, ownedSeasons: [1, 3], watchingSeason: 1,
            distinctEpisodesWatched: 1, lastWatchedAt: now, userRequested: false }, now).nextSeason).toBeNull();
    });
});
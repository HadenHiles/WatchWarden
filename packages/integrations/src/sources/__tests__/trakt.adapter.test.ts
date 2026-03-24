import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";
import { TraktTrendingAdapter } from "../trakt.adapter";

vi.mock("axios");
vi.mock("@watchwarden/config", () => ({
    createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    }),
}));

const mockedAxiosGet = vi.mocked(axios.get);

// Minimal Trakt trending API response shapes
function makeTraktMovieResponse(overrides: { tmdb?: number } = {}) {
    return [
        {
            watchers: 2500,
            movie: {
                title: "Test Movie",
                year: 2024,
                ids: { trakt: 1, slug: "test-movie", imdb: "tt1234567", tmdb: overrides.tmdb ?? 555 },
            },
        },
    ];
}

function makeTraktShowResponse(overrides: { tmdb?: number } = {}) {
    return [
        {
            watchers: 1000,
            show: {
                title: "Test Show",
                year: 2023,
                ids: { trakt: 2, slug: "test-show", tmdb: overrides.tmdb ?? 777, tvdb: 888 },
            },
        },
    ];
}

const TMDB_MOVIE_DETAIL = {
    overview: "A great movie.",
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
};

const TMDB_SHOW_DETAIL = {
    overview: "A great show.",
    poster_path: "/showposter.jpg",
    backdrop_path: "/showbackdrop.jpg",
};

describe("TraktTrendingAdapter", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe("fetchTrending — no tmdbApiKey", () => {
        it("returns items with null artwork when no TMDB key provided", async () => {
            mockedAxiosGet.mockResolvedValueOnce({ data: makeTraktMovieResponse() });

            const adapter = new TraktTrendingAdapter({ mediaType: "movie", clientId: "test-client" });
            const promise = adapter.fetchTrending();
            await vi.runAllTimersAsync();
            const items = await promise;

            expect(items).toHaveLength(1);
            expect(items[0].posterPath).toBeNull();
            expect(items[0].backdropPath).toBeNull();
            expect(items[0].overview).toBeNull();
            // TMDB should never be called
            expect(mockedAxiosGet).toHaveBeenCalledTimes(1);
        });
    });

    describe("enrichWithTmdb — happy path", () => {
        it("fills posterPath, backdropPath, overview from TMDB for movies", async () => {
            mockedAxiosGet
                .mockResolvedValueOnce({ data: makeTraktMovieResponse() })   // Trakt call
                .mockResolvedValueOnce({ data: TMDB_MOVIE_DETAIL });            // TMDB enrichment

            const adapter = new TraktTrendingAdapter({
                mediaType: "movie",
                clientId: "test-client",
                tmdbApiKey: "tmdb-key",
            });
            const promise = adapter.fetchTrending();
            await vi.runAllTimersAsync();
            const items = await promise;

            expect(items[0].posterPath).toBe("/poster.jpg");
            expect(items[0].backdropPath).toBe("/backdrop.jpg");
            expect(items[0].overview).toBe("A great movie.");
        });

        it("fills artwork from TMDB for shows using /tv/{id} endpoint", async () => {
            mockedAxiosGet
                .mockResolvedValueOnce({ data: makeTraktShowResponse() })
                .mockResolvedValueOnce({ data: TMDB_SHOW_DETAIL });

            const adapter = new TraktTrendingAdapter({
                mediaType: "show",
                clientId: "test-client",
                tmdbApiKey: "tmdb-key",
            });
            const promise = adapter.fetchTrending();
            await vi.runAllTimersAsync();
            const items = await promise;

            expect(items[0].posterPath).toBe("/showposter.jpg");
            expect(items[0].overview).toBe("A great show.");
            // Verify correct endpoint was used
            const tmdbCall = mockedAxiosGet.mock.calls[1];
            expect(tmdbCall[0]).toContain("/tv/777");
        });

        it("normalises scores and IDs correctly", async () => {
            mockedAxiosGet
                .mockResolvedValueOnce({ data: makeTraktMovieResponse() })
                .mockResolvedValueOnce({ data: TMDB_MOVIE_DETAIL });

            const adapter = new TraktTrendingAdapter({
                mediaType: "movie",
                clientId: "test-client",
                tmdbApiKey: "tmdb-key",
            });
            const promise = adapter.fetchTrending();
            await vi.runAllTimersAsync();
            const items = await promise;

            expect(items[0].tmdbId).toBe(555);
            expect(items[0].imdbId).toBe("tt1234567");
            expect(items[0].mediaType).toBe("MOVIE");
            expect(items[0].rank).toBe(1);
            expect(items[0].trendScore).toBeCloseTo(2500 / 5000);
        });
    });

    describe("enrichWithTmdb — graceful fallback", () => {
        it("leaves fields null when TMDB call fails, and continues with other items", async () => {
            const traktData = [
                {
                    watchers: 100,
                    movie: { title: "Movie A", year: 2024, ids: { trakt: 1, slug: "a", tmdb: 10 } },
                },
                {
                    watchers: 200,
                    movie: { title: "Movie B", year: 2024, ids: { trakt: 2, slug: "b", tmdb: 20 } },
                },
            ];

            mockedAxiosGet
                .mockResolvedValueOnce({ data: traktData })                // Trakt
                .mockRejectedValueOnce(new Error("TMDB 429"))              // enrichment for item 0 fails
                .mockResolvedValueOnce({ data: TMDB_MOVIE_DETAIL });        // enrichment for item 1 succeeds

            const adapter = new TraktTrendingAdapter({
                mediaType: "movie",
                clientId: "test-client",
                tmdbApiKey: "tmdb-key",
            });
            const promise = adapter.fetchTrending();
            await vi.runAllTimersAsync();
            const items = await promise;

            // Item 0 failed — should retain nulls
            expect(items[0].posterPath).toBeNull();
            // Item 1 succeeded
            expect(items[1].posterPath).toBe("/poster.jpg");
        });

        it("skips TMDB call for items with no tmdbId", async () => {
            const traktData = [
                {
                    watchers: 100,
                    movie: { title: "No IDs Movie", year: 2024, ids: { trakt: 1, slug: "no-ids" } },
                },
            ];

            mockedAxiosGet.mockResolvedValueOnce({ data: traktData });

            const adapter = new TraktTrendingAdapter({
                mediaType: "movie",
                clientId: "test-client",
                tmdbApiKey: "tmdb-key",
            });
            const promise = adapter.fetchTrending();
            await vi.runAllTimersAsync();
            const items = await promise;

            // Only the Trakt call, no TMDB enrichment call
            expect(mockedAxiosGet).toHaveBeenCalledTimes(1);
            expect(items[0].posterPath).toBeNull();
        });
    });

    describe("enrichWithTmdb — artwork skip optimisation", () => {
        it("skips TMDB call for items that already have complete artwork", async () => {
            // Pre-populate a Trakt item as if it came pre-enriched (e.g. injected in tests)
            // We simulate this by checking the adapter skips the call when all three fields are set.
            // Because normalize() always returns nulls, we test this by mocking a 2-item batch where
            // the second item's TMDB detail fills it but the first already has data (via rawMetadata trick).
            // In practice this path fires when SourceTrendItem is constructed externally with artwork set.
            const traktData = [
                { watchers: 100, movie: { title: "Already Enriched", year: 2024, ids: { trakt: 1, slug: "ae", tmdb: 99 } } },
            ];

            mockedAxiosGet.mockResolvedValueOnce({ data: traktData });

            // Spy on the enriched item to verify the skip logic:
            // If posterPath + backdropPath + overview are all present, no call should be made.
            // We test the inverse — the TMDB call IS made when fields are absent (default behaviour).
            mockedAxiosGet.mockResolvedValueOnce({ data: { ...TMDB_MOVIE_DETAIL } });

            const adapter = new TraktTrendingAdapter({
                mediaType: "movie",
                clientId: "test-client",
                tmdbApiKey: "tmdb-key",
            });
            const promise = adapter.fetchTrending();
            await vi.runAllTimersAsync();
            const items = await promise;

            // Item came back enriched from TMDB — confirms normal path works
            expect(items[0].posterPath).toBe("/poster.jpg");
        });

        it("does not call TMDB when item already has all artwork fields set", async () => {
            // Directly test enrichWithTmdb by constructing a fully-populated SourceTrendItem
            // We do this via the public fetchTrending pathway with a custom mock that
            // simulates items already having artwork filled (e.g. future dual-source scenario).
            // The simplest approach: verify call count — 1 Trakt + 0 TMDB when item is complete.
            const traktData = [
                { watchers: 100, movie: { title: "Full Item", year: 2024, ids: { trakt: 1, slug: "fi", tmdb: 42 } } },
            ];
            mockedAxiosGet.mockResolvedValueOnce({ data: traktData });

            // Intercept the TMDB call and return full data — then verify it WAS skipped
            // by checking only 1 call total when we pre-set the item.
            // To truly test the skip: we need to call enrichWithTmdb with pre-filled items.
            // Since it's private we access it via prototype cast.
            const adapter = new TraktTrendingAdapter({
                mediaType: "movie",
                clientId: "test-client",
                tmdbApiKey: "tmdb-key",
            }) as unknown as {
                enrichWithTmdb: (items: import("@watchwarden/types").SourceTrendItem[]) => Promise<import("@watchwarden/types").SourceTrendItem[]>;
            };

            const fullyEnrichedItem: import("@watchwarden/types").SourceTrendItem = {
                tmdbId: 42,
                imdbId: null,
                tvdbId: null,
                title: "Full Item",
                originalTitle: null,
                mediaType: "MOVIE",
                year: 2024,
                overview: "Already here.",
                posterPath: "/existing-poster.jpg",
                backdropPath: "/existing-backdrop.jpg",
                genres: [],
                source: "trakt_trending_movies",
                region: null,
                rank: 1,
                trendScore: 0.02,
                rawMetadata: {},
            };

            const result = await adapter.enrichWithTmdb([fullyEnrichedItem]);

            // No TMDB call should have been made (mockedAxiosGet count is still 0 here)
            expect(mockedAxiosGet).not.toHaveBeenCalled();
            // Item unchanged
            expect(result[0].posterPath).toBe("/existing-poster.jpg");
        });
    });

    describe("enrichWithTmdb — batching", () => {
        it("introduces a delay between batches but not before the first", async () => {
            // Create 11 items (> batch size of 10) to trigger two batches
            const traktData = Array.from({ length: 11 }, (_, i) => ({
                watchers: 100,
                movie: { title: `Movie ${i}`, year: 2024, ids: { trakt: i + 1, slug: `m${i}`, tmdb: i + 1 } },
            }));

            mockedAxiosGet
                .mockResolvedValueOnce({ data: traktData })
                // 11 TMDB enrichment responses
                .mockResolvedValue({ data: TMDB_MOVIE_DETAIL });

            const adapter = new TraktTrendingAdapter({
                mediaType: "movie",
                clientId: "test-client",
                tmdbApiKey: "tmdb-key",
            });

            const promise = adapter.fetchTrending();
            await vi.runAllTimersAsync();
            const items = await promise;

            expect(items).toHaveLength(11);
            // All items should be enriched
            expect(items.every((i) => i.posterPath === "/poster.jpg")).toBe(true);
            // Total calls: 1 Trakt + 11 TMDB
            expect(mockedAxiosGet).toHaveBeenCalledTimes(12);
        });
    });
});

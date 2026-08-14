import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TmdbTrendingAdapter } from "../tmdb.adapter";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));
vi.mock("@watchwarden/config", () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const response = {
    data: {
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [{
            id: 42,
            title: "Example",
            release_date: "2026-08-01",
            popularity: 800,
            poster_path: "/poster.jpg",
        }],
    },
};

describe("TmdbTrendingAdapter", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(axios.get).mockResolvedValue(response);
    });

    it.each([
        ["trending_day", "/trending/movie/day"],
        ["trending_week", "/trending/movie/week"],
        ["popular", "/movie/popular"],
        ["current", "/movie/now_playing"],
    ] as const)("fetches the %s movie feed", async (feed, path) => {
        const adapter = new TmdbTrendingAdapter({ mediaType: "movie", feed, apiKey: "key" });
        const items = await adapter.fetchTrending();

        expect(axios.get).toHaveBeenCalledWith(expect.stringContaining(path), expect.any(Object));
        expect(items[0]).toMatchObject({ tmdbId: 42, mediaType: "MOVIE", trendScore: 0.8 });
    });

    it("normalizes TV responses that do not include media_type", async () => {
        vi.mocked(axios.get).mockResolvedValue({
            data: { ...response.data, results: [{ id: 7, name: "Example Show", first_air_date: "2025-01-02", popularity: 500 }] },
        });
        const items = await new TmdbTrendingAdapter({ mediaType: "tv", feed: "popular", apiKey: "key" }).fetchTrending();
        expect(items[0]).toMatchObject({ title: "Example Show", mediaType: "SHOW", year: 2025 });
    });
});

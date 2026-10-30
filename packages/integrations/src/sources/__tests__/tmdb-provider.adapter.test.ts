import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TmdbProviderDiscoveryAdapter } from "../tmdb-provider.adapter";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));

describe("TmdbProviderDiscoveryAdapter", () => {
    beforeEach(() => { vi.clearAllMocks(); });
    it("requests flatrate subscription results explicitly", async () => {
        vi.mocked(axios.get).mockResolvedValue({ data: { page: 1, total_pages: 1, total_results: 0, results: [] } });
        await new TmdbProviderDiscoveryAdapter({ providerName: "Netflix", tmdbProviderId: 8, mediaType: "movie", region: "CA", apiKey: "test" }).fetchTrending();
        expect(axios.get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ params: expect.objectContaining({ with_watch_monetization_types: "flatrate" }) }));
    });
    it("labels regional availability separately from global popularity", async () => {
        vi.mocked(axios.get).mockResolvedValue({ data: { page: 1, total_pages: 1, total_results: 1,
            results: [{ id: 42, name: "Example", popularity: 200, first_air_date: "2026-01-01" }] } });
        const adapter = new TmdbProviderDiscoveryAdapter({ providerName: "Prime Video", tmdbProviderId: 9, mediaType: "tv", region: "CA", apiKey: "test" });
        const items = await adapter.fetchTrending();
        expect(adapter.sourceName).toContain("Discovery");
        expect(items[0].rawMetadata).toMatchObject({ rankingBasis: "tmdb_global_popularity", rankingRegion: null,
            availabilityRegion: "CA", sourcePublishedAt: null });
    });
});

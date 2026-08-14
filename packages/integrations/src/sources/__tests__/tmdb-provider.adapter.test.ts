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
});

import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NetflixTop10Adapter, netflixTitleForTmdbSearch, parseNetflixTop10Titles } from "../netflix-top10.adapter";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));
vi.mock("@watchwarden/config", () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn() }) }));

describe("parseNetflixTop10Titles", () => {
    it("extracts and decodes ordered titles from Netflix cards", () => {
        const html = Array.from({ length: 12 }, (_, index) => `
            <div data-uia="top10-card">
                <div data-uia="top10-card-logo"><img alt="${index === 0 ? "KPop &amp; Friends" : `Title ${index + 1}`}" /></div>
            </div>`).join("");

        expect(parseNetflixTop10Titles(html)).toEqual([
            "KPop & Friends", "Title 2", "Title 3", "Title 4", "Title 5",
            "Title 6", "Title 7", "Title 8", "Title 9", "Title 10",
        ]);
    });

    it("removes Netflix season labels for TMDB resolution", () => {
        expect(netflixTitleForTmdbSearch("My Life With the Walter Boys: Season 3")).toBe("My Life With the Walter Boys");
        expect(netflixTitleForTmdbSearch("The Bombing of Pan Am 103: Limited Series")).toBe("The Bombing of Pan Am 103");
        expect(netflixTitleForTmdbSearch("Raw: 2026 - August 3, 2026")).toBe("WWE Raw");
        expect(netflixTitleForTmdbSearch("Example: Part 4")).toBe("Example");
        expect(netflixTitleForTmdbSearch("Example: S11: Boston")).toBe("Example");
    });
});

describe("complete Netflix country-chart resolution", () => {
    const html = Array.from({ length: 10 }, (_, index) => `<div data-uia="top10-card"><div data-uia="top10-card-logo"><img alt="Title ${index + 1}" /></div></div>`).join("");
    const adapter = () => new NetflixTop10Adapter({ region: "CA", mediaType: "tv", apiKey: "test" });
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(axios.get).mockImplementation(async (url, options) => {
            if (String(url).includes("netflix.com")) return { data: html };
            const query = options?.params?.query as string;
            return { data: { results: [{ id: Number(query.split(" ")[1]), name: query, first_air_date: "2026-01-01" }] } };
        });
    });

    it("keeps official country provenance separate from an unknown publication date", async () => {
        const items = await adapter().fetchTrending();
        expect(items).toHaveLength(10);
        expect(items[0].rawMetadata).toMatchObject({ rankingBasis: "netflix_country_chart", rankingRegion: "CA", timeWindow: "week", sourcePublishedAt: null });
    });

    it("rejects incomplete charts before resolving any titles", async () => {
        vi.mocked(axios.get).mockResolvedValue({ data: '<div data-uia="top10-card"><div data-uia="top10-card-logo"><img alt="Only one" /></div></div>' });
        await expect(adapter().fetchTrending()).rejects.toThrow("chart is incomplete");
        expect(axios.get).toHaveBeenCalledTimes(1);
    });

    it.each(["unmatched", "ambiguous"])("does not silently guess an %s TMDB match", async (kind) => {
        vi.mocked(axios.get).mockImplementation(async (url, options) => {
            if (String(url).includes("netflix.com")) return { data: html };
            const query = options?.params?.query as string;
            const result = { id: 1, name: kind === "unmatched" ? "Different title" : query };
            return { data: { results: kind === "ambiguous" ? [result, { ...result, id: 2 }] : [result] } };
        });
        await expect(adapter().fetchTrending()).rejects.toThrow("resolution is incomplete");
    });
});

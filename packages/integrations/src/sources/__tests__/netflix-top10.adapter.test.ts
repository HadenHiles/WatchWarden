import { describe, expect, it } from "vitest";
import { netflixTitleForTmdbSearch, parseNetflixTop10Titles } from "../netflix-top10.adapter";

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
    });
});

import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlexClient } from "../client";

vi.mock("axios", () => ({ default: { create: vi.fn() }, AxiosError: class extends Error { } }));
vi.mock("@watchwarden/config", () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));

describe("Plex collection protocol", () => {
    const http = { get: vi.fn(), put: vi.fn() };
    let client: PlexClient;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(axios.create).mockReturnValue(http as unknown as ReturnType<typeof axios.create>);
        client = new PlexClient({ baseUrl: "http://plex.test", token: "test-token" });
    });

    it("sets custom sort and moves the first item to the front, then each successor", async () => {
        http.get.mockResolvedValueOnce({ data: { MediaContainer: { Metadata: [{ type: "collection", librarySectionID: 1, smart: false }] } } });
        await client.setCollectionOrder("100", ["3", "1", "2"]);
        expect(http.put.mock.calls).toEqual([
            ["/library/sections/1/all", null, { params: { type: 18, id: "100", collectionSort: 2 } }],
            ["/library/collections/100/items/3/move", null, { params: {} }],
            ["/library/collections/100/items/1/move", null, { params: { after: "3" } }],
            ["/library/collections/100/items/2/move", null, { params: { after: "1" } }],
        ]);
    });

    it("returns complete ordered membership", async () => {
        http.get.mockResolvedValue({
            data: {
                MediaContainer: {
                    size: 2, totalSize: 2, Metadata: [
                        { ratingKey: "2", title: "Second", type: "movie" },
                        { ratingKey: "1", title: "First", type: "movie" },
                    ]
                }
            }
        });
        expect((await client.getCollectionItems("100")).map((item) => item.ratingKey)).toEqual(["2", "1"]);
    });

    it.each([
        { size: 1, totalSize: 2, Metadata: [{ ratingKey: "1" }] },
        { size: 2, Metadata: [{ ratingKey: "1" }] },
        { size: 2, Metadata: [{ ratingKey: "1" }, { ratingKey: "1" }] },
        { size: 1, Metadata: [{ ratingKey: "bad" }] },
        {},
    ])("rejects incomplete or malformed membership: %j", async (MediaContainer) => {
        http.get.mockResolvedValue({ data: { MediaContainer } });
        await expect(client.getCollectionItems("100")).rejects.toThrow("incomplete or invalid");
    });

    it("accepts a verified empty collection", async () => {
        http.get.mockResolvedValue({ data: { MediaContainer: { size: 0 } } });
        expect(await client.getCollectionItems("100")).toEqual([]);
    });

    it("accounts for every Plex version and deduplicates shared part IDs", async () => {
        http.get.mockResolvedValue({ data: { MediaContainer: { size: 1, Metadata: [{ ratingKey: "1", Media: [
            { Part: [{ id: 11, size: 100 }, { id: 12, size: 200 }] },
            { Part: [{ id: 11, size: 100 }, { id: 13, size: 300 }] },
        ] }] } } });
        expect(await client.getItemStorage("1", "MOVIE")).toBe(600);
    });

    it("refuses partial or unmeasurable catalogue storage", async () => {
        http.get.mockResolvedValue({ data: { MediaContainer: { size: 1, totalSize: 2, Metadata: [{ ratingKey: "1", Media: [] }] } } });
        await expect(client.getItemStorage("1", "SHOW")).rejects.toThrow("media-part");
        http.get.mockResolvedValue({ data: { MediaContainer: { size: 1, Metadata: [{ ratingKey: "1", Media: [{ Part: [{ id: 1 }] }] }] } } });
        await expect(client.getItemStorage("1", "MOVIE")).rejects.toThrow("part size");
    });
});
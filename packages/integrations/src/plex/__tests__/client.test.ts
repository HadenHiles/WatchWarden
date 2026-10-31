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

    it("reads recommendation visibility from managed hubs without treating string zero as true", async () => {
        http.get.mockResolvedValueOnce({ data: { MediaContainer: { Hub: [{ identifier: "custom.collection.1.100",
            promotedToOwnHome: "1", promotedToSharedHome: true, promotedToRecommended: "0" }] } } });
        expect(await client.getCollectionRecommendation("1", "100")).toEqual({ promotedToOwnHome: true,
            promotedToSharedHome: true, promotedToRecommended: false });
    });

    it("can publish on Home independently of Library Recommended", async () => {
        http.get.mockResolvedValueOnce({ data: { MediaContainer: { Hub: [{ identifier: "custom.collection.1.100" }] } } });
        await client.setCollectionRecommendation({ sectionId: "1", collectionId: "100", publishToHome: true,
            publishToSharedHome: true, publishToLibrary: false });
        expect(http.put).toHaveBeenCalledWith("/hubs/sections/1/manage/custom.collection.1.100", null,
            { params: { promotedToRecommended: 0, promotedToOwnHome: 1, promotedToSharedHome: 1 } });
    });

    it("hides only the verified collection's inline card and verifies the mode", async () => {
        http.get.mockResolvedValueOnce({ data: { MediaContainer: { Metadata: [{ type: "collection", librarySectionID: 1,
            Preferences: { Setting: [{ id: "collectionMode", value: "-1" }] } }] } } })
            .mockResolvedValueOnce({ data: { MediaContainer: { Metadata: [{ type: "collection", librarySectionID: 1,
                Preferences: { Setting: [{ id: "collectionMode", value: "0" }] } }] } } });
        await client.setCollectionLibraryVisibility("1", "100", true);
        expect(http.get).toHaveBeenCalledWith("/library/metadata/100", { params: { includePreferences: 1 } });
        expect(http.put).toHaveBeenCalledWith("/library/collections/100/prefs", null,
            { params: { collectionMode: 0 } });
    });

    it("does not rewrite an already hidden collection and uses its authoritative preference", async () => {
        http.get.mockResolvedValueOnce({ data: { MediaContainer: { Metadata: [{ type: "collection", librarySectionID: 1,
            collectionMode: "2", Preferences: { Setting: [{ id: "collectionMode", value: "0" }] } }] } } });
        await client.setCollectionLibraryVisibility("1", "100", true);
        expect(http.put).not.toHaveBeenCalled();
    });

    it("rejects an unverified preference write rather than treating missing mode as zero", async () => {
        http.get.mockResolvedValue({ data: { MediaContainer: { Metadata: [{ type: "collection", librarySectionID: 1 }] } } });
        await expect(client.setCollectionLibraryVisibility("1", "100", true)).rejects.toThrow("visibility verification failed");
    });
});
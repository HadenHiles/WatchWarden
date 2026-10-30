import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JellyseerrClient } from "../client";

vi.mock("axios", () => ({ default: { create: vi.fn() }, AxiosError: class extends Error {} }));
vi.mock("@watchwarden/config", () => ({ createLogger: () => ({ info: vi.fn(), debug: vi.fn(), error: vi.fn() }) }));

describe("complete Jellyseerr request inventory", () => {
    const http = { get: vi.fn(), interceptors: { request: { use: vi.fn() } } };
    let client: JellyseerrClient;
    beforeEach(() => {
        vi.clearAllMocks();
        http.get.mockReset();
        vi.mocked(axios.create).mockReturnValue(http as unknown as ReturnType<typeof axios.create>);
        client = new JellyseerrClient({ baseUrl: "http://jellyseerr.test", apiKey: "test" });
    });

    it("paginates through every requester without filtering out humans", async () => {
        http.get.mockResolvedValueOnce({ data: { pageInfo: { results: 101 }, results: Array.from({ length: 100 }, (_, index) => ({ id: index + 1 })) } })
            .mockResolvedValueOnce({ data: { pageInfo: { results: 101 }, results: [{ id: 101 }] } });
        expect((await client.getAllRequests()).length).toBe(101);
        expect(http.get.mock.calls).toEqual([
            ["/request", { params: { take: 100, skip: 0, filter: "all", sort: "added" } }],
            ["/request", { params: { take: 100, skip: 100, filter: "all", sort: "added" } }],
        ]);
    });

    it("accepts a verified empty inventory", async () => {
        http.get.mockResolvedValue({ data: { pageInfo: { results: 0 }, results: [] } });
        expect(await client.getAllRequests()).toEqual([]);
    });

    it.each([
        { pageInfo: { results: 2 }, results: [] },
        { pageInfo: { results: 2 }, results: [{ id: 1 }, { id: 1 }] },
        { pageInfo: { results: 10001 }, results: [] },
        { results: [] },
    ])("refuses incomplete, overlapping or over-limit pages: %j", async (data) => {
        http.get.mockResolvedValue({ data });
        await expect(client.getAllRequests()).rejects.toThrow(/inventory/);
    });

    it("rejects an inventory whose total changes between pages", async () => {
        http.get.mockResolvedValueOnce({ data: { pageInfo: { results: 101 }, results: Array.from({ length: 100 }, (_, index) => ({ id: index + 1 })) } })
            .mockResolvedValueOnce({ data: { pageInfo: { results: 102 }, results: [{ id: 101 }, { id: 102 }] } });
        await expect(client.getAllRequests()).rejects.toThrow("Incomplete");
    });
});
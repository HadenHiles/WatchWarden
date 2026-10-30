import { beforeEach, describe, expect, it, vi } from "vitest";
import { JellyseerrService } from "../service";

const client = vi.hoisted(() => ({ getMovie: vi.fn(), getTv: vi.fn(), createRequest: vi.fn() }));
vi.mock("../client", () => ({ JellyseerrClient: vi.fn(() => client) }));
vi.mock("@watchwarden/config", () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

describe("Jellyseerr acquisition ownership", () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it("keeps an existing human request human-owned", async () => {
        client.getMovie.mockResolvedValue({
            id: 42, mediaInfo: {
                status: 3, requests: [
                    { id: 7, status: 2, requestedBy: { id: 2 } },
                ]
            }
        });
        const service = new JellyseerrService({ baseUrl: "http://jellyseerr.test", apiKey: "test" });
        const result = await service.requestMedia({ tmdbId: 42, mediaType: "movie", botUserId: 9 });
        expect(result).toMatchObject({ success: true, requestedByBot: false, request: { id: 7 } });
        expect(client.createRequest).not.toHaveBeenCalled();
    });

    it("only recognizes the configured positive bot identity", async () => {
        client.getMovie.mockResolvedValue({ id: 42, mediaInfo: { status: 3, requests: [
            { id: 7, status: 2, requestedBy: { id: 9 } },
        ] } });
        const service = new JellyseerrService({ baseUrl: "http://jellyseerr.test", apiKey: "test" });
        expect(await service.requestMedia({ tmdbId: 42, mediaType: "movie", botUserId: 9 })).toMatchObject({ requestedByBot: true });
        expect(await service.requestMedia({ tmdbId: 42, mediaType: "movie", botUserId: 0 })).toMatchObject({ requestedByBot: false });
    });

    it("prefers human ownership when bot and human requests coexist", async () => {
        client.getMovie.mockResolvedValue({ id: 42, mediaInfo: { status: 3, requests: [
            { id: 7, status: 2, requestedBy: { id: 9 } },
            { id: 8, status: 2, requestedBy: { id: 2 } },
        ] } });
        const service = new JellyseerrService({ baseUrl: "http://jellyseerr.test", apiKey: "test" });
        expect(await service.requestMedia({ tmdbId: 42, mediaType: "movie", botUserId: 9 }))
            .toMatchObject({ requestedByBot: false, request: { id: 8 } });
    });

    it("does not claim bot ownership when requester identity is absent", async () => {
        client.getMovie.mockResolvedValue({ id: 42, mediaInfo: { status: 3, requests: [{ id: 7, status: 2 }] } });
        const service = new JellyseerrService({ baseUrl: "http://jellyseerr.test", apiKey: "test" });
        expect(await service.requestMedia({ tmdbId: 42, mediaType: "movie", botUserId: 9 })).toMatchObject({ requestedByBot: false });
    });
});
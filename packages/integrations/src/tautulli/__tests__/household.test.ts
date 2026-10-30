import { describe, expect, it, vi } from "vitest";
import axios from "axios";
import { TautulliClient } from "../client";
import { aggregateHistoryToSignals } from "../transformers";
import type { TautulliHistoryRow } from "@watchwarden/types";

vi.mock("axios", () => ({ default: { create: vi.fn() }, AxiosError: class extends Error {} }));

describe("household playback is independent of acquisition requester", () => {
    it("aggregates viewers without filtering to the Jellyseerr bot account", () => {
        const row = { rating_key: "101", grandparent_rating_key: "10", grandparent_title: "Example", title: "Episode",
            media_type: "episode", user_id: 2, friendly_name: "Viewer", percent_complete: 90, watched_status: 1,
            duration: 1800, date: Math.floor(Date.now() / 1000) } as TautulliHistoryRow;
        const result = aggregateHistoryToSignals([row, { ...row, user_id: 3 }]);
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ plexRatingKey: "10", recentWatchCount: 2, uniqueViewerCount: 2, mediaType: "SHOW" });
    });

    it("sends credentials in a form POST, never in the request URL", async () => {
        const post = vi.fn().mockResolvedValue({ data: { response: { result: "success", data: {} } } });
        vi.mocked(axios.create).mockReturnValue({ post } as unknown as ReturnType<typeof axios.create>);
        expect(await new TautulliClient({ baseUrl: "http://tautulli.test", apiKey: "private-key" }).healthCheck()).toBe(true);
        const [path, body] = post.mock.calls[0];
        expect(path).toBe("/api/v2");
        expect(body.get("cmd")).toBe("get_server_info");
        expect(body.get("apikey")).toBe("private-key");
    });

    it("uses a calendar date for history filtering, not unsupported Unix seconds", async () => {
        const post = vi.fn().mockResolvedValue({ data: { response: { result: "success", data: { data: [] } } } });
        vi.mocked(axios.create).mockReturnValue({ post } as unknown as ReturnType<typeof axios.create>);
        await new TautulliClient({ baseUrl: "http://tautulli.test", apiKey: "private-key" }).getHistory({ daysAgo: 30 });
        expect(post.mock.calls[0][1].get("after")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});
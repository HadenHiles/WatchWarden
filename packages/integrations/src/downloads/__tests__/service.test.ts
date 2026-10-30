import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DownloadPriorityConfig, DownloadPriorityService } from "../service";

const inventory = vi.hoisted(() => ({ requests: vi.fn() }));
vi.mock("../../jellyseerr/client", () => ({ JellyseerrClient: vi.fn(() => ({ getAllRequests: inventory.requests })) }));
vi.mock("axios", () => ({ default: { create: vi.fn() } }));

const botHash = "a".repeat(40);
const userHash = "b".repeat(40);
const config: DownloadPriorityConfig = {
    jellyseerr: { baseUrl: "http://jelly.test", apiKey: "secret", botUserId: 9 },
    radarr: { baseUrl: "http://radarr.test", apiKey: "secret" },
    sonarr: { baseUrl: "http://sonarr.test", apiKey: "secret" },
    sabnzbd: { baseUrl: "http://sab.test", apiKey: "secret", downloadClientName: "SAB" },
    qbittorrent: { baseUrl: "http://torrent.test", username: "bot", password: "secret", downloadClientName: "qBit" },
};

describe("download demotion reconciliation", () => {
    let sab: Array<{ nzo_id: string; priority: string; status: string }>;
    let torrents: Array<{ hash: string; priority: number; progress: number; state: string; force_start: boolean }>;
    let incomplete: boolean;
    let retainWrites: boolean;
    let queueing: boolean;
    const writes = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        incomplete = false; retainWrites = true; queueing = true;
        sab = [
            { nzo_id: "SABnzbd_nzo_bot", priority: "Normal", status: "Queued" },
            { nzo_id: "SABnzbd_nzo_user", priority: "Normal", status: "Queued" },
        ];
        torrents = [
            { hash: botHash, priority: 1, progress: 0.1, state: "downloading", force_start: false },
            { hash: userHash, priority: 2, progress: 0.1, state: "queuedDL", force_start: false },
        ];
        inventory.requests.mockResolvedValue([
            { id: 1, status: 2, requestedBy: { id: 9 }, media: { mediaType: "movie", tmdbId: 42 } },
            { id: 2, status: 2, requestedBy: { id: 2 }, media: { mediaType: "movie", tmdbId: 88 } },
        ]);
        vi.mocked(axios.create).mockImplementation((options) => ({
            defaults: { headers: { common: {} } },
            get: vi.fn(async (path: string) => {
                if (path === "/api/v3/queue") {
                    const records = String(options?.baseURL).includes("radarr") ? [
                        { id: 1, downloadId: "SABnzbd_nzo_bot", protocol: "usenet", downloadClient: "SAB", movie: { tmdbId: 42 } },
                        { id: 2, downloadId: botHash, protocol: "torrent", downloadClient: "qBit", movie: { tmdbId: 42 } },
                        { id: 3, downloadId: userHash, protocol: "torrent", downloadClient: "qBit", movie: { tmdbId: 88 } },
                    ] : [];
                    return { data: { page: 1, totalRecords: records.length + (incomplete ? 1 : 0), records } };
                }
                if (path === "/api/v2/app/preferences") return { data: { queueing_enabled: queueing } };
                if (path === "/api/v2/torrents/info") return { data: structuredClone(torrents) };
                throw new Error(`Unexpected read ${path}`);
            }),
            post: vi.fn(async (path: string, body: URLSearchParams) => {
                if (path === "/api/v2/auth/login") return { status: 204, headers: { "set-cookie": ["SID_8080=test; Path=/"] } };
                if (path === "/api" && body.get("mode") === "queue" && !body.has("name")) return { data: { queue: { noofslots_total: sab.length, slots: structuredClone(sab) } } };
                writes(path, Object.fromEntries(body));
                if (retainWrites && path === "/api") sab.find((item) => item.nzo_id === body.get("value"))!.priority = "Low";
                if (retainWrites && path.endsWith("bottomPrio")) torrents.find((item) => item.hash === body.get("hashes"))!.priority = 3;
                return { data: { position: 2 } };
            }),
        } as unknown as ReturnType<typeof axios.create>));
    });

    it("observe mode makes no priority changes", async () => {
        expect(await new DownloadPriorityService(config).reconcile()).toMatchObject({ mode: "observe", sabDemotions: 1, torrentDemotions: 1, verified: false });
        expect(writes).not.toHaveBeenCalled();
    });

    it("apply mode only lowers confirmed WatchWarden jobs and verifies them", async () => {
        expect(await new DownloadPriorityService(config).reconcile(true)).toMatchObject({ mode: "apply", sabDemotions: 1, torrentDemotions: 1, verified: true });
        expect(writes.mock.calls).toEqual([
            ["/api", { mode: "queue", name: "priority", value: "SABnzbd_nzo_bot", value2: "-1", output: "json", apikey: "secret" }],
            ["/api/v2/torrents/bottomPrio", { hashes: botHash }],
        ]);
    });

    it("a human request arriving before execution prevents demotion", async () => {
        const requests = [{ id: 1, status: 2, requestedBy: { id: 9 }, media: { mediaType: "movie", tmdbId: 42 } }];
        inventory.requests.mockResolvedValueOnce(requests).mockResolvedValue([...requests,
            { id: 2, status: 2, requestedBy: { id: 2 }, media: { mediaType: "movie", tmdbId: 42 } }]);
        await expect(new DownloadPriorityService(config).reconcile(true)).rejects.toThrow("reconciliation failed");
        expect(writes).not.toHaveBeenCalled();
    });

    it("incomplete Arr evidence prevents all queue writes", async () => {
        incomplete = true;
        await expect(new DownloadPriorityService(config).reconcile(true)).rejects.toThrow("reconciliation failed");
        expect(writes).not.toHaveBeenCalled();
    });

    it("wrong download-client names prevent ownership claims", async () => {
        await new DownloadPriorityService({ ...config, sabnzbd: { ...config.sabnzbd!, downloadClientName: "Other SAB" },
            qbittorrent: { ...config.qbittorrent!, downloadClientName: "Other qBit" } }).reconcile(true);
        expect(writes).not.toHaveBeenCalled();
    });

    it("does not enable torrent queueing or change its settings", async () => {
        queueing = false;
        await new DownloadPriorityService(config).reconcile(true);
        expect(writes.mock.calls.every(([path]) => path === "/api")).toBe(true);
    });

    it("fails rather than reporting success when read-back does not retain demotion", async () => {
        retainWrites = false;
        await expect(new DownloadPriorityService(config).reconcile(true)).rejects.toThrow("reconciliation failed");
    });
});
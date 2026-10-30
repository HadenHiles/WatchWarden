import { describe, expect, it } from "vitest";
import { planWatchwardenDemotions, watchwardenDownloadIds } from "../priority";

const botHash = "a".repeat(40);
const userHash = "b".repeat(40);
const requests = [{ mediaKey: "movie:42", requesterId: 9, status: 2 }];

describe("WatchWarden-only priority demotion", () => {
    it("only selects verified bot downloads and never user or unknown work", () => {
        const owned = watchwardenDownloadIds(requests, [
            { mediaKey: "movie:42", downloadId: botHash, protocol: "torrent" },
            { mediaKey: "movie:88", downloadId: userHash, protocol: "torrent" },
            { mediaKey: "movie:42", downloadId: "SABnzbd_nzo_bot", protocol: "usenet" },
        ], 9);
        const result = planWatchwardenDemotions(owned, [
            { nzo_id: "SABnzbd_nzo_bot", priority: "Normal", status: "Queued" },
            { nzo_id: "SABnzbd_nzo_user", priority: "Normal", status: "Queued" },
        ], [
            { hash: botHash, priority: 1, progress: 0.1, state: "downloading", force_start: false },
            { hash: userHash, priority: 2, progress: 0, state: "queuedDL", force_start: false },
        ], true);
        expect(result).toEqual({ sabIds: ["SABnzbd_nzo_bot"], torrentHashes: [botHash], torrentQueueing: true });
    });

    it.each([2, 1])("a human request protects the whole title even at request status %s", (status) => {
        const owned = watchwardenDownloadIds([...requests, { mediaKey: "movie:42", requesterId: 2, status }], [
            { mediaKey: "movie:42", downloadId: botHash, protocol: "torrent" },
        ], 9);
        expect(owned.torrent.size).toBe(0);
    });

    it("does not demote shared downloads or unknown requester identities", () => {
        const downloads = [{ mediaKey: "movie:42", downloadId: botHash, protocol: "torrent" }];
        expect(watchwardenDownloadIds([...requests, { mediaKey: "movie:42", requesterId: null, status: 2 }], downloads, 9).torrent.size).toBe(0);
        expect(watchwardenDownloadIds(requests, [...downloads, { mediaKey: "movie:88", downloadId: botHash, protocol: "torrent" }], 9).torrent.size).toBe(0);
    });

    it("leaves already-low, paused, forced, completed and unidentified downloads alone", () => {
        const owned = { usenet: new Set(["low", "paused", "forced"]), torrent: new Set([botHash]) };
        for (const state of ["pausedDL", "stoppedDL", "forcedDL", "uploading", "unknown"]) {
            expect(planWatchwardenDemotions(owned, [], [
                { hash: botHash, priority: 1, progress: 0.1, state, force_start: false },
                { hash: userHash, priority: 2, progress: 0.1, state: "queuedDL", force_start: false },
            ], true).torrentHashes).toEqual([]);
        }
        expect(planWatchwardenDemotions(owned, [
            { nzo_id: "low", priority: "Low", status: "Queued" },
            { nzo_id: "paused", priority: "Normal", status: "Paused" },
            { nzo_id: "forced", priority: "Force", status: "Downloading" },
        ], [], true).sabIds).toEqual([]);
    });

    it("does not alter torrent settings or shuffle an already-correct queue", () => {
        const owned = { usenet: new Set<string>(), torrent: new Set([botHash]) };
        const torrents = [
            { hash: botHash, priority: 2, progress: 0.1, state: "queuedDL", force_start: false },
            { hash: userHash, priority: 1, progress: 0.1, state: "downloading", force_start: false },
        ];
        expect(planWatchwardenDemotions(owned, [], torrents, true).torrentHashes).toEqual([]);
        expect(planWatchwardenDemotions(owned, [], [...torrents].reverse(), false).torrentHashes).toEqual([]);
        expect(() => watchwardenDownloadIds([], [], 0)).toThrow("requester ID");
    });
});
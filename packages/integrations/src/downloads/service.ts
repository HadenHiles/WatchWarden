import axios, { AxiosInstance } from "axios";
import { JellyseerrClient } from "../jellyseerr/client";
import { ManagedDownload, PriorityRequest, SabPriorityItem, TorrentPriorityItem, planWatchwardenDemotions, watchwardenDownloadIds } from "./priority";

interface ApiConfig { baseUrl: string; apiKey: string }
export interface DownloadPriorityConfig {
    jellyseerr: ApiConfig & { botUserId: number };
    radarr: ApiConfig;
    sonarr: ApiConfig;
    sabnzbd?: ApiConfig & { downloadClientName: string };
    qbittorrent?: { baseUrl: string; username: string; password: string; downloadClientName: string };
}

function httpClient(baseUrl: string, headers = {}): AxiosInstance {
    const url = new URL(baseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Invalid priority service URL");
    return axios.create({ baseURL: baseUrl.replace(/\/$/, ""), headers, timeout: 10000,
        maxRedirects: 0, maxContentLength: 2097152, maxBodyLength: 65536 });
}

export class DownloadPriorityService {
    constructor(private readonly config: DownloadPriorityConfig) {}

    private async ownership() {
        const requests = await new JellyseerrClient(this.config.jellyseerr).getAllRequests();
        const identities: PriorityRequest[] = requests.map((request) => {
            const media = request.media;
            const externalId = media?.mediaType === "movie" ? media.tmdbId : media?.tvdbId;
            if (!Number.isSafeInteger(request.id) || ![1, 2, 3].includes(request.status)
                || !["movie", "tv"].includes(media?.mediaType) || !Number.isSafeInteger(externalId) || externalId! <= 0) {
                throw new Error("Invalid request identity for priority reconciliation");
            }
            return { mediaKey: `${media.mediaType}:${externalId}`, status: request.status,
                requesterId: Number.isSafeInteger(request.requestedBy?.id) && request.requestedBy.id > 0 ? request.requestedBy.id : null };
        });
        const downloads: ManagedDownload[] = [];
        for (const [kind, config] of [["movie", this.config.radarr], ["tv", this.config.sonarr]] as const) {
            const http = httpClient(config.baseUrl, { "X-Api-Key": config.apiKey });
            let total: number | undefined;
            const records: Array<{ id: number; downloadId?: string; protocol?: string; downloadClient?: string;
                movie?: { tmdbId?: number }; series?: { tvdbId?: number } }> = [];
            for (let page = 1; page <= 101; page++) {
                const response = await http.get("/api/v3/queue", { params: { page, pageSize: 100, includeMovie: true, includeSeries: true } });
                const data = response.data;
                if (!Number.isSafeInteger(data.totalRecords) || data.totalRecords < 0 || data.totalRecords > 10000
                    || data.page !== page || !Array.isArray(data.records) || data.records.length > 100
                    || (total !== undefined && total !== data.totalRecords)) throw new Error("Incomplete Arr queue inventory");
                total = data.totalRecords;
                records.push(...data.records);
                if (records.length === total) break;
                if (data.records.length === 0 || records.length > data.totalRecords) throw new Error("Incomplete Arr queue inventory");
            }
            if (records.length !== total || new Set(records.map((record) => record.id)).size !== total) throw new Error("Overlapping Arr queue inventory");
            for (const record of records) {
                if (!record.downloadId) continue;
                const externalId = kind === "movie" ? record.movie?.tmdbId : record.series?.tvdbId;
                const clientMatches = record.protocol === "usenet" ? record.downloadClient === this.config.sabnzbd?.downloadClientName
                    : record.protocol === "torrent" && record.downloadClient === this.config.qbittorrent?.downloadClientName;
                downloads.push({ downloadId: record.downloadId, protocol: record.protocol ?? "unknown",
                    mediaKey: clientMatches && Number.isSafeInteger(externalId) && externalId! > 0 ? `${kind}:${externalId}` : "unknown" });
            }
        }
        return watchwardenDownloadIds(identities, downloads, this.config.jellyseerr.botUserId);
    }

    async reconcile(apply = false) {
        try {
            const owned = await this.ownership();
            const sabConfig = this.config.sabnzbd;
            const sabHttp = sabConfig ? httpClient(sabConfig.baseUrl) : null;
            const readSab = async (): Promise<SabPriorityItem[]> => {
                if (!sabHttp || !sabConfig) return [];
                const response = await sabHttp.post("/api", new URLSearchParams({ mode: "queue", output: "json", apikey: sabConfig.apiKey, start: "0", limit: "1001" }));
                const queue = response.data?.queue;
                if (!Array.isArray(queue?.slots) || queue.slots.length > 1000 || queue.noofslots_total !== queue.slots.length
                    || queue.slots.some((item: SabPriorityItem) => typeof item.nzo_id !== "string")
                    || new Set(queue.slots.map((item: SabPriorityItem) => item.nzo_id)).size !== queue.slots.length) throw new Error("Incomplete SAB queue");
                return queue.slots.map((item: SabPriorityItem) => ({ ...item, priority: String(item.priority) }));
            };
            const torrentConfig = this.config.qbittorrent;
            const torrentHttp = torrentConfig ? httpClient(torrentConfig.baseUrl, { Referer: new URL(torrentConfig.baseUrl).origin }) : null;
            let torrentQueueing = false;
            if (torrentHttp && torrentConfig) {
                const login = await torrentHttp.post("/api/v2/auth/login", new URLSearchParams({ username: torrentConfig.username, password: torrentConfig.password }));
                const cookies = login.headers["set-cookie"] as string[] | undefined;
                const session = cookies?.map((cookie) => cookie.split(";", 1)[0]).filter((cookie) => /^SID(?:_\d+)?=/.test(cookie));
                if (![200, 204].includes(login.status) || !session?.length) throw new Error("Torrent authentication failed");
                torrentHttp.defaults.headers.common.Cookie = session.join("; ");
                torrentQueueing = (await torrentHttp.get("/api/v2/app/preferences")).data.queueing_enabled === true;
            }
            const readTorrents = async (): Promise<TorrentPriorityItem[]> => {
                if (!torrentHttp) return [];
                const response = await torrentHttp.get("/api/v2/torrents/info", { params: { limit: 1001 } });
                const items = response.data;
                if (!Array.isArray(items) || items.length > 1000 || items.some((item) => typeof item.hash !== "string")
                    || new Set(items.map((item) => item.hash.toLowerCase())).size !== items.length) throw new Error("Incomplete torrent inventory");
                return items;
            };
            const sab = await readSab();
            const torrents = await readTorrents();
            const plan = planWatchwardenDemotions(owned, sab, torrents, torrentQueueing);
            if (plan.sabIds.length + plan.torrentHashes.length > 100) throw new Error("Priority mutation limit exceeded");
            if (!apply) return { mode: "observe", sabDemotions: plan.sabIds.length, torrentDemotions: plan.torrentHashes.length, torrentQueueing, verified: false };
            const freshOwned = await this.ownership();
            const fresh = planWatchwardenDemotions(freshOwned, await readSab(), await readTorrents(), torrentQueueing);
            for (const id of plan.sabIds) {
                if (!fresh.sabIds.includes(id)) throw new Error("SAB priority target changed");
                const response = await sabHttp!.post("/api", new URLSearchParams({ mode: "queue", name: "priority", value: id, value2: "-1", output: "json", apikey: sabConfig!.apiKey }));
                if (!Number.isSafeInteger(response.data?.position) || response.data.position < 0) throw new Error("SAB priority write rejected");
            }
            for (const hash of plan.torrentHashes) {
                if (!fresh.torrentHashes.includes(hash)) throw new Error("Torrent priority target changed");
                await torrentHttp!.post("/api/v2/torrents/bottomPrio", new URLSearchParams({ hashes: hash }));
            }
            const verifiedSab = await readSab();
            if (plan.sabIds.some((id) => !verifiedSab.some((item) => item.nzo_id === id && ["Low", "-1"].includes(item.priority)))) throw new Error("SAB priority verification failed");
            const verifiedTorrents = await readTorrents();
            const remaining = planWatchwardenDemotions(freshOwned, [], verifiedTorrents, torrentQueueing).torrentHashes;
            if (plan.torrentHashes.some((hash) => remaining.includes(hash)
                || !verifiedTorrents.some((item) => item.hash.toLowerCase() === hash && item.priority > 0))) throw new Error("Torrent priority verification failed");
            return { mode: "apply", sabDemotions: plan.sabIds.length, torrentDemotions: plan.torrentHashes.length, torrentQueueing, verified: true };
        } catch {
            throw new Error("WatchWarden download priority reconciliation failed; inspect configuration and source completeness");
        }
    }
}
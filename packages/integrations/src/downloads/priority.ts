export interface PriorityRequest {
    mediaKey: string;
    requesterId: number | null;
    status: number;
}

export interface ManagedDownload {
    downloadId: string;
    mediaKey: string;
    protocol: string;
}

export interface SabPriorityItem {
    nzo_id: string;
    priority: string;
    status: string;
}

export interface TorrentPriorityItem {
    hash: string;
    priority: number;
    progress: number;
    state: string;
    force_start: boolean;
}

export function watchwardenDownloadIds(
    requests: PriorityRequest[], downloads: ManagedDownload[], botUserId: number,
): { usenet: Set<string>; torrent: Set<string> } {
    if (!Number.isSafeInteger(botUserId) || botUserId <= 0) throw new Error("Dedicated WatchWarden requester ID is required");
    const botKeys = new Set(requests.filter((request) => request.status === 2 && request.requesterId === botUserId).map((request) => request.mediaKey));
    const protectedKeys = new Set(requests.filter((request) => request.status !== 3 && request.requesterId !== botUserId).map((request) => request.mediaKey));
    const grouped = new Map<string, ManagedDownload[]>();
    for (const download of downloads) {
        const key = `${download.protocol}:${download.downloadId.toLowerCase()}`;
        grouped.set(key, [...(grouped.get(key) ?? []), download]);
    }
    const owned = { usenet: new Set<string>(), torrent: new Set<string>() };
    for (const records of grouped.values()) {
        if (records.some((record) => !botKeys.has(record.mediaKey) || protectedKeys.has(record.mediaKey))) continue;
        const first = records[0];
        if (first.protocol === "usenet" && /^SABnzbd_nzo_[A-Za-z0-9_-]+$/.test(first.downloadId)) owned.usenet.add(first.downloadId);
        if (first.protocol === "torrent" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(first.downloadId)) owned.torrent.add(first.downloadId.toLowerCase());
    }
    return owned;
}

export function planWatchwardenDemotions(
    owned: ReturnType<typeof watchwardenDownloadIds>, sab: SabPriorityItem[], torrents: TorrentPriorityItem[],
    torrentQueueing: boolean,
) {
    const sabIds = sab.filter((item) => owned.usenet.has(item.nzo_id)
        && ["Normal", "High", "0", "1"].includes(item.priority)
        && ["Queued", "Downloading", "Fetching", "Propagating"].includes(item.status))
        .map((item) => item.nzo_id);
    const eligible = torrents.filter((item) => item.progress < 1 && item.force_start === false && item.priority > 0
        && ["downloading", "queuedDL", "stalledDL", "metaDL"].includes(item.state));
    const others = eligible.filter((item) => !owned.torrent.has(item.hash.toLowerCase()));
    const lastOther = Math.max(0, ...others.map((item) => item.priority));
    const torrentHashes = torrentQueueing ? eligible.filter((item) => owned.torrent.has(item.hash.toLowerCase()) && item.priority < lastOther)
        .sort((first, second) => first.priority - second.priority).map((item) => item.hash.toLowerCase()) : [];
    return { sabIds, torrentHashes, torrentQueueing };
}
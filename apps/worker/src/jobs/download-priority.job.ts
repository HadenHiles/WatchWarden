import { getIntegrationConfig, prisma } from "@watchwarden/db";
import { createLogger, WorkerEnv } from "@watchwarden/config";
import { DownloadPriorityConfig, DownloadPriorityService } from "@watchwarden/integrations";

const logger = createLogger("download-priority-job");

export async function downloadPriorityJob(env: WorkerEnv): Promise<void> {
    if (!env.DOWNLOAD_PRIORITY_ENABLED) return;
    const { jellyseerr, radarr } = await getIntegrationConfig();
    if (!jellyseerr.baseUrl || !jellyseerr.apiKey || !jellyseerr.botUserId
        || !radarr.baseUrl || !radarr.apiKey || !env.SONARR_BASE_URL || !env.SONARR_API_KEY) {
        throw new Error("Download demotion requires a dedicated requester, Jellyseerr, Radarr and Sonarr");
    }
    const config: DownloadPriorityConfig = {
        jellyseerr: { baseUrl: jellyseerr.baseUrl, apiKey: jellyseerr.apiKey, botUserId: jellyseerr.botUserId },
        radarr: { baseUrl: radarr.baseUrl, apiKey: radarr.apiKey },
        sonarr: { baseUrl: env.SONARR_BASE_URL, apiKey: env.SONARR_API_KEY },
    };
    if (env.SABNZBD_BASE_URL) {
        if (!env.SABNZBD_API_KEY || !env.SABNZBD_DOWNLOAD_CLIENT_NAME) throw new Error("SAB demotion requires credentials and an exact Arr download-client name");
        config.sabnzbd = { baseUrl: env.SABNZBD_BASE_URL, apiKey: env.SABNZBD_API_KEY, downloadClientName: env.SABNZBD_DOWNLOAD_CLIENT_NAME };
    }
    if (env.QBITTORRENT_BASE_URL) {
        if (!env.QBITTORRENT_USERNAME || !env.QBITTORRENT_PASSWORD || !env.QBITTORRENT_DOWNLOAD_CLIENT_NAME) throw new Error("Torrent demotion requires credentials and an exact Arr download-client name");
        config.qbittorrent = { baseUrl: env.QBITTORRENT_BASE_URL, username: env.QBITTORRENT_USERNAME,
            password: env.QBITTORRENT_PASSWORD, downloadClientName: env.QBITTORRENT_DOWNLOAD_CLIENT_NAME };
    }
    if (!config.sabnzbd && !config.qbittorrent) throw new Error("No download client configured for WatchWarden demotion");
    const result = await new DownloadPriorityService(config).reconcile(env.DOWNLOAD_PRIORITY_MODE === "apply");
    await prisma.appSetting.upsert({
        where: { key: "downloadPriority.status" },
        update: { value: { ...result, checkedAt: new Date().toISOString() } },
        create: { key: "downloadPriority.status", category: "automation", value: { ...result, checkedAt: new Date().toISOString() } },
    });
    logger.info("WatchWarden-only download demotion evaluated", result);
}
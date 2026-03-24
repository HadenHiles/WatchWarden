import axios, { AxiosInstance, AxiosError } from "axios";
import { createLogger } from "@watchwarden/config";
import type {
    TautulliApiResponse,
    TautulliRecentItem,
    TautulliHistoryRow,
    TautulliPopularItem,
} from "@watchwarden/types";

const logger = createLogger("tautulli-client");

export interface TautulliClientConfig {
    baseUrl: string;
    apiKey: string;
    /** Request timeout in milliseconds (default: 10000) */
    timeout?: number;
}

export class TautulliClient {
    private readonly http: AxiosInstance;
    private readonly apiKey: string;

    constructor(config: TautulliClientConfig) {
        this.apiKey = config.apiKey;
        this.http = axios.create({
            baseURL: config.baseUrl.replace(/\/$/, ""),
            timeout: config.timeout ?? 10_000,
            headers: { "Content-Type": "application/json" },
        });
    }

    /** GET /api/v2 with a given cmd and params */
    private async call<T>(cmd: string, params: Record<string, unknown> = {}): Promise<T> {
        try {
            const response = await this.http.get<TautulliApiResponse<T>>("/api/v2", {
                params: { apikey: this.apiKey, cmd, ...params },
            });

            const body = response.data.response;
            if (body.result !== "success") {
                throw new Error(`Tautulli API error [${cmd}]: ${body.message ?? "unknown error"}`);
            }
            return body.data;
        } catch (err) {
            if (err instanceof AxiosError) {
                logger.error("Tautulli HTTP error", {
                    cmd,
                    status: err.response?.status,
                    message: err.message,
                });
            }
            throw err;
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            await this.call("get_server_info");
            return true;
        } catch {
            return false;
        }
    }

    /** Returns items added to the Plex library recently */
    async getRecentlyAdded(count = 50): Promise<TautulliRecentItem[]> {
        const data = await this.call<{ recently_added: TautulliRecentItem[] }>(
            "get_recently_added",
            { count }
        );
        return data.recently_added ?? [];
    }

    /**
     * Returns watch history rows.
     * Filters by media_type (movie | episode) and optionally a days lookback window.
     */
    async getHistory(options: { length?: number; daysAgo?: number } = {}): Promise<TautulliHistoryRow[]> {
        const params: Record<string, unknown> = {
            length: options.length ?? 200,
            order_column: "date",
            order_dir: "desc",
        };
        if (options.daysAgo) {
            const after = Math.floor(Date.now() / 1000) - options.daysAgo * 86400;
            params["after"] = after;
        }
        const data = await this.call<{ data: TautulliHistoryRow[] }>("get_history", params);
        return data.data ?? [];
    }

    /** Returns the most popular home media by total play count in the given time window */
    async getHomeStats(timeRange = 30): Promise<TautulliPopularItem[]> {
        const data = await this.call<TautulliPopularItem[]>("get_home_stats", {
            time_range: timeRange,
            stats_type: "duration",
        });
        return Array.isArray(data) ? data : [];
    }

    /** Returns per-user stats for a given rating_key */
    async getItemUserStats(ratingKey: string): Promise<{ user_id: number; total_plays: number }[]> {
        const data = await this.call<{ user_stats: { user_id: number; total_plays: number }[] }>(
            "get_item_user_stats",
            { rating_key: ratingKey }
        );
        return data.user_stats ?? [];
    }
}

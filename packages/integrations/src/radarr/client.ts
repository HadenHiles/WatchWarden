import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { createLogger } from "@watchwarden/config";
import type {
    RadarrHealthStatus,
    RadarrHistoryResponse,
    RadarrMovie,
    RadarrQualityProfile,
    RadarrQueueResponse,
    RadarrRootFolder,
} from "@watchwarden/types";

const logger = createLogger("radarr-client");

export interface RadarrClientConfig {
    baseUrl: string;
    apiKey: string;
    timeout?: number;
}

export class RadarrClient {
    private readonly http: AxiosInstance;

    constructor(config: RadarrClientConfig) {
        this.http = axios.create({
            baseURL: `${config.baseUrl.replace(/\/$/, "")}/api/v3`,
            timeout: config.timeout ?? 15_000,
            headers: {
                "Content-Type": "application/json",
                "X-Api-Key": config.apiKey,
            },
        });

        this.http.interceptors.request.use((req: InternalAxiosRequestConfig) => {
            logger.debug("Radarr request", { method: req.method?.toUpperCase(), url: req.url });
            return req;
        });
    }

    private handleError(context: string, err: unknown): never {
        if (err instanceof AxiosError) {
            const status = err.response?.status;
            const data = err.response?.data as { message?: string } | string | undefined;
            const message = typeof data === "object" ? data?.message : undefined;
            logger.error(`Radarr error [${context}]`, { status, message: message ?? err.message });
            throw new Error(`Radarr ${context} failed (HTTP ${status ?? "N/A"}): ${message ?? err.message}`);
        }
        throw err;
    }

    async healthCheck(): Promise<RadarrHealthStatus> {
        try {
            const res = await this.http.get<{ version: string }>("/system/status");
            return { healthy: true, version: res.data.version };
        } catch (err) {
            if (err instanceof AxiosError) return { healthy: false, error: err.message };
            return { healthy: false, error: String(err) };
        }
    }

    async getMovies(): Promise<RadarrMovie[]> {
        try {
            const res = await this.http.get<RadarrMovie[]>("/movie");
            return res.data ?? [];
        } catch (err) {
            this.handleError("getMovies", err);
        }
    }

    async getMovieByTmdbId(tmdbId: number): Promise<RadarrMovie | null> {
        try {
            const res = await this.http.get<RadarrMovie[]>("/movie", { params: { tmdbId } });
            return res.data?.[0] ?? null;
        } catch (err) {
            this.handleError(`getMovieByTmdbId(${tmdbId})`, err);
        }
    }

    async getQueue(page = 1, pageSize = 100): Promise<RadarrQueueResponse> {
        try {
            const res = await this.http.get<RadarrQueueResponse>("/queue", {
                params: { page, pageSize, includeMovie: true },
            });
            return res.data;
        } catch (err) {
            this.handleError("getQueue", err);
        }
    }

    async getMovieHistory(movieId: number, page = 1, pageSize = 20): Promise<RadarrHistoryResponse> {
        try {
            const res = await this.http.get<RadarrHistoryResponse>("/history/movie", {
                params: { movieId, page, pageSize, sortKey: "date", sortDirection: "descending" },
            });
            return res.data;
        } catch (err) {
            this.handleError(`getMovieHistory(${movieId})`, err);
        }
    }

    async getQualityProfiles(): Promise<RadarrQualityProfile[]> {
        try {
            const res = await this.http.get<RadarrQualityProfile[]>("/qualityprofile");
            return res.data ?? [];
        } catch (err) {
            this.handleError("getQualityProfiles", err);
        }
    }

    async getRootFolders(): Promise<RadarrRootFolder[]> {
        try {
            const res = await this.http.get<RadarrRootFolder[]>("/rootfolder");
            return res.data ?? [];
        } catch (err) {
            this.handleError("getRootFolders", err);
        }
    }
}
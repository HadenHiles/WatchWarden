import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from "axios";
import { createLogger } from "@watchwarden/config";
import type {
    JellyseerrSearchResult,
    JellyseerrRequest,
    JellyseerrRequestPayload,
    JellyseerrHealthStatus,
    JellyseerrDiscoverSlider,
    JellyseerrDiscoverSliderPayload,
} from "@watchwarden/types";

const logger = createLogger("jellyseerr-client");

export interface JellyseerrClientConfig {
    baseUrl: string;
    apiKey: string;
    /** Timeout in milliseconds (default: 15000) */
    timeout?: number;
}

export class JellyseerrClient {
    private readonly http: AxiosInstance;

    constructor(config: JellyseerrClientConfig) {
        this.http = axios.create({
            baseURL: `${config.baseUrl.replace(/\/$/, "")}/api/v1`,
            timeout: config.timeout ?? 15_000,
            headers: {
                "Content-Type": "application/json",
                "X-Api-Key": config.apiKey,
            },
        });

        // Log outgoing requests in debug mode
        this.http.interceptors.request.use((req: InternalAxiosRequestConfig) => {
            logger.debug("Jellyseerr request", { method: req.method?.toUpperCase(), url: req.url });
            return req;
        });
    }

    private handleError(context: string, err: unknown): never {
        if (err instanceof AxiosError) {
            const status = err.response?.status;
            const data = err.response?.data as { message?: string } | undefined;
            logger.error(`Jellyseerr error [${context}]`, { status, message: data?.message ?? err.message });
            throw new Error(
                `Jellyseerr ${context} failed (HTTP ${status ?? "N/A"}): ${data?.message ?? err.message}`
            );
        }
        throw err;
    }

    async healthCheck(): Promise<JellyseerrHealthStatus> {
        try {
            const res = await this.http.get<{ version: string }>("/settings/main");
            return { healthy: true, version: res.data.version };
        } catch (err) {
            if (err instanceof AxiosError) {
                return { healthy: false, error: err.message };
            }
            return { healthy: false, error: String(err) };
        }
    }

    /** Search Jellyseerr for a title by query string */
    async search(query: string, page = 1): Promise<JellyseerrSearchResult[]> {
        try {
            const res = await this.http.get<{ results: JellyseerrSearchResult[] }>("/search", {
                params: { query, page, language: "en" },
            });
            return res.data.results ?? [];
        } catch (err) {
            this.handleError("search", err);
        }
    }

    /** Look up a specific movie by TMDB ID */
    async getMovie(tmdbId: number): Promise<JellyseerrSearchResult> {
        try {
            const res = await this.http.get<JellyseerrSearchResult>(`/movie/${tmdbId}`);
            return res.data;
        } catch (err) {
            this.handleError(`getMovie(${tmdbId})`, err);
        }
    }

    /** Look up a specific TV show by TMDB ID */
    async getTv(tmdbId: number): Promise<JellyseerrSearchResult> {
        try {
            const res = await this.http.get<JellyseerrSearchResult>(`/tv/${tmdbId}`);
            return res.data;
        } catch (err) {
            this.handleError(`getTv(${tmdbId})`, err);
        }
    }

    /** Submit a media request via the automation bot user */
    async createRequest(payload: JellyseerrRequestPayload): Promise<JellyseerrRequest> {
        try {
            const res = await this.http.post<JellyseerrRequest>("/request", payload);
            logger.info("Jellyseerr request submitted", {
                mediaType: payload.mediaType,
                mediaId: payload.mediaId,
                requestId: res.data.id,
            });
            return res.data;
        } catch (err) {
            this.handleError("createRequest", err);
        }
    }

    /** Get the current status of a request by ID */
    async getRequest(requestId: number): Promise<JellyseerrRequest> {
        try {
            const res = await this.http.get<JellyseerrRequest>(`/request/${requestId}`);
            return res.data;
        } catch (err) {
            this.handleError(`getRequest(${requestId})`, err);
        }
    }

    /** Delete / retract a request */
    async deleteRequest(requestId: number): Promise<void> {
        try {
            await this.http.delete(`/request/${requestId}`);
        } catch (err) {
            this.handleError(`deleteRequest(${requestId})`, err);
        }
    }

    /** Delete the physical file through the configured Radarr/Sonarr service. */
    async deleteMediaFile(mediaId: number): Promise<void> {
        try {
            await this.http.delete(`/media/${mediaId}/file`, { params: { is4k: false } });
        } catch (err) {
            this.handleError(`deleteMediaFile(${mediaId})`, err);
        }
    }

    /** Remove the media record from Jellyseerr after its file is deleted. */
    async deleteMediaRecord(mediaId: number): Promise<void> {
        try {
            await this.http.delete(`/media/${mediaId}`);
        } catch (err) {
            this.handleError(`deleteMediaRecord(${mediaId})`, err);
        }
    }

    /** Fetch all pending requests (paginated) */
    async getPendingRequests(
        take = 20,
        skip = 0
    ): Promise<{ results: JellyseerrRequest[]; pageInfo: { pages: number; page: number } }> {
        try {
            const res = await this.http.get<{
                results: JellyseerrRequest[];
                pageInfo: { pages: number; page: number };
            }>("/request", { params: { take, skip, filter: "pending" } });
            return res.data;
        } catch (err) {
            this.handleError("getPendingRequests", err);
        }
    }

    // ── Discover slider management ────────────────────────────────────────────
    // These endpoints manage the Discover tab sliders in Jellyseerr.
    // WatchWarden creates per-platform sliders so users see curated trending
    // content and can request it directly from the Jellyseerr interface.

    /** Fetch all configured discover sliders */
    async getDiscoverSliders(): Promise<JellyseerrDiscoverSlider[]> {
        try {
            const res = await this.http.get<JellyseerrDiscoverSlider[]>("/settings/discover");
            return res.data ?? [];
        } catch (err) {
            this.handleError("getDiscoverSliders", err);
        }
    }

    /** Jellyseerr saves the complete ordered Discover layout in one request. */
    async saveDiscoverSliders(
        sliders: Array<JellyseerrDiscoverSlider | JellyseerrDiscoverSliderPayload>,
    ): Promise<JellyseerrDiscoverSlider[]> {
        try {
            const res = await this.http.post<JellyseerrDiscoverSlider[]>("/settings/discover", sliders);
            return res.data ?? [];
        } catch (err) {
            this.handleError("saveDiscoverSliders", err);
        }
    }

    /** Create a new discover slider */
    async createDiscoverSlider(payload: JellyseerrDiscoverSliderPayload): Promise<JellyseerrDiscoverSlider> {
        try {
            const res = await this.http.post<JellyseerrDiscoverSlider>("/settings/discover", payload);
            logger.info("Jellyseerr discover slider created", { title: payload.title, type: payload.type });
            return res.data;
        } catch (err) {
            this.handleError("createDiscoverSlider", err);
        }
    }

    /** Update an existing discover slider by its Jellyseerr ID */
    async updateDiscoverSlider(
        sliderId: number,
        payload: JellyseerrDiscoverSliderPayload,
    ): Promise<JellyseerrDiscoverSlider> {
        try {
            const res = await this.http.put<JellyseerrDiscoverSlider>(`/settings/discover/${sliderId}`, payload);
            logger.debug("Jellyseerr discover slider updated", { sliderId, title: payload.title });
            return res.data;
        } catch (err) {
            this.handleError(`updateDiscoverSlider(${sliderId})`, err);
        }
    }

    /** Delete a discover slider */
    async deleteDiscoverSlider(sliderId: number): Promise<void> {
        try {
            await this.http.delete(`/settings/discover/${sliderId}`);
            logger.info("Jellyseerr discover slider deleted", { sliderId });
        } catch (err) {
            this.handleError(`deleteDiscoverSlider(${sliderId})`, err);
        }
    }
}

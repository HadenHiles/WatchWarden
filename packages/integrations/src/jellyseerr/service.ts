import { createLogger } from "@watchwarden/config";
import {
    JellyseerrClient,
    type JellyseerrClientConfig,
} from "./client";
import type {
    JellyseerrRequest,
    JellyseerrHealthStatus,
    JellyseerrDiscoverSlider,
} from "@watchwarden/types";
import { JellyseerrDiscoverSliderType as SliderType } from "@watchwarden/types";

const logger = createLogger("jellyseerr-service");

export interface RequestMediaInput {
    tmdbId: number;
    tvdbId?: number;
    mediaType: "movie" | "tv";
    /** Jellyseerr numeric user ID of the bot account */
    botUserId: number;
    rootFolder?: string;
    qualityProfileId?: number;
    /** For TV, optionally specify seasons. Defaults to all seasons. */
    seasons?: number[];
}

export interface RequestMediaResult {
    success: boolean;
    request?: JellyseerrRequest;
    error?: string;
}

/**
 * High-level service layer over JellyseerrClient.
 * All Jellyseerr interactions in the app should go through this service —
 * never call the raw client directly from routes or jobs.
 */
export class JellyseerrService {
    private readonly client: JellyseerrClient;

    constructor(config: JellyseerrClientConfig) {
        this.client = new JellyseerrClient(config);
    }

    async healthCheck(): Promise<JellyseerrHealthStatus> {
        return this.client.healthCheck();
    }

    /**
     * Finds the Jellyseerr media ID for a TMDB ID.
     * Returns null if not found in Jellyseerr.
     */
    async resolveJellyseerrId(
        tmdbId: number,
        mediaType: "movie" | "tv"
    ): Promise<number | null> {
        try {
            const media =
                mediaType === "movie"
                    ? await this.client.getMovie(tmdbId)
                    : await this.client.getTv(tmdbId);
            return media?.id ?? null;
        } catch {
            logger.warn("Could not resolve Jellyseerr ID", { tmdbId, mediaType });
            return null;
        }
    }

    /**
     * Submits a media request through the automation bot account.
     * Returns the created request or an error description.
     */
    async requestMedia(input: RequestMediaInput): Promise<RequestMediaResult> {
        try {
            // Fetch the media record from Jellyseerr — gives us the ID and current availability status.
            const media =
                input.mediaType === "movie"
                    ? await this.client.getMovie(input.tmdbId)
                    : await this.client.getTv(input.tmdbId);

            if (!media?.id) {
                return {
                    success: false,
                    error: `Could not find ${input.mediaType} TMDB ${input.tmdbId} in Jellyseerr`,
                };
            }

            // Jellyseerr mediaInfo.status codes:
            // 1 = Unknown, 2 = Pending, 3 = Processing, 4 = PartiallyAvailable, 5 = Available
            const mediaStatus = media.mediaInfo?.status ?? 1;
            if (mediaStatus >= 4) {
                logger.info("Media already available in Jellyseerr — skipping request", {
                    tmdbId: input.tmdbId,
                    mediaStatus,
                });
                return { success: true };
            }

            // If Jellyseerr already has a non-declined request, don't create a duplicate.
            // Jellyseerr request status: 1 = Pending, 2 = Approved, 3 = Declined
            const existingRequests = media.mediaInfo?.requests ?? [];
            const activeRequest = existingRequests.find((r) => r.status !== 3);
            if (activeRequest) {
                logger.info("Active request already exists in Jellyseerr — skipping duplicate", {
                    tmdbId: input.tmdbId,
                    requestId: activeRequest.id,
                });
                return { success: true, request: activeRequest };
            }

            const seasons = input.mediaType === "tv"
                ? (input.seasons ?? media.seasons?.map((season) => season.seasonNumber).filter((season) => season > 0) ?? [])
                : undefined;
            if (input.mediaType === "tv" && (!seasons || seasons.length === 0)) {
                return { success: false, error: `No requestable seasons found for TV TMDB ${input.tmdbId}` };
            }
            const request = await this.client.createRequest({
                mediaType: input.mediaType,
                mediaId: media.id,
                tvdbId: input.tvdbId,
                userId: input.botUserId,
                seasons,
                rootFolder: input.rootFolder,
                qualityProfileId: input.qualityProfileId,
            });

            return { success: true, request };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error("Failed to request media via Jellyseerr", { input, error: message });
            return { success: false, error: message };
        }
    }

    /** Syncs the status of a previously submitted request */
    async syncRequestStatus(requestId: number): Promise<JellyseerrRequest | null> {
        try {
            return await this.client.getRequest(requestId);
        } catch (err) {
            logger.warn("Failed to sync request status", { requestId, error: String(err) });
            return null;
        }
    }

    /** Retracts a previously submitted request. */
    async deleteRequest(requestId: number): Promise<void> {
        await this.client.deleteRequest(requestId);
    }

    /** Delete a title's file via Radarr/Sonarr, then remove its Jellyseerr record. */
    async deleteMedia(tmdbId: number, mediaType: "movie" | "tv"): Promise<number> {
        const media = mediaType === "movie"
            ? await this.client.getMovie(tmdbId)
            : await this.client.getTv(tmdbId);
        const mediaId = media.mediaInfo?.id;
        if (!mediaId) throw new Error(`No Jellyseerr media record found for TMDB ${tmdbId}`);
        await this.client.deleteMediaFile(mediaId);
        await this.client.deleteMediaRecord(mediaId);
        return mediaId;
    }

    /**
     * Creates or updates a WatchWarden discover slider in Jellyseerr for a streaming platform.
     * Returns the Jellyseerr slider ID so it can be persisted in the DB.
     *
     * Jellyseerr slider types 13/14 (TMDB_MOVIE_STREAMING / TMDB_TV_STREAMING) accept
     * a TMDB watch provider ID as `data`.  If Jellyseerr doesn't support those types,
     * the error is caught and null is returned so the job can skip gracefully.
     */
    async upsertDiscoverSlider(input: {
        existingSliderId?: number | null;
        name: string;
        mediaType: "MOVIE" | "SHOW";
        tmdbProviderId: number;
    }): Promise<JellyseerrDiscoverSlider | null> {
        const sliderType = input.mediaType === "MOVIE"
            ? SliderType.TMDB_MOVIE_STREAMING
            : SliderType.TMDB_TV_STREAMING;

        const payload = {
            type: sliderType,
            title: input.name,
            data: String(input.tmdbProviderId),
            enabled: true,
        };

        try {
            if (input.existingSliderId) {
                return await this.client.updateDiscoverSlider(input.existingSliderId, payload);
            }
            return await this.client.createDiscoverSlider(payload);
        } catch (err) {
            logger.warn("Failed to upsert Jellyseerr discover slider", {
                name: input.name,
                error: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
    }

    /** Fetch all existing discover sliders from Jellyseerr */
    async getDiscoverSliders(): Promise<JellyseerrDiscoverSlider[]> {
        return this.client.getDiscoverSliders();
    }

    /** Merge managed sliders into Jellyseerr while preserving built-ins and user sliders. */
    async syncDiscoverSliders(
        managed: Array<{ title: string; mediaType: "MOVIE" | "SHOW"; tmdbProviderId: number }>,
    ): Promise<JellyseerrDiscoverSlider[]> {
        const existing = await this.client.getDiscoverSliders();
        const managedTitles = new Set(managed.map((slider) => slider.title));
        const preserved = existing.filter((slider) => !managedTitles.has(slider.title ?? ""));
        const desired = managed.map((slider) => {
            const previous = existing.find((candidate) => candidate.title === slider.title);
            return {
                ...(previous?.id ? { id: previous.id } : {}),
                type: slider.mediaType === "MOVIE"
                    ? SliderType.TMDB_MOVIE_STREAMING
                    : SliderType.TMDB_TV_STREAMING,
                title: slider.title,
                data: String(slider.tmdbProviderId),
                enabled: true,
            };
        });
        await this.client.saveDiscoverSliders([...preserved, ...desired]);
        // The save response echoes the submitted payload and may omit generated IDs.
        return this.client.getDiscoverSliders();
    }

    /** Remove a discover slider from Jellyseerr by its ID */
    async removeDiscoverSlider(sliderId: number): Promise<void> {
        return this.client.deleteDiscoverSlider(sliderId);
    }
}

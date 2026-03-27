import { createLogger } from "@watchwarden/config";
import {
    JellyseerrClient,
    type JellyseerrClientConfig,
} from "./client";
import type { JellyseerrRequest, JellyseerrHealthStatus } from "@watchwarden/types";

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

            const request = await this.client.createRequest({
                mediaType: input.mediaType,
                mediaId: media.id,
                tvdbId: input.tvdbId,
                userId: input.botUserId,
                seasons: input.seasons,
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
}

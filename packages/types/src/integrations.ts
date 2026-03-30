// ─── Tautulli types ───────────────────────────────────────────────────────────

export interface TautulliRecentItem {
    rating_key: string;
    title: string;
    year: number;
    media_type: "movie" | "show" | "episode";
    thumb: string;
    parent_rating_key?: string;
    grandparent_rating_key?: string;
    grandparent_title?: string;
    guids?: string[];
}

export interface TautulliHistoryRow {
    rating_key: string;
    parent_rating_key?: string;
    grandparent_rating_key?: string;
    grandparent_title?: string;
    title: string;
    year?: number;
    media_type: "movie" | "episode";
    user_id: number;
    friendly_name: string;
    watched_status: 0 | 1;
    duration: number;
    percent_complete: number;
    date: number;
    guids?: string[];
}

export interface TautulliPopularItem {
    rating_key: string;
    title: string;
    year?: number;
    media_type: "movie" | "show";
    users_watched: number;
    total_plays: number;
    guids?: string[];
}

export interface TautulliApiResponse<T> {
    response: {
        result: "success" | "error";
        message: string | null;
        data: T;
    };
}

// ─── Normalized local watch signal (output of Tautulli transformations) ───────

export interface NormalizedWatchSignal {
    tmdbId: number | null;
    tvdbId: number | null;
    imdbId: string | null;
    title: string;
    year: number | null;
    mediaType: "MOVIE" | "SHOW";

    recentWatchCount: number;
    uniqueViewerCount: number;
    completionRate: number;
    watchSaturation: number;
    lastWatchedAt: Date | null;
    recencyScore: number;
    localInterestScore: number;
    multiUserBoost: number;
    completionPenalty: number;
}

// ─── Jellyseerr types ─────────────────────────────────────────────────────────

export interface JellyseerrSearchResult {
    id: number;
    title?: string;
    name?: string;
    mediaType: "movie" | "tv";
    releaseDate?: string;
    firstAirDate?: string;
    overview?: string;
    posterPath?: string;
    mediaInfo?: {
        id: number;
        status: number;
        requests?: JellyseerrRequest[];
    };
}

export interface JellyseerrRequest {
    id: number;
    status: number;
    media: {
        id: number;
        mediaType: "movie" | "tv";
        tmdbId: number;
        tvdbId?: number;
        status: number;
        status4k: number;
    };
    requestedBy: {
        id: number;
        username: string;
    };
    createdAt: string;
    updatedAt: string;
    rootFolder?: string;
    qualityProfileId?: number;
}

export interface JellyseerrRequestPayload {
    mediaType: "movie" | "tv";
    mediaId: number;
    tvdbId?: number;
    userId?: number;
    seasons?: number[];
    is4k?: boolean;
    rootFolder?: string;
    qualityProfileId?: number;
}

export interface JellyseerrHealthStatus {
    healthy: boolean;
    version?: string;
    error?: string;
}

// ─── Source adapter canonical output ─────────────────────────────────────────

export interface SourceTrendItem {
    tmdbId: number | null;
    imdbId: string | null;
    tvdbId: number | null;
    title: string;
    originalTitle: string | null;
    mediaType: "MOVIE" | "SHOW";
    year: number | null;
    overview: string | null;
    posterPath: string | null;
    backdropPath: string | null;
    genres: string[];

    source: string;
    region: string | null;
    rank: number | null;
    trendScore: number;
    /** TMDB provider_id (string) — only populated by TmdbProviderDiscoveryAdapter */
    providerId?: string | null;
    /** Rank within the specific streaming platform — only populated by TmdbProviderDiscoveryAdapter */
    providerRank?: number | null;
    rawMetadata: Record<string, unknown>;
}

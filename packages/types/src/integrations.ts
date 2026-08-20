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
    plexRatingKey: string | null;
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
    seasons?: Array<{ seasonNumber: number; episodeCount?: number; airDate?: string | null }>;
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

// ─── Radarr types ────────────────────────────────────────────────────────────

export interface RadarrQuality {
    quality?: {
        id?: number;
        name?: string;
        source?: string;
        resolution?: number;
    };
    revision?: {
        version?: number;
        real?: number;
        isRepack?: boolean;
    };
}

export interface RadarrMovieFile {
    id: number;
    movieId: number;
    relativePath?: string;
    path?: string;
    quality?: RadarrQuality;
}

export interface RadarrMovie {
    id: number;
    tmdbId: number;
    imdbId?: string;
    title: string;
    year?: number;
    monitored: boolean;
    hasFile: boolean;
    isAvailable?: boolean;
    inCinemas?: string;
    digitalRelease?: string;
    physicalRelease?: string;
    minimumAvailability?: string;
    qualityProfileId: number;
    rootFolderPath: string;
    movieFile?: RadarrMovieFile;
}

export interface RadarrQueueRecord {
    id: number;
    movieId?: number;
    movie?: RadarrMovie;
    title?: string;
    status?: string;
    trackedDownloadStatus?: string;
    quality?: RadarrQuality;
    outputPath?: string;
}

export interface RadarrQueueResponse {
    page: number;
    pageSize: number;
    totalRecords: number;
    records: RadarrQueueRecord[];
}

export interface RadarrHistoryRecord {
    id: number;
    movieId: number;
    sourceTitle?: string;
    eventType?: string;
    date?: string;
    quality?: RadarrQuality;
}

export interface RadarrHistoryResponse {
    page: number;
    pageSize: number;
    totalRecords: number;
    records: RadarrHistoryRecord[];
}

export interface RadarrQualityProfile {
    id: number;
    name: string;
}

export interface RadarrRootFolder {
    id: number;
    path: string;
    freeSpace?: number;
}

export interface RadarrHealthStatus {
    healthy: boolean;
    version?: string;
    error?: string;
}

// Discover slider types supported by Jellyseerr.
// See https://github.com/Fallenbagel/jellyseerr for the full enum.
export enum JellyseerrDiscoverSliderType {
    RECENTLY_ADDED = 1,
    RECENT_REQUESTS = 2,
    PLEX_RECENTLY_ADDED_MOVIES = 3,
    PLEX_RECENTLY_ADDED_SHOWS = 4,
    TMDB_MOVIE_GENRE = 5,
    TMDB_MOVIE_STUDIO = 6,
    TMDB_MOVIE_KEYWORD = 7,
    TMDB_TV_GENRE = 8,
    TMDB_TV_NETWORK = 9,
    TMDB_TV_KEYWORD = 10,
    TMDB_TRENDING = 11,
    TMDB_POPULAR = 12,
    // Provider-based streaming — data = TMDB watch provider ID (numeric string)
    TMDB_MOVIE_STREAMING = 13,
    TMDB_TV_STREAMING = 14,
}

export interface JellyseerrDiscoverSlider {
    id: number;
    type: number;
    title?: string;
    data?: string;
    enabled: boolean;
    isBuiltIn: boolean;
    order: number;
}

export interface JellyseerrDiscoverSliderPayload {
    type: number;
    title?: string;
    data?: string;
    enabled?: boolean;
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
    releaseDate?: string | null;
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

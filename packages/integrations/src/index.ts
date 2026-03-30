// Tautulli
export { TautulliClient } from "./tautulli/client";
export type { TautulliClientConfig } from "./tautulli/client";
export {
    transformHistoryToSignal,
    aggregateHistoryToSignals,
    parseGuids,
    calcRecencyScore,
} from "./tautulli/transformers";

// Jellyseerr
export { JellyseerrClient } from "./jellyseerr/client";
export type { JellyseerrClientConfig } from "./jellyseerr/client";
export { JellyseerrService } from "./jellyseerr/service";
export type { RequestMediaInput, RequestMediaResult } from "./jellyseerr/service";

// Plex
export { PlexClient } from "./plex/client";
export type { PlexClientConfig, PlexSection, PlexMediaItem, PlexCollection, PlexIdentity } from "./plex/client";
export { PlexService } from "./plex/service";
export type { CollectionSyncResult } from "./plex/service";

// Source adapters
export type { SourceAdapter } from "./sources/adapter";
export { TmdbTrendingAdapter } from "./sources/tmdb.adapter";
export { TraktTrendingAdapter } from "./sources/trakt.adapter";
export { TmdbProviderDiscoveryAdapter, PROVIDER_TMDB_ID_MAP } from "./sources/tmdb-provider.adapter";
export { buildSourceAdapters } from "./sources/registry";

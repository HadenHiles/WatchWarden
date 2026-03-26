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

// Source adapters
export type { SourceAdapter } from "./sources/adapter";
export { TmdbTrendingAdapter } from "./sources/tmdb.adapter";
export { TraktTrendingAdapter } from "./sources/trakt.adapter";
export { buildSourceAdapters } from "./sources/registry";

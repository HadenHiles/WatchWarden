import { createLogger } from "@watchwarden/config";
import type { SourceAdapter } from "./adapter";
import { TmdbTrendingAdapter } from "./tmdb.adapter";
import { TraktTrendingAdapter } from "./trakt.adapter";

const logger = createLogger("source-registry");

/**
 * Builds the list of enabled source adapters from environment variables.
 * Called once during worker startup.
 */
export function buildSourceAdapters(env: {
    TMDB_API_KEY?: string;
    TRAKT_CLIENT_ID?: string;
}): SourceAdapter[] {
    const adapters: SourceAdapter[] = [];

    if (env.TMDB_API_KEY) {
        adapters.push(new TmdbTrendingAdapter({ mediaType: "movie", apiKey: env.TMDB_API_KEY }));
        adapters.push(new TmdbTrendingAdapter({ mediaType: "tv", apiKey: env.TMDB_API_KEY }));
        logger.info("TMDB adapters registered");
    } else {
        logger.warn("TMDB_API_KEY not set — TMDB adapters disabled");
    }

    if (env.TRAKT_CLIENT_ID) {
        adapters.push(new TraktTrendingAdapter({ mediaType: "movie", clientId: env.TRAKT_CLIENT_ID }));
        adapters.push(new TraktTrendingAdapter({ mediaType: "show", clientId: env.TRAKT_CLIENT_ID }));
        logger.info("Trakt adapters registered");
    }

    return adapters;
}

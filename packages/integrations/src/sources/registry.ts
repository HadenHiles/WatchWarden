import { createLogger } from "@watchwarden/config";
import type { SourceAdapter } from "./adapter";
import { TmdbTrendingAdapter } from "./tmdb.adapter";
import { TraktTrendingAdapter } from "./trakt.adapter";
import { TmdbProviderDiscoveryAdapter, PROVIDER_TMDB_ID_MAP } from "./tmdb-provider.adapter";

const logger = createLogger("source-registry");

/**
 * Streaming providers for which we register per-provider discovery adapters.
 * These cover the most widely-used platforms available in CA and US.
 * Each entry creates two adapters (movie + tv) per region.
 */
const PROVIDER_DISCOVERY_SOURCES: Array<{ name: string; regions: string[] }> = [
    { name: "Netflix", regions: ["CA", "US"] },
    { name: "Amazon Prime Video", regions: ["CA", "US"] },
    { name: "Disney Plus", regions: ["CA", "US"] },
    { name: "Apple TV Plus", regions: ["CA", "US"] },
    { name: "Max", regions: ["US"] },
    { name: "Crave", regions: ["CA"] },
    { name: "Paramount Plus", regions: ["CA", "US"] },
    { name: "Hulu", regions: ["US"] },
    { name: "Peacock", regions: ["US"] },
    { name: "Crunchyroll", regions: ["CA", "US"] },
];

/**
 * Builds the list of enabled source adapters from environment variables.
 * Called once during worker startup.
 *
 * Includes both generic TMDB/Trakt trending adapters and per-provider
 * TMDB Discover adapters that produce platform-specific popularity rankings.
 */
export function buildSourceAdapters(env: {
    TMDB_API_KEY?: string;
    TRAKT_CLIENT_ID?: string;
}): SourceAdapter[] {
    const adapters: SourceAdapter[] = [];

    if (env.TMDB_API_KEY) {
        // Generic trending — broad discovery
        adapters.push(new TmdbTrendingAdapter({ mediaType: "movie", apiKey: env.TMDB_API_KEY }));
        adapters.push(new TmdbTrendingAdapter({ mediaType: "tv", apiKey: env.TMDB_API_KEY }));
        logger.info("TMDB trending adapters registered");

        // Per-provider discovery — platform-specific popularity rankings
        let providerAdapterCount = 0;
        for (const { name, regions } of PROVIDER_DISCOVERY_SOURCES) {
            const tmdbProviderId = PROVIDER_TMDB_ID_MAP[name];
            if (!tmdbProviderId) continue;

            for (const region of regions) {
                for (const mediaType of ["movie", "tv"] as const) {
                    adapters.push(
                        new TmdbProviderDiscoveryAdapter({
                            providerName: name,
                            tmdbProviderId,
                            mediaType,
                            region,
                            apiKey: env.TMDB_API_KEY!,
                            maxResults: 20,
                        })
                    );
                    providerAdapterCount++;
                }
            }
        }
        logger.info(`TMDB provider discovery adapters registered`, { count: providerAdapterCount });
    } else {
        logger.warn("TMDB_API_KEY not set — TMDB adapters disabled");
    }

    if (env.TRAKT_CLIENT_ID) {
        adapters.push(new TraktTrendingAdapter({ mediaType: "movie", clientId: env.TRAKT_CLIENT_ID, tmdbApiKey: env.TMDB_API_KEY }));
        adapters.push(new TraktTrendingAdapter({ mediaType: "show", clientId: env.TRAKT_CLIENT_ID, tmdbApiKey: env.TMDB_API_KEY }));
        logger.info("Trakt adapters registered");
    }

    return adapters;
}

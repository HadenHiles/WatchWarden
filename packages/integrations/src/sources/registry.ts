import { createLogger } from "@watchwarden/config";
import type { SourceAdapter } from "./adapter";
import { TmdbTrendingAdapter } from "./tmdb.adapter";
import { TmdbProviderDiscoveryAdapter, PROVIDER_TMDB_ID_MAP } from "./tmdb-provider.adapter";
import { NetflixTop10Adapter } from "./netflix-top10.adapter";

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
 * Includes complementary generic TMDB discovery adapters and per-provider
 * TMDB Discover adapters that produce platform-specific popularity rankings.
 */
export function buildSourceAdapters(env: {
    TMDB_API_KEY?: string;
}): SourceAdapter[] {
    const adapters: SourceAdapter[] = [];

    if (env.TMDB_API_KEY) {
        // Broad discovery: short/long trend windows, durable popularity, and
        // currently releasing/airing titles for both movies and television.
        for (const mediaType of ["movie", "tv"] as const) {
            for (const feed of ["trending_day", "trending_week", "popular", "current"] as const) {
                adapters.push(new TmdbTrendingAdapter({ mediaType, feed, apiKey: env.TMDB_API_KEY }));
            }
        }
        logger.info("TMDB discovery adapters registered", { count: 8 });

        for (const region of ["CA", "US"] as const) {
            for (const mediaType of ["movie", "tv"] as const) {
                adapters.push(new NetflixTop10Adapter({ region, mediaType, apiKey: env.TMDB_API_KEY }));
            }
        }
        logger.info("Official Netflix Top 10 adapters registered", { count: 4 });

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
                            // Keep a deep provider catalog so Plex can publish
                            // useful long shelves after filtering to local media.
                            maxResults: 50,
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

    return adapters;
}

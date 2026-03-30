import axios from "axios";
import { createLogger } from "@watchwarden/config";
import type { SourceTrendItem } from "@watchwarden/types";
import type { SourceAdapter } from "./adapter";

const logger = createLogger("tmdb-provider-adapter");

const TMDB_BASE = "https://api.themoviedb.org/3";

/**
 * Map from canonical provider display name (as used in the UI and Title.streamingOn)
 * to TMDB watch_provider provider_id values.
 * We include both CA and US provider IDs where they differ.
 */
export const PROVIDER_TMDB_ID_MAP: Record<string, number> = {
    "Netflix": 8,
    "Amazon Prime Video": 9,
    "Prime Video": 9,
    "Disney Plus": 337,
    "Disney+": 337,
    "Apple TV Plus": 350,
    "Apple TV+": 350,
    "Max": 1899,
    "HBO Max": 384,
    "Crave": 230,
    "Paramount Plus": 531,
    "Paramount+": 531,
    "Hulu": 15,
    "Peacock": 386,
    "Crunchyroll": 283,
    "Shudder": 99,
    "BritBox": 151,
    "AMC+": 526,
    "STARZ": 43,
    "Tubi TV": 73,
    "Tubi": 73,
    "Pluto TV": 300,
    "Kanopy": 191,
    "STACKTV": 230, // STACKTV is delivered via Crave channels in TMDB CA data
};

interface TmdbDiscoverResult {
    id: number;
    title?: string;
    name?: string;
    original_title?: string;
    original_name?: string;
    release_date?: string;
    first_air_date?: string;
    overview?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    genre_ids?: number[];
    vote_average?: number;
    popularity?: number;
}

interface TmdbDiscoverResponse {
    page: number;
    results: TmdbDiscoverResult[];
    total_pages: number;
    total_results: number;
}

/**
 * TMDB Provider Discovery adapter.
 *
 * Uses the TMDB Discover API filtered to a specific streaming provider and sorted by
 * popularity — giving a ranked list of what is currently popular on that platform.
 * This produces far more platform-specific results than the generic TMDB trending endpoint.
 *
 * sourceId format: `tmdb_provider_{tmdbProviderId}_{movie|tv}_{region}`
 * e.g. `tmdb_provider_8_movie_CA` = Top movies on Netflix in Canada
 */
export class TmdbProviderDiscoveryAdapter implements SourceAdapter {
    readonly sourceId: string;
    readonly sourceName: string;
    private readonly mediaType: "movie" | "tv";
    private readonly tmdbProviderId: number;
    private readonly providerName: string;
    private readonly region: string;
    private readonly apiKey: string;
    private readonly maxResults: number;

    constructor(config: {
        providerName: string;
        tmdbProviderId: number;
        mediaType: "movie" | "tv";
        region: string;
        apiKey: string;
        maxResults?: number;
    }) {
        this.providerName = config.providerName;
        this.tmdbProviderId = config.tmdbProviderId;
        this.mediaType = config.mediaType;
        this.region = config.region;
        this.apiKey = config.apiKey;
        this.maxResults = config.maxResults ?? 20;
        this.sourceId = `tmdb_provider_${config.tmdbProviderId}_${config.mediaType}_${config.region}`;
        this.sourceName = `${config.providerName} Top ${this.maxResults} ${config.mediaType === "movie" ? "Movies" : "Shows"} (${config.region})`;
    }

    async fetchTrending(): Promise<SourceTrendItem[]> {
        if (!this.apiKey) {
            logger.warn("TMDB_API_KEY not set — returning empty provider trending list");
            return [];
        }

        try {
            const endpoint = this.mediaType === "movie" ? "movie" : "tv";
            const results: TmdbDiscoverResult[] = [];
            let page = 1;

            while (results.length < this.maxResults) {
                const res = await axios.get<TmdbDiscoverResponse>(
                    `${TMDB_BASE}/discover/${endpoint}`,
                    {
                        params: {
                            api_key: this.apiKey,
                            language: "en-US",
                            sort_by: "popularity.desc",
                            with_watch_providers: this.tmdbProviderId,
                            watch_region: this.region,
                            page,
                        },
                        timeout: 10_000,
                    }
                );

                results.push(...res.data.results);

                if (page >= res.data.total_pages || results.length >= this.maxResults) break;
                page++;
            }

            return results
                .slice(0, this.maxResults)
                .map((item, index) => this.normalize(item, index + 1));
        } catch (err) {
            logger.error("TMDB provider trending fetch failed", {
                source: this.sourceId,
                provider: this.providerName,
                error: String(err),
            });
            throw err;
        }
    }

    private normalize(item: TmdbDiscoverResult, providerRank: number): SourceTrendItem {
        const isMovie = this.mediaType === "movie";
        const rawYear = isMovie ? item.release_date : item.first_air_date;
        const year = rawYear ? parseInt(rawYear.substring(0, 4), 10) : null;
        const trendScore = Math.min(1, (item.popularity ?? 0) / 1000);

        return {
            tmdbId: item.id,
            imdbId: null,
            tvdbId: null,
            title: (isMovie ? item.title : item.name) ?? "",
            originalTitle: (isMovie ? item.original_title : item.original_name) ?? null,
            mediaType: isMovie ? "MOVIE" : "SHOW",
            year: isNaN(year!) ? null : year,
            overview: item.overview ?? null,
            posterPath: item.poster_path ?? null,
            backdropPath: item.backdrop_path ?? null,
            genres: [],
            source: this.sourceId,
            region: this.region,
            rank: providerRank,
            trendScore,
            providerId: String(this.tmdbProviderId),
            providerRank,
            rawMetadata: {
                providerName: this.providerName,
                providerId: this.tmdbProviderId,
                providerRank,
                popularity: item.popularity,
                voteAverage: item.vote_average,
            },
        };
    }
}

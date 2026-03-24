import axios from "axios";
import { createLogger } from "@watchwarden/config";
import type { SourceTrendItem } from "@watchwarden/types";
import type { SourceAdapter } from "./adapter";

const logger = createLogger("tmdb-adapter");

const TMDB_BASE = "https://api.themoviedb.org/3";

interface TmdbTrendingResult {
    id: number;
    title?: string;        // movies
    name?: string;         // TV
    original_title?: string;
    original_name?: string;
    media_type: "movie" | "tv";
    release_date?: string;
    first_air_date?: string;
    overview?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    genre_ids?: number[];
    vote_average?: number;
    popularity?: number;
}

interface TmdbTrendingResponse {
    page: number;
    results: TmdbTrendingResult[];
    total_pages: number;
    total_results: number;
}

/**
 * TMDB Trending adapter.
 * Supports weekly trending for movies and TV shows.
 * Region support is limited (TMDB doesn't filter trending by region).
 */
export class TmdbTrendingAdapter implements SourceAdapter {
    readonly sourceId: string;
    readonly sourceName: string;
    private readonly mediaType: "movie" | "tv";
    private readonly window: "day" | "week";
    private readonly apiKey: string;

    constructor(config: {
        mediaType: "movie" | "tv";
        window?: "day" | "week";
        apiKey: string;
    }) {
        this.mediaType = config.mediaType;
        this.window = config.window ?? "week";
        this.apiKey = config.apiKey;
        this.sourceId = `tmdb_trending_${config.mediaType}_${this.window}`;
        this.sourceName = `TMDB Trending ${config.mediaType === "movie" ? "Movies" : "Shows"} (${this.window})`;
    }

    async fetchTrending(): Promise<SourceTrendItem[]> {
        if (!this.apiKey) {
            logger.warn("TMDB_API_KEY not set — returning empty trending list");
            return [];
        }
        try {
            const url = `${TMDB_BASE}/trending/${this.mediaType}/${this.window}`;
            const res = await axios.get<TmdbTrendingResponse>(url, {
                params: { api_key: this.apiKey, language: "en-US", page: 1 },
                timeout: 10_000,
            });

            return res.data.results.map((item: TmdbTrendingResult, index: number) => this.normalize(item, index + 1));
        } catch (err) {
            logger.error("TMDB trending fetch failed", { source: this.sourceId, error: String(err) });
            throw err;
        }
    }

    private normalize(item: TmdbTrendingResult, rank: number): SourceTrendItem {
        const isMovie = item.media_type === "movie";
        const rawYear = isMovie ? item.release_date : item.first_air_date;
        const year = rawYear ? parseInt(rawYear.substring(0, 4), 10) : null;

        // Popularity-based score normalized to [0,1].
        // TMDB popularity floats can be 0–5000+; typical top-20 values are 100–2000.
        const trendScore = Math.min(1, (item.popularity ?? 0) / 1000);

        return {
            tmdbId: item.id,
            imdbId: null, // Not available in trending endpoint; enriched later if needed
            tvdbId: null,
            title: (isMovie ? item.title : item.name) ?? "",
            originalTitle: (isMovie ? item.original_title : item.original_name) ?? null,
            mediaType: isMovie ? "MOVIE" : "SHOW",
            year: isNaN(year!) ? null : year,
            overview: item.overview ?? null,
            // Store only the raw path fragment from TMDB (e.g. "/abc123.jpg").
            // Consumers are responsible for prepending the desired image base URL.
            posterPath: item.poster_path ?? null,
            backdropPath: item.backdrop_path ?? null,
            genres: [],
            source: this.sourceId,
            region: null,
            rank,
            trendScore,
            rawMetadata: item as unknown as Record<string, unknown>,
        };
    }
}

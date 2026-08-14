import axios from "axios";
import { createLogger } from "@watchwarden/config";
import type { SourceTrendItem } from "@watchwarden/types";
import type { SourceAdapter } from "./adapter";
import { mapTmdbGenres } from "./tmdb-genres";

const logger = createLogger("tmdb-adapter");

const TMDB_BASE = "https://api.themoviedb.org/3";

interface TmdbResult {
    id: number;
    title?: string;        // movies
    name?: string;         // TV
    original_title?: string;
    original_name?: string;
    media_type?: "movie" | "tv";
    release_date?: string;
    first_air_date?: string;
    overview?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    genre_ids?: number[];
    vote_average?: number;
    popularity?: number;
    original_language?: string;
    origin_country?: string[];
}

interface TmdbResponse {
    page: number;
    results: TmdbResult[];
    total_pages: number;
    total_results: number;
}

/**
 * TMDB discovery adapter covering complementary public signals: daily and
 * weekly trending, overall popularity, and titles currently releasing/airing.
 */
export class TmdbTrendingAdapter implements SourceAdapter {
    readonly sourceId: string;
    readonly sourceName: string;
    private readonly mediaType: "movie" | "tv";
    private readonly feed: "trending_day" | "trending_week" | "popular" | "current";
    private readonly apiKey: string;

    constructor(config: {
        mediaType: "movie" | "tv";
        feed?: "trending_day" | "trending_week" | "popular" | "current";
        apiKey: string;
    }) {
        this.mediaType = config.mediaType;
        this.feed = config.feed ?? "trending_week";
        this.apiKey = config.apiKey;
        this.sourceId = `tmdb_${this.feed}_${config.mediaType}`;
        const feedLabel = {
            trending_day: "Trending Today",
            trending_week: "Trending This Week",
            popular: "Popular",
            current: config.mediaType === "movie" ? "Now Playing" : "On the Air",
        }[this.feed];
        this.sourceName = `TMDB ${feedLabel} — ${config.mediaType === "movie" ? "Movies" : "Shows"}`;
    }

    async fetchTrending(): Promise<SourceTrendItem[]> {
        if (!this.apiKey) {
            logger.warn("TMDB_API_KEY not set — returning empty trending list");
            return [];
        }
        try {
            const path = this.feed === "trending_day"
                ? `trending/${this.mediaType}/day`
                : this.feed === "trending_week"
                    ? `trending/${this.mediaType}/week`
                    : this.feed === "popular"
                        ? `${this.mediaType}/popular`
                        : `${this.mediaType}/${this.mediaType === "movie" ? "now_playing" : "on_the_air"}`;
            const res = await axios.get<TmdbResponse>(`${TMDB_BASE}/${path}`, {
                params: {
                    api_key: this.apiKey,
                    language: "en-US",
                    page: 1,
                    ...(this.mediaType === "movie" && this.feed === "current" ? { region: "CA" } : {}),
                },
                timeout: 10_000,
            });

            return res.data.results.map((item: TmdbResult, index: number) => this.normalize(item, index + 1));
        } catch (err) {
            logger.error("TMDB trending fetch failed", { source: this.sourceId, error: String(err) });
            throw err;
        }
    }

    private normalize(item: TmdbResult, rank: number): SourceTrendItem {
        const isMovie = this.mediaType === "movie";
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
            releaseDate: rawYear || null,
            overview: item.overview ?? null,
            // Store only the raw path fragment from TMDB (e.g. "/abc123.jpg").
            // Consumers are responsible for prepending the desired image base URL.
            posterPath: item.poster_path ?? null,
            backdropPath: item.backdrop_path ?? null,
            genres: mapTmdbGenres(item.genre_ids),
            source: this.sourceId,
            region: null,
            rank,
            trendScore,
            rawMetadata: item as unknown as Record<string, unknown>,
        };
    }
}

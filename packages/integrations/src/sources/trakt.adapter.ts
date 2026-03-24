import axios from "axios";
import { createLogger } from "@watchwarden/config";
import type { SourceTrendItem } from "@watchwarden/types";
import type { SourceAdapter } from "./adapter";

const logger = createLogger("trakt-adapter");

const TRAKT_BASE = "https://api.trakt.tv";

interface TraktTrendingMovie {
    watchers: number;
    movie: {
        title: string;
        year: number;
        ids: { trakt: number; slug: string; imdb?: string; tmdb?: number };
    };
}

interface TraktTrendingShow {
    watchers: number;
    show: {
        title: string;
        year: number;
        ids: { trakt: number; slug: string; imdb?: string; tmdb?: number; tvdb?: number };
    };
}

/**
 * Trakt.tv trending adapter.
 * Requires a TRAKT_CLIENT_ID (free) — no OAuth needed for trending endpoints.
 */
export class TraktTrendingAdapter implements SourceAdapter {
    readonly sourceId: string;
    readonly sourceName: string;
    private readonly mediaType: "movie" | "show";
    private readonly clientId: string;

    constructor(config: { mediaType: "movie" | "show"; clientId: string }) {
        this.mediaType = config.mediaType;
        this.clientId = config.clientId;
        this.sourceId = `trakt_trending_${config.mediaType}s`;
        this.sourceName = `Trakt Trending ${config.mediaType === "movie" ? "Movies" : "Shows"}`;
    }

    async fetchTrending(): Promise<SourceTrendItem[]> {
        if (!this.clientId) {
            logger.warn("TRAKT_CLIENT_ID not set — returning empty trending list");
            return [];
        }
        try {
            const url = `${TRAKT_BASE}/${this.mediaType === "movie" ? "movies" : "shows"}/trending`;
            const res = await axios.get<TraktTrendingMovie[] | TraktTrendingShow[]>(url, {
                headers: {
                    "Content-Type": "application/json",
                    "trakt-api-version": "2",
                    "trakt-api-key": this.clientId,
                },
                params: { limit: 40 },
                timeout: 10_000,
            });

            return (res.data as Array<TraktTrendingMovie | TraktTrendingShow>).map((item, index) =>
                this.normalize(item, index + 1)
            );
        } catch (err) {
            logger.error("Trakt trending fetch failed", { source: this.sourceId, error: String(err) });
            throw err;
        }
    }

    private normalize(item: TraktTrendingMovie | TraktTrendingShow, rank: number): SourceTrendItem {
        const isMovie = this.mediaType === "movie";
        const media = isMovie
            ? (item as TraktTrendingMovie).movie
            : (item as TraktTrendingShow).show;

        const trendScore = Math.min(1, (item.watchers ?? 0) / 5000);

        return {
            tmdbId: media.ids.tmdb ?? null,
            imdbId: media.ids.imdb ?? null,
            tvdbId: isMovie ? null : ((media.ids as { tvdb?: number }).tvdb ?? null),
            title: media.title,
            originalTitle: null,
            mediaType: isMovie ? "MOVIE" : "SHOW",
            year: media.year ?? null,
            overview: null,
            posterPath: null,
            backdropPath: null,
            genres: [],
            source: this.sourceId,
            region: null,
            rank,
            trendScore,
            rawMetadata: item as unknown as Record<string, unknown>,
        };
    }
}

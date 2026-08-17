import axios from "axios";
import { createLogger } from "@watchwarden/config";
import type { SourceTrendItem } from "@watchwarden/types";
import type { SourceAdapter } from "./adapter";
import { mapTmdbGenres } from "./tmdb-genres";

const logger = createLogger("netflix-top10-adapter");
const TMDB_BASE = "https://api.themoviedb.org/3";

interface TmdbSearchResult {
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
}

function decodeHtml(value: string): string {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&colon;/g, ":")
        .replace(/&ndash;/g, "–")
        .trim();
}

/** Extracts the ten logo titles from Netflix's server-rendered Top 10 cards. */
export function parseNetflixTop10Titles(html: string): string[] {
    const titles: string[] = [];
    const cardPattern = /data-uia="top10-card"[\s\S]*?data-uia="top10-card-logo"[\s\S]*?alt="([^"]+)"/g;
    for (const match of html.matchAll(cardPattern)) {
        const title = decodeHtml(match[1] ?? "");
        if (title && !titles.includes(title)) titles.push(title);
        if (titles.length === 10) break;
    }
    return titles;
}

export function netflixTitleForTmdbSearch(chartTitle: string): string {
    const base = chartTitle.replace(/: (?:Season \d+|Limited Series|\d{4} - .+)$/i, "").trim();
    // Netflix's weekly chart abbreviates the long-running WWE series.
    if (base.toLocaleLowerCase() === "raw") return "WWE Raw";
    return base;
}

/**
 * Netflix's official country chart is the authoritative weekly popularity
 * signal. TMDB search is used only to resolve chart names to canonical IDs.
 */
export class NetflixTop10Adapter implements SourceAdapter {
    readonly sourceId: string;
    readonly sourceName: string;
    private readonly mediaType: "movie" | "tv";
    private readonly region: "CA" | "US";
    private readonly apiKey: string;

    constructor(config: { mediaType: "movie" | "tv"; region: "CA" | "US"; apiKey: string }) {
        this.mediaType = config.mediaType;
        this.region = config.region;
        this.apiKey = config.apiKey;
        this.sourceId = `netflix_top10_${config.mediaType}_${config.region}`;
        this.sourceName = `Netflix Official Top 10 — ${config.mediaType === "movie" ? "Movies" : "Shows"} (${config.region})`;
    }

    async fetchTrending(): Promise<SourceTrendItem[]> {
        const country = this.region === "CA" ? "canada" : "united-states";
        const url = `https://www.netflix.com/tudum/top10/${country}${this.mediaType === "tv" ? "/tv" : ""}`;
        const { data: html } = await axios.get<string>(url, {
            timeout: 15_000,
            headers: { "User-Agent": "WatchWarden/1.0 (+https://github.com/HadenHiles/WatchWarden)" },
        });
        const chartTitles = parseNetflixTop10Titles(html);
        if (chartTitles.length === 0) throw new Error(`Netflix Top 10 page contained no ${this.mediaType} titles for ${this.region}`);

        const resolved = await Promise.all(chartTitles.map((title, index) => this.resolveTitle(title, index + 1)));
        const items = resolved.filter((item): item is SourceTrendItem => item !== null);
        logger.info("Fetched official Netflix Top 10", { region: this.region, mediaType: this.mediaType, chartItems: chartTitles.length, resolved: items.length });
        return items;
    }

    private async resolveTitle(chartTitle: string, rank: number): Promise<SourceTrendItem | null> {
        try {
            const searchTitle = netflixTitleForTmdbSearch(chartTitle);
            const { data } = await axios.get<{ results: TmdbSearchResult[] }>(`${TMDB_BASE}/search/${this.mediaType}`, {
                params: { api_key: this.apiKey, language: "en-US", query: searchTitle, page: 1 }, timeout: 10_000,
            });
            const normalized = searchTitle.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
            const result = data.results.find((candidate) =>
                [candidate.title, candidate.name, candidate.original_title, candidate.original_name]
                    .some((name) => name?.toLocaleLowerCase().replace(/[^a-z0-9]/g, "") === normalized),
            ) ?? data.results[0];
            if (!result) return null;
            const rawDate = this.mediaType === "movie" ? result.release_date : result.first_air_date;
            const year = rawDate ? Number.parseInt(rawDate.slice(0, 4), 10) : null;
            return {
                tmdbId: result.id, imdbId: null, tvdbId: null,
                title: (this.mediaType === "movie" ? result.title : result.name) ?? chartTitle,
                originalTitle: (this.mediaType === "movie" ? result.original_title : result.original_name) ?? null,
                mediaType: this.mediaType === "movie" ? "MOVIE" : "SHOW",
                year: year && Number.isFinite(year) ? year : null,
                releaseDate: rawDate ?? null, overview: result.overview ?? null,
                posterPath: result.poster_path ?? null, backdropPath: result.backdrop_path ?? null,
                genres: mapTmdbGenres(result.genre_ids), source: this.sourceId, region: this.region,
                rank, trendScore: (11 - rank) / 10, providerId: "8", providerRank: rank,
                rawMetadata: { providerName: "Netflix", officialNetflixTop10: true, chartTitle, chartRank: rank },
            };
        } catch (error) {
            logger.warn("Could not resolve Netflix chart title through TMDB", { chartTitle, error: String(error) });
            return null;
        }
    }
}

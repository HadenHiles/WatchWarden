import type { TautulliHistoryRow, NormalizedWatchSignal } from "@watchwarden/types";

const RECENCY_HALF_LIFE_DAYS = 7; // score halves every 7 days

/**
 * Parses GUIDs from Tautulli into canonical IDs.
 * Tautulli returns guids like ["imdb://tt1234567", "tmdb://12345", "tvdb://67890"]
 */
export function parseGuids(guids: string[] = []): {
    tmdbId: number | null;
    tvdbId: number | null;
    imdbId: string | null;
} {
    let tmdbId: number | null = null;
    let tvdbId: number | null = null;
    let imdbId: string | null = null;

    for (const guid of guids) {
        if (guid.startsWith("tmdb://")) tmdbId = parseInt(guid.replace("tmdb://", ""), 10);
        else if (guid.startsWith("tvdb://")) tvdbId = parseInt(guid.replace("tvdb://", ""), 10);
        else if (guid.startsWith("imdb://")) imdbId = guid.replace("imdb://", "");
    }
    return { tmdbId, tvdbId, imdbId };
}

/** Calculates a recency score [0-1] that decays exponentially from lastWatchedAt */
export function calcRecencyScore(lastWatchedAt: Date | null): number {
    if (!lastWatchedAt) return 0;
    const daysAgo = (Date.now() - lastWatchedAt.getTime()) / 86_400_000;
    return Math.exp((-Math.LN2 * daysAgo) / RECENCY_HALF_LIFE_DAYS);
}

/** Builds completion rate [0-1] from history rows for a single canonical title */
function getCompletionRate(rows: TautulliHistoryRow[]): number {
    if (rows.length === 0) return 0;
    const completed = rows.filter((r) => r.percent_complete >= 85).length;
    return completed / rows.length;
}

/**
 * Transforms grouped history rows (all plays for one title) into a
 * NormalizedWatchSignal.
 */
export function transformHistoryToSignal(
    rows: TautulliHistoryRow[]
): NormalizedWatchSignal {
    const guids = parseGuids(rows[0]?.guids);
    const uniqueViewerIds = new Set(rows.map((r) => r.user_id));
    const uniqueViewerCount = uniqueViewerIds.size;
    const recentWatchCount = rows.length;
    const completionRate = getCompletionRate(rows);

    const latestTs = rows.reduce<number | null>((max, r) => {
        const ts = r.date * 1000;
        return max === null || ts > max ? ts : max;
    }, null);
    const lastWatchedAt = latestTs ? new Date(latestTs) : null;
    const recencyScore = calcRecencyScore(lastWatchedAt);

    // Household with 4 adults modeled; adjust via settings if needed
    const HOUSEHOLD_SIZE = 4;
    const watchSaturation = uniqueViewerCount / HOUSEHOLD_SIZE;

    const multiUserBoost = uniqueViewerCount >= 2 ? 0.2 * Math.min(uniqueViewerCount / 2, 1) : 0;
    // Penalize titles everyone has already finished
    const completionPenalty = uniqueViewerCount >= 2 && completionRate > 0.9 ? -0.3 : 0;

    const localInterestScore = Math.min(
        1,
        uniqueViewerCount * 0.25 + recencyScore * 0.35 + completionRate * 0.4 + multiUserBoost
    );

    const mediaType = rows[0]?.media_type === "movie" ? "MOVIE" : "SHOW";

    return {
        tmdbId: guids.tmdbId,
        tvdbId: guids.tvdbId,
        imdbId: guids.imdbId,
        title:
            mediaType === "SHOW"
                ? (rows[0]?.grandparent_title ?? rows[0]?.title ?? "")
                : (rows[0]?.title ?? ""),
        year: rows[0]?.year ?? null,
        mediaType,
        recentWatchCount,
        uniqueViewerCount,
        completionRate,
        watchSaturation,
        lastWatchedAt,
        recencyScore,
        localInterestScore,
        multiUserBoost,
        completionPenalty,
    };
}

/**
 * Groups raw Tautulli history rows by canonical title key (rating_key for
 * movies, grandparent_rating_key for episodes) and returns one normalized
 * signal per title.
 */
export function aggregateHistoryToSignals(rows: TautulliHistoryRow[]): NormalizedWatchSignal[] {
    const groups = new Map<string, TautulliHistoryRow[]>();

    for (const row of rows) {
        // Use grandparent_rating_key for episodes so we group by show, not episode
        const key =
            row.media_type === "episode" && row.grandparent_rating_key
                ? `show:${row.grandparent_rating_key}`
                : `movie:${row.rating_key}`;

        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
    }

    return Array.from(groups.values()).map((groupRows) => transformHistoryToSignal(groupRows));
}

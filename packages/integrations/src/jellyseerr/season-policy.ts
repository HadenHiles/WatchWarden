export interface SeasonCandidate {
    seasonNumber: number;
    episodeCount?: number;
    airDate?: string | null;
}

export function selectInitialSeasons(seasons: SeasonCandidate[], now = new Date(), maxEpisodes = 24) {
    const aired = seasons.filter(season => Number.isSafeInteger(season.seasonNumber) && season.seasonNumber > 0
        && season.airDate && Number.isFinite(Date.parse(season.airDate)) && Date.parse(season.airDate) <= now.getTime())
        .sort((first, second) => first.seasonNumber - second.seasonNumber);
    if (!aired.length) return { seasons: [] as number[], reason: "aired_season_metadata_unknown" };
    const candidates = [...new Map([aired[0], aired[aired.length - 1]].map(season => [season.seasonNumber, season])).values()];
    const selected: number[] = [];
    let episodes = 0;
    for (const season of candidates) {
        if (!Number.isSafeInteger(season.episodeCount) || season.episodeCount! <= 0) return { seasons: [] as number[], reason: "episode_count_unknown" };
        if (episodes + season.episodeCount! > maxEpisodes) continue;
        selected.push(season.seasonNumber);
        episodes += season.episodeCount!;
    }
    return { seasons: selected, reason: selected.length === candidates.length ? "first_and_latest_aired" : selected.length ? "initial_episode_budget" : "large_season_requires_review" };
}

export function planSeasonExpansion(input: {
    seasons: SeasonCandidate[]; ownedSeasons: number[]; watchingSeason: number;
    distinctEpisodesWatched: number; lastWatchedAt: Date | null; userRequested: boolean;
}, now = new Date()) {
    if (!input.lastWatchedAt || now.getTime() - input.lastWatchedAt.getTime() > 14 * 86400000
        || input.lastWatchedAt > now || input.distinctEpisodesWatched < 2) return { nextSeason: null, reason: "sustained_household_interest_not_established" };
    const next = input.seasons.filter(season => season.seasonNumber > input.watchingSeason
        && !input.ownedSeasons.includes(season.seasonNumber) && season.airDate
        && Number.isFinite(Date.parse(season.airDate)) && Date.parse(season.airDate) <= now.getTime())
        .sort((first, second) => first.seasonNumber - second.seasonNumber)[0];
    return { nextSeason: next?.seasonNumber ?? null,
        reason: next ? "continue_one_season_after_household_engagement" : "no_missing_aired_followup", protectFromRotationExpiry: true,
        acquisitionAuthorized: false };
}
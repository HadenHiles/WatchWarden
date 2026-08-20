import { getIntegrationConfig, prisma } from "@watchwarden/db";
import { createLogger } from "@watchwarden/config";
import { RadarrClient } from "@watchwarden/integrations";
import type { RadarrMovie, RadarrQuality } from "@watchwarden/types";

const logger = createLogger("radarr-sync-job");

const LOW_QUALITY_TERMS = /\b(cam|camrip|hdcam|ts|telesync|hdts|tc|telecine)\b/i;

function qualityName(quality?: RadarrQuality): string | null {
    return quality?.quality?.name ?? null;
}

function qualitySource(quality?: RadarrQuality): string | null {
    return quality?.quality?.source ?? null;
}

function isLowQualityTheatrical(movie: RadarrMovie): boolean {
    const releaseMarkers = [
        movie.movieFile?.quality?.quality?.name,
        movie.movieFile?.quality?.quality?.source,
        movie.movieFile?.relativePath,
        movie.movieFile?.path,
    ].filter((value): value is string => Boolean(value));

    if (!releaseMarkers.some((value) => LOW_QUALITY_TERMS.test(value))) return false;

    const now = Date.now();
    const physicalRelease = movie.physicalRelease ? new Date(movie.physicalRelease).getTime() : null;
    const digitalRelease = movie.digitalRelease ? new Date(movie.digitalRelease).getTime() : null;
    const hasHomeRelease = Boolean((physicalRelease && physicalRelease <= now) || (digitalRelease && digitalRelease <= now));

    return !hasHomeRelease;
}

export async function radarrSyncJob(): Promise<void> {
    const { radarr } = await getIntegrationConfig();

    if (!radarr.baseUrl || !radarr.apiKey) {
        logger.warn("Radarr not configured — skipping radarr-sync");
        return;
    }

    const client = new RadarrClient({ baseUrl: radarr.baseUrl, apiKey: radarr.apiKey });
    const movies = await client.getMovies();
    const byTmdbId = new Map(movies.filter((movie) => movie.tmdbId).map((movie) => [movie.tmdbId, movie]));
    const titles = await prisma.title.findMany({
        where: { mediaType: "MOVIE", tmdbId: { not: null } },
        select: {
            id: true,
            tmdbId: true,
            radarrMovieId: true,
            radarrQuality: true,
            radarrQualitySource: true,
            radarrIsLowQualityTheatrical: true,
        },
    });
    const now = new Date();
    let updated = 0;
    let matched = 0;
    let flagged = 0;

    for (const title of titles) {
        const movie = byTmdbId.get(title.tmdbId!);
        const next = {
            radarrMovieId: movie?.id ?? null,
            radarrQuality: qualityName(movie?.movieFile?.quality),
            radarrQualitySource: qualitySource(movie?.movieFile?.quality),
            radarrIsLowQualityTheatrical: movie ? isLowQualityTheatrical(movie) : false,
            radarrQualityCheckedAt: now,
        };

        if (movie) matched++;
        if (next.radarrIsLowQualityTheatrical) flagged++;

        if (
            title.radarrMovieId === next.radarrMovieId &&
            title.radarrQuality === next.radarrQuality &&
            title.radarrQualitySource === next.radarrQualitySource &&
            title.radarrIsLowQualityTheatrical === next.radarrIsLowQualityTheatrical
        ) continue;

        await prisma.title.update({ where: { id: title.id }, data: next });
        updated++;
    }

    logger.info("Radarr sync complete", { radarrMovies: movies.length, titles: titles.length, matched, flagged, updated });
}
import { prisma, getIntegrationConfig } from "@watchwarden/db";
import { PlexClient } from "@watchwarden/integrations";
import { createLogger } from "@watchwarden/config";

const logger = createLogger("plex-library-sync-job");

/**
 * Queries Plex directly to determine which titles are in the library.
 *
 * For each movie/show library section, fetches all items and matches them to
 * Title rows in WatchWarden by TMDB ID.  Sets inLibrary, libraryCheckedAt,
 * and plexRatingKey on all matched titles.
 *
 * Titles that were previously marked inLibrary but no longer appear in Plex
 * are cleared (inLibrary = false).
 */
export async function plexLibrarySyncJob(): Promise<void> {
    const { plex } = await getIntegrationConfig();

    if (!plex.baseUrl || !plex.token) {
        logger.warn("Plex not configured — skipping plex-library-sync");
        return;
    }

    const client = new PlexClient({ baseUrl: plex.baseUrl, token: plex.token });
    const now = new Date();

    // ── Get library sections ──────────────────────────────────────────────────
    let sections;
    try {
        sections = await client.getSections();
    } catch (err) {
        logger.error("Failed to fetch Plex sections", { error: err });
        return;
    }

    const movieSections = sections.filter((s) => s.type === "movie");
    const showSections = sections.filter((s) => s.type === "show");

    logger.info("Found Plex library sections", {
        movies: movieSections.length,
        shows: showSections.length,
    });

    // ── Build tmdbId → ratingKey map from Plex ────────────────────────────────
    const movieMap = new Map<number, string>(); // tmdbId → ratingKey
    const showMap = new Map<number, string>();

    for (const section of movieSections) {
        try {
            const items = await client.getAllItemsInSection(section.key, "movie");
            for (const item of items) {
                const tmdbId = PlexClient.extractTmdbId(item.guids);
                if (tmdbId) movieMap.set(tmdbId, item.ratingKey);
            }
            logger.debug("Scanned movie section", {
                section: section.title,
                items: items.length,
                matched: movieMap.size,
            });
        } catch (err) {
            logger.error("Failed to scan movie section", { section: section.title, error: err });
        }
    }

    for (const section of showSections) {
        try {
            const items = await client.getAllItemsInSection(section.key, "show");
            for (const item of items) {
                const tmdbId = PlexClient.extractTmdbId(item.guids);
                if (tmdbId) showMap.set(tmdbId, item.ratingKey);
            }
            logger.debug("Scanned show section", {
                section: section.title,
                items: items.length,
                matched: showMap.size,
            });
        } catch (err) {
            logger.error("Failed to scan show section", { section: section.title, error: err });
        }
    }

    // ── Reconcile with DB ─────────────────────────────────────────────────────
    const allTitles = await prisma.title.findMany({
        where: { tmdbId: { not: null } },
        select: { id: true, tmdbId: true, mediaType: true, inLibrary: true, plexRatingKey: true },
    });

    let markedIn = 0;
    let markedOut = 0;
    let unchanged = 0;

    for (const title of allTitles) {
        const tmdbId = title.tmdbId!;
        const map = title.mediaType === "MOVIE" ? movieMap : showMap;
        const plexKey = map.get(tmdbId) ?? null;
        const nowInLibrary = plexKey !== null;

        if (nowInLibrary === title.inLibrary && plexKey === title.plexRatingKey) {
            unchanged++;
            continue;
        }

        await prisma.title.update({
            where: { id: title.id },
            data: {
                inLibrary: nowInLibrary,
                libraryCheckedAt: now,
                plexRatingKey: plexKey,
                // Auto-promote AVAILABLE titles to ACTIVE_TRENDING on next scoring cycle
                // (no status change here — lifecycle-eval handles transitions)
            },
        });

        if (nowInLibrary && !title.inLibrary) markedIn++;
        else if (!nowInLibrary && title.inLibrary) markedOut++;
    }

    logger.info("Plex library sync complete", {
        totalScanned: allTitles.length,
        markedInLibrary: markedIn,
        markedNotInLibrary: markedOut,
        unchanged,
        plexMovies: movieMap.size,
        plexShows: showMap.size,
    });
}

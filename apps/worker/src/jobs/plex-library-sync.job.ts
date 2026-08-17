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
        throw err;
    }

    // Collections cannot contain items from a different Plex library section.
    // Scan only sections that WatchWarden is configured to publish into (e.g.
    // the main Movies/TV libraries, excluding separately managed Kids sections).
    const configured = await prisma.plexCollection.findMany({
        where: { enabled: true },
        select: { sectionId: true, mediaType: true },
    });
    const movieSectionIds = new Set(configured.filter((c) => c.mediaType === "MOVIE").map((c) => c.sectionId));
    const showSectionIds = new Set(configured.filter((c) => c.mediaType === "SHOW").map((c) => c.sectionId));
    const movieSections = sections.filter((s) => s.type === "movie" && movieSectionIds.has(s.key));
    const showSections = sections.filter((s) => s.type === "show" && showSectionIds.has(s.key));

    // Do not depend on Radarr/Sonarr/Jellyseerr having successfully notified
    // Plex. A refresh is asynchronous; this run sees already-imported items and
    // the next frequent run picks up anything Plex is still scanning.
    await Promise.all([...movieSections, ...showSections].map((section) => client.refreshSection(section.key)));

    logger.info("Found Plex library sections", {
        movies: movieSections.length,
        shows: showSections.length,
    });

    // ── Build tmdbId → ratingKey map from Plex ────────────────────────────────
    const movieMap = new Map<number, string>(); // tmdbId → ratingKey
    const showMap = new Map<number, string>();
    let failedSections = 0;

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
            failedSections++;
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
            failedSections++;
        }
    }

    if (failedSections > 0) {
        throw new Error(`Failed to scan ${failedSections} Plex library section(s); reconciliation aborted`);
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

        const newlyInLibrary = nowInLibrary && !title.inLibrary;

        await prisma.title.update({
            where: { id: title.id },
            data: {
                inLibrary: nowInLibrary,
                libraryCheckedAt: now,
                plexRatingKey: plexKey,
                // When a title is found in Plex for the first time, promote it to AVAILABLE
                // so the scoring job excludes it and lifecycle-eval can proceed correctly.
                ...(newlyInLibrary ? { status: "AVAILABLE" } : {}),
            },
        });

        // Fulfill any open suggestions so they no longer appear in the suggestions list
        if (newlyInLibrary) {
            await prisma.suggestion.updateMany({
                where: {
                    titleId: title.id,
                    status: { notIn: ["FULFILLED", "REJECTED"] },
                },
                data: { status: "FULFILLED" },
            });
        }

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

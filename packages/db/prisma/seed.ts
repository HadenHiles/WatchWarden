/**
 * Watch Warden — Database Seed Script
 *
 * Provides realistic mock data for local development and testing.
 * Run with: pnpm --filter @watchwarden/db run db:seed
 */

import { PrismaClient, MediaType, TitleStatus, LifecyclePolicy } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
    console.log("🌱 Seeding Watch Warden database...");

    // ── App Settings ────────────────────────────────────────────────────────────
    await seedSettings();

    // ── Source configs ───────────────────────────────────────────────────────────
    await seedSourceConfigs();

    // ── Titles ───────────────────────────────────────────────────────────────────
    const titles = await seedTitles();

    // ── Trend snapshots ──────────────────────────────────────────────────────────
    await seedTrendSnapshots(titles);

    // ── Watch signals ────────────────────────────────────────────────────────────
    await seedWatchSignals(titles);

    // ── Suggestions ──────────────────────────────────────────────────────────────
    await seedSuggestions(titles);

    // ── Audit log ────────────────────────────────────────────────────────────────
    await seedAuditLog(titles);

    // ── Job runs ─────────────────────────────────────────────────────────────────
    await seedJobRuns();

    console.log("✅ Seed complete.");
}

async function seedSettings() {
    const defaults = [
        {
            key: "score.weights",
            value: {
                externalTrendScore: 0.45,
                localInterestScore: 0.35,
                freshnessScore: 0.1,
                editorialBoost: 0.1,
            },
            category: "scoring",
        },
        {
            key: "exclusions",
            value: {
                excludeInLibrary: true,
                excludeAlreadyRequested: true,
                excludePermanentlyRejected: true,
            },
            category: "scoring",
        },
        {
            key: "retention.defaults",
            value: {
                movies: { lifecyclePolicy: "TEMPORARY_TRENDING", keepUntilDays: 90 },
                shows: { lifecyclePolicy: "TEMPORARY_TRENDING", keepUntilDays: 120 },
            },
            category: "retention",
        },
        {
            key: "regions.enabled",
            value: ["US", "CA"],
            category: "sources",
        },
    ];

    for (const setting of defaults) {
        await prisma.appSetting.upsert({
            where: { key: setting.key },
            update: {},
            create: { key: setting.key, value: setting.value, category: setting.category },
        });
    }
    console.log("  ↳ App settings seeded");
}

async function seedSourceConfigs() {
    const sources = [
        {
            sourceId: "tmdb_trending_movie_week",
            sourceName: "TMDB Trending Movies (Week)",
            enabled: true,
            region: null,
            mediaType: MediaType.MOVIE,
            config: {},
        },
        {
            sourceId: "tmdb_trending_show_week",
            sourceName: "TMDB Trending Shows (Week)",
            enabled: true,
            region: null,
            mediaType: MediaType.SHOW,
            config: {},
        },
        {
            sourceId: "trakt_trending_movies",
            sourceName: "Trakt Trending Movies",
            enabled: false,
            region: null,
            mediaType: MediaType.MOVIE,
            config: {},
        },
        {
            sourceId: "trakt_trending_shows",
            sourceName: "Trakt Trending Shows",
            enabled: false,
            region: null,
            mediaType: MediaType.SHOW,
            config: {},
        },
    ];

    for (const source of sources) {
        await prisma.sourceConfig.upsert({
            where: { sourceId: source.sourceId },
            update: {},
            create: source,
        });
    }
    console.log("  ↳ Source configs seeded");
}

async function seedTitles() {
    const movieData = [
        {
            tmdbId: 603692,
            title: "John Wick: Chapter 4",
            mediaType: MediaType.MOVIE,
            year: 2023,
            overview:
                "With the price on his head ever increasing, legendary hit man John Wick takes his fight against the High Table global.",
            posterPath: "/vZloFAK7NmvMGKE7VkF5UHaz0I.jpg",
            genres: ["Action", "Thriller"],
            status: TitleStatus.ACTIVE_TRENDING,
            lifecyclePolicy: LifecyclePolicy.TEMPORARY_TRENDING,
            isTemporary: true,
            inLibrary: true,
            isRequested: true,
            finalScore: 0.87,
        },
        {
            tmdbId: 346698,
            title: "Barbie",
            mediaType: MediaType.MOVIE,
            year: 2023,
            overview:
                "Barbie and Ken are having the time of their lives in the colorful and seemingly perfect world of Barbie Land.",
            posterPath: "/iuFNMS8vlbF05IQszODU3mO7d4D.jpg",
            genres: ["Adventure", "Comedy", "Fantasy"],
            status: TitleStatus.CLEANUP_ELIGIBLE,
            lifecyclePolicy: LifecyclePolicy.TEMPORARY_TRENDING,
            isTemporary: true,
            cleanupEligible: true,
            cleanupReason: "Trend score dropped below threshold",
            inLibrary: true,
            isRequested: true,
            keepUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            finalScore: 0.61,
        },
        {
            tmdbId: 695721,
            title: "The Hunger Games: The Ballad of Songbirds & Snakes",
            mediaType: MediaType.MOVIE,
            year: 2023,
            overview:
                "64 years before he becomes the tyrannical president of Panem, Coriolanus Snow sees a chance for a change in fortunes.",
            posterPath: "/mBaXZ95R2OxueZhvQbcEWy2DqyO.jpg",
            genres: ["Action", "Adventure", "Science Fiction"],
            status: TitleStatus.SUGGESTED,
            lifecyclePolicy: LifecyclePolicy.TEMPORARY_TRENDING,
            isTemporary: true,
            finalScore: 0.74,
        },
        {
            tmdbId: 940721,
            title: "Godzilla Minus One",
            mediaType: MediaType.MOVIE,
            year: 2023,
            overview:
                "Post war Japan is at its lowest point when a new crisis emerges in the form of a giant monster.",
            posterPath: "/hkxxMIGaiCTmrEArK7J56eFmFze.jpg",
            genres: ["Action", "Horror", "Science Fiction"],
            status: TitleStatus.APPROVED,
            lifecyclePolicy: LifecyclePolicy.TEMPORARY_TRENDING,
            isTemporary: true,
            finalScore: 0.79,
        },
        {
            tmdbId: 1011985,
            title: "Wonka",
            mediaType: MediaType.MOVIE,
            year: 2023,
            overview:
                "Willy Wonka — chock-full of ideas and determined to change the world one delectable bite at a time — is on his way to the world's greatest city.",
            posterPath: "/qhb1qOilapbapxWQn9jtRCMwXJF.jpg",
            genres: ["Comedy", "Family", "Fantasy"],
            status: TitleStatus.REJECTED,
            finalScore: 0.45,
        },
        {
            tmdbId: 872585,
            title: "Oppenheimer",
            mediaType: MediaType.MOVIE,
            year: 2023,
            overview:
                "The story of J. Robert Oppenheimer's role in the development of the atomic bomb during World War II.",
            posterPath: "/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
            genres: ["Drama", "History"],
            status: TitleStatus.PINNED,
            lifecyclePolicy: LifecyclePolicy.PERMANENT,
            isTemporary: false,
            isPinned: true,
            inLibrary: true,
            isRequested: true,
            finalScore: 0.93,
        },
    ];

    const showData = [
        {
            tmdbId: 202555,
            title: "The Diplomat",
            mediaType: MediaType.SHOW,
            year: 2023,
            overview:
                "In the midst of an international crisis, a career diplomat lands in a high-profile job she's not ready for.",
            posterPath: "/2meX1nMdScFOoV4370ims6XLIH8.jpg",
            genres: ["Drama"],
            status: TitleStatus.SUGGESTED,
            lifecyclePolicy: LifecyclePolicy.TEMPORARY_TRENDING,
            isTemporary: true,
            finalScore: 0.82,
        },
        {
            tmdbId: 84958,
            title: "Loki",
            mediaType: MediaType.SHOW,
            year: 2021,
            overview:
                "After stealing the Tesseract during the events of Avengers: Endgame, an alternate version of Loki is brought to the mysterious Time Variance Authority.",
            posterPath: "/kEl2t3OhXc3Zb9FBh1AuYzRTgZp.jpg",
            genres: ["Action", "Adventure", "Science Fiction"],
            status: TitleStatus.ACTIVE_TRENDING,
            lifecyclePolicy: LifecyclePolicy.TEMPORARY_TRENDING,
            isTemporary: true,
            inLibrary: true,
            isRequested: true,
            finalScore: 0.71,
        },
        {
            tmdbId: 100088,
            title: "The Last of Us",
            mediaType: MediaType.SHOW,
            year: 2023,
            overview:
                "In a post-apocalyptic world, Joel, a seasoned survivor, is hired to smuggle Ellie, a teenager, out of an oppressive quarantine zone.",
            posterPath: "/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg",
            genres: ["Drama", "Science Fiction"],
            status: TitleStatus.PINNED,
            lifecyclePolicy: LifecyclePolicy.PERMANENT,
            isTemporary: false,
            isPinned: true,
            inLibrary: true,
            isRequested: true,
            finalScore: 0.96,
        },
        {
            tmdbId: 1429,
            title: "Attack on Titan",
            mediaType: MediaType.SHOW,
            year: 2013,
            overview: "Several hundred years ago, humans were nearly exterminated by giants called Titans.",
            posterPath: "/hTP1DtLGFamjfxwgiwGElrkreos.jpg",
            genres: ["Action", "Adventure", "Animation"],
            status: TitleStatus.SNOOZED,
            lifecyclePolicy: LifecyclePolicy.TEMPORARY_TRENDING,
            isTemporary: true,
            finalScore: 0.55,
        },
    ];

    const created: Record<string, string> = {};

    for (const movie of movieData) {
        const { finalScore, ...titleFields } = movie;
        void finalScore;
        const t = await prisma.title.upsert({
            where: { tmdbId: titleFields.tmdbId },
            update: {},
            create: titleFields,
        });
        created[t.tmdbId!.toString()] = t.id;
    }

    for (const show of showData) {
        const { finalScore, ...titleFields } = show;
        void finalScore;
        const t = await prisma.title.upsert({
            where: { tmdbId: titleFields.tmdbId },
            update: {},
            create: titleFields,
        });
        created[t.tmdbId!.toString()] = t.id;
    }

    console.log(`  ↳ ${Object.keys(created).length} titles seeded`);
    return created;
}

async function seedTrendSnapshots(titleIdMap: Record<string, string>) {
    let count = 0;
    for (const [tmdbIdStr, titleId] of Object.entries(titleIdMap)) {
        const rank = Math.floor(Math.random() * 20) + 1;
        await prisma.externalTrendSnapshot.create({
            data: {
                titleId,
                source: "tmdb_trending_movie_week",
                region: "US",
                rank,
                trendScore: Math.max(0.1, 1 - rank * 0.04),
                rawMetadata: { tmdbId: parseInt(tmdbIdStr), rank, page: 1 },
                snapshotAt: new Date(),
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });
        count++;
    }
    console.log(`  ↳ ${count} trend snapshots seeded`);
}

async function seedWatchSignals(titleIdMap: Record<string, string>) {
    let count = 0;
    for (const titleId of Object.values(titleIdMap)) {
        const watchCount = Math.floor(Math.random() * 12);
        const uniqueViewers = Math.min(watchCount, Math.floor(Math.random() * 5) + 1);
        const completionRate = Math.random();
        await prisma.localWatchSignal.upsert({
            where: { titleId },
            update: {},
            create: {
                titleId,
                recentWatchCount: watchCount,
                uniqueViewerCount: uniqueViewers,
                completionRate,
                watchSaturation: uniqueViewers / 4,
                lastWatchedAt: watchCount > 0 ? new Date(Date.now() - Math.random() * 14 * 86400000) : null,
                recencyScore: watchCount > 0 ? Math.random() * 0.8 + 0.2 : 0,
                localInterestScore: Math.min(1, (uniqueViewers * 0.25 + completionRate * 0.5)),
                multiUserBoost: uniqueViewers >= 2 ? 0.2 : 0,
                completionPenalty: uniqueViewers >= 2 && completionRate > 0.9 ? -0.3 : 0,
            },
        });
        count++;
    }
    console.log(`  ↳ ${count} watch signals seeded`);
}

async function seedSuggestions(titleIdMap: Record<string, string>) {
    const scores: Record<string, number> = {
        603692: 0.87,
        346698: 0.61,
        695721: 0.74,
        940721: 0.79,
        1011985: 0.45,
        872585: 0.93,
        202555: 0.82,
        84958: 0.71,
        100088: 0.96,
        1429: 0.55,
    };

    const statusMap: Record<string, "PENDING" | "APPROVED" | "REJECTED" | "SNOOZED"> = {
        603692: "APPROVED",
        346698: "APPROVED",
        695721: "PENDING",
        940721: "APPROVED",
        1011985: "REJECTED",
        872585: "APPROVED",
        202555: "PENDING",
        84958: "APPROVED",
        100088: "APPROVED",
        1429: "SNOOZED",
    };

    let count = 0;
    for (const [tmdbIdStr, titleId] of Object.entries(titleIdMap)) {
        const final = scores[tmdbIdStr] ?? 0.5;
        const status = statusMap[tmdbIdStr] ?? "PENDING";
        await prisma.suggestion.upsert({
            where: { titleId },
            update: {},
            create: {
                titleId,
                externalTrendScore: final * 0.45 + Math.random() * 0.05,
                localInterestScore: final * 0.35 + Math.random() * 0.05,
                freshnessScore: final * 0.10 + Math.random() * 0.02,
                editorialBoost: 0,
                finalScore: final,
                scoreExplanation: `Score ${(final * 100).toFixed(0)}/100 based on trend rank, family watch history, and recency.`,
                suggestedReasons: [
                    "Trending on TMDB this week",
                    ...(final > 0.8 ? ["High local family interest"] : []),
                    ...(final > 0.85 ? ["Multiple viewers in household"] : []),
                ],
                status,
                snoozedUntil:
                    status === "SNOOZED"
                        ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
                        : null,
            },
        });
        count++;
    }
    console.log(`  ↳ ${count} suggestions seeded`);
}

async function seedAuditLog(titleIdMap: Record<string, string>) {
    const entries = [
        { action: "SUGGESTION_APPROVED", titleId: Object.values(titleIdMap)[0] },
        { action: "SUGGESTION_REJECTED", titleId: Object.values(titleIdMap)[4] },
        { action: "TITLE_PINNED", titleId: Object.values(titleIdMap)[5] },
        { action: "EXPORT_GENERATED", details: { exportType: "active_trending_movies", itemCount: 3 } },
        { action: "JOB_COMPLETED", details: { jobName: "trend-sync", itemsProcessed: 40 } },
        { action: "JELLYSEERR_REQUEST_SUBMITTED", titleId: Object.values(titleIdMap)[3] },
    ];

    for (const entry of entries) {
        await prisma.auditLog.create({
            data: {
                action: entry.action,
                entityType: entry.titleId ? "Title" : null,
                entityId: entry.titleId ?? null,
                titleId: entry.titleId ?? null,
                details: (entry.details as object) ?? null,
            },
        });
    }
    console.log(`  ↳ ${entries.length} audit log entries seeded`);
}

async function seedJobRuns() {
    const jobs = [
        { jobName: "trend-sync", status: "COMPLETED" as const, itemsProcessed: 40 },
        { jobName: "tautulli-sync", status: "COMPLETED" as const, itemsProcessed: 10 },
        { jobName: "scoring", status: "COMPLETED" as const, itemsProcessed: 10 },
        { jobName: "jellyseerr-status-sync", status: "COMPLETED" as const, itemsProcessed: 4 },
        { jobName: "lifecycle-eval", status: "COMPLETED" as const, itemsProcessed: 10 },
        { jobName: "export", status: "COMPLETED" as const, itemsProcessed: 6 },
        { jobName: "library-sync", status: "FAILED" as const, error: "Jellyseerr connection timeout" },
    ];

    for (const job of jobs) {
        const start = new Date(Date.now() - Math.random() * 3600000);
        const duration = Math.floor(Math.random() * 8000) + 500;
        await prisma.jobRun.create({
            data: {
                jobName: job.jobName,
                status: job.status,
                startedAt: start,
                finishedAt: new Date(start.getTime() + duration),
                duration,
                itemsProcessed: job.itemsProcessed ?? null,
                error: job.error ?? null,
            },
        });
    }
    console.log(`  ↳ ${jobs.length} job runs seeded`);
}

main()
    .catch((e) => {
        console.error("Seed failed:", e);
        process.exit(1);
    })
    .finally(() => {
        void prisma.$disconnect();
    });

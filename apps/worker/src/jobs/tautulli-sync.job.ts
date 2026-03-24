import { prisma } from "@watchwarden/db";
import { TautulliClient, aggregateHistoryToSignals } from "@watchwarden/integrations";
import { createLogger } from "@watchwarden/config";

const logger = createLogger("tautulli-sync-job");

function buildClient(): TautulliClient | null {
    const baseUrl = process.env.TAUTULLI_BASE_URL;
    const apiKey = process.env.TAUTULLI_API_KEY;
    if (!baseUrl || !apiKey) {
        logger.warn("Tautulli not configured — skipping sync");
        return null;
    }
    return new TautulliClient({ baseUrl, apiKey });
}

export async function tautulliSyncJob(): Promise<void> {
    const client = buildClient();
    if (!client) return;

    const healthy = await client.healthCheck();
    if (!healthy) {
        throw new Error("Tautulli health check failed");
    }

    logger.info("Fetching Tautulli watch history (last 30 days)");
    const history = await client.getHistory({ daysAgo: 30, length: 500 });
    logger.info(`Got ${history.length} history rows`);

    const signals = aggregateHistoryToSignals(history);
    logger.info(`Aggregated into ${signals.length} watch signals`);

    let updated = 0;

    for (const signal of signals) {
        if (!signal.tmdbId && !signal.imdbId && !signal.tvdbId) {
            logger.debug("Skipping signal with no canonical ID", { title: signal.title });
            continue;
        }

        // Find the matching title
        const title = signal.tmdbId
            ? await prisma.title.findFirst({ where: { tmdbId: signal.tmdbId } })
            : signal.imdbId
                ? await prisma.title.findFirst({ where: { imdbId: signal.imdbId } })
                : null;

        if (!title) {
            logger.debug("No matching title for watch signal", { title: signal.title, tmdbId: signal.tmdbId });
            continue;
        }

        await prisma.localWatchSignal.upsert({
            where: { titleId: title.id },
            update: {
                recentWatchCount: signal.recentWatchCount,
                uniqueViewerCount: signal.uniqueViewerCount,
                completionRate: signal.completionRate,
                watchSaturation: signal.watchSaturation,
                lastWatchedAt: signal.lastWatchedAt,
                recencyScore: signal.recencyScore,
                localInterestScore: signal.localInterestScore,
                multiUserBoost: signal.multiUserBoost,
                completionPenalty: signal.completionPenalty,
                fetchedAt: new Date(),
            },
            create: {
                titleId: title.id,
                recentWatchCount: signal.recentWatchCount,
                uniqueViewerCount: signal.uniqueViewerCount,
                completionRate: signal.completionRate,
                watchSaturation: signal.watchSaturation,
                lastWatchedAt: signal.lastWatchedAt,
                recencyScore: signal.recencyScore,
                localInterestScore: signal.localInterestScore,
                multiUserBoost: signal.multiUserBoost,
                completionPenalty: signal.completionPenalty,
            },
        });

        updated++;
    }

    logger.info("Tautulli sync complete", { signalsProcessed: signals.length, titlesUpdated: updated });
}

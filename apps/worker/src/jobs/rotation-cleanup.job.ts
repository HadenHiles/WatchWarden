import { prisma } from "@watchwarden/db";
import { assessRetention } from "@watchwarden/scoring";
import { createLogger } from "@watchwarden/config";

const logger = createLogger("rotation-retention-review");

export async function rotationCleanupJob(): Promise<void> {
    const now = new Date();
    const titles = await prisma.title.findMany({
        where: { inLibrary: true, requestRecord: { requestedByBot: true } },
        include: { requestRecord: true, watchSignals: true },
        orderBy: [{ cleanupEligibleSince: "asc" }, { id: "asc" }],
        take: 101,
    });
    const items = titles.slice(0, 100).map((title) => {
        const signal = title.watchSignals[0];
        const decision = assessRetention({
            userRequested: null, pinned: title.isPinned,
            permanent: title.lifecyclePolicy === "PERMANENT" || title.lifecyclePolicy === "PINNED",
            keepUntil: title.keepUntil, activePlayback: null, inProgress: null, watchlisted: null,
            lastWatchedAt: signal?.lastWatchedAt ?? null, playbackHistoryComplete: false,
            currentlyFeatured: null, outOfRotationSince: title.cleanupEligibleSince,
            minimumAvailabilityMet: null, demand: "uncertain",
        }, now);
        return { titleId: title.id, title: title.title, mediaType: title.mediaType, ...decision };
    });
    const value = { checkedAt: now.toISOString(), complete: titles.length <= 100,
        mode: "review_only", deletionAuthority: "reclaimerr", items };
    await prisma.appSetting.upsert({ where: { key: "catalogue.retentionReview" },
        update: { value }, create: { key: "catalogue.retentionReview", category: "catalogue", value } });
    logger.info("Retention review recorded without media writes", {
        reviewed: items.length, complete: value.complete,
        kept: items.filter((item) => item.decision === "keep").length,
        needsInvestigation: items.filter((item) => item.decision === "review").length,
    });
}

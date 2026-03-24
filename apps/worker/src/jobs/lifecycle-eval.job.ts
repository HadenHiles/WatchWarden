import { prisma } from "@watchwarden/db";
import { evaluateLifecycleTransition } from "@watchwarden/scoring";
import { createLogger } from "@watchwarden/config";
import type { TitleStatus, LifecyclePolicy } from "@watchwarden/types";

const logger = createLogger("lifecycle-eval-job");

const LIFECYCLE_STATUSES: TitleStatus[] = [
    "AVAILABLE",
    "ACTIVE_TRENDING",
    "CLEANUP_ELIGIBLE",
    "APPROVED",
    "REQUESTED",
];

export async function lifecycleEvalJob(): Promise<void> {
    const titles = await prisma.title.findMany({
        where: { status: { in: LIFECYCLE_STATUSES } },
        include: {
            trendSnapshots: { orderBy: { snapshotAt: "desc" }, take: 1 },
            suggestion: true,
            requestRecord: true,
        },
    });

    let transitioned = 0;
    let unchanged = 0;

    for (const title of titles) {
        const latestSnapshot = title.trendSnapshots[0];
        const finalScore = title.suggestion?.finalScore ?? 0;

        const result = evaluateLifecycleTransition({
            currentStatus: title.status as TitleStatus,
            lifecyclePolicy: title.lifecyclePolicy as LifecyclePolicy,
            isRequested: title.isRequested,
            inLibrary: title.inLibrary,
            isPinned: title.isPinned,
            cleanupEligible: title.cleanupEligible,
            jellyseerrRequestStatus: title.requestRecord?.requestStatus ?? null,
            finalScore,
            latestSnapshotAt: latestSnapshot?.snapshotAt ?? null,
            keepUntil: title.keepUntil ?? null,
        });

        if (result.changed) {
            await prisma.title.update({
                where: { id: title.id },
                data: {
                    status: result.newStatus,
                    cleanupEligible: result.cleanupEligible,
                    cleanupReason: result.cleanupReason,
                },
            });
            transitioned++;
        } else {
            unchanged++;
        }
    }

    logger.info("Lifecycle evaluation complete", { transitioned, unchanged });
}

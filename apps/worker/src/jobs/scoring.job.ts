import { prisma } from "@watchwarden/db";
import { scoreTitle } from "@watchwarden/scoring";
import { createLogger } from "@watchwarden/config";
import type { ScoreWeights } from "@watchwarden/types";

const logger = createLogger("scoring-job");

const DEFAULT_WEIGHTS: ScoreWeights = {
    externalTrendScore: 0.45,
    localInterestScore: 0.35,
    freshnessScore: 0.1,
    editorialBoost: 0.1,
};

export async function scoringJob(): Promise<void> {
    // Load scoring weights from settings
    const weightsSetting = await prisma.appSetting.findUnique({ where: { key: "score.weights" } });
    const rawWeights = weightsSetting
        ? (weightsSetting.value as unknown as ScoreWeights)
        : DEFAULT_WEIGHTS;

    // Normalize weights so they always sum to 1.0 regardless of what the user saved.
    // This handles cases where values were entered as whole numbers (e.g. 7, 3, 5, 2)
    // instead of fractions (0.45, 0.35, 0.10, 0.10).
    const weightsSum = Object.values(rawWeights).reduce((a, b) => a + b, 0);
    const weights: ScoreWeights = weightsSum > 0 && Math.abs(weightsSum - 1) > 0.01
        ? (() => {
            logger.warn("Score weights do not sum to 1 — normalizing", { rawWeights, sum: weightsSum });
            return Object.fromEntries(
                Object.entries(rawWeights).map(([k, v]) => [k, v / weightsSum])
            ) as unknown as ScoreWeights;
        })()
        : rawWeights;

    const exclusionsSetting = await prisma.appSetting.findUnique({ where: { key: "exclusions" } });
    const exclusions = exclusionsSetting?.value as {
        excludeInLibrary: boolean;
        excludeAlreadyRequested: boolean;
        excludePermanentlyRejected: boolean;
    } | null;

    // Process all titles that have at least one trend snapshot
    const titles = await prisma.title.findMany({
        where: {
            trendSnapshots: { some: {} },
            status: { notIn: ["REJECTED", "PINNED", "EXPIRED"] },
        },
        include: {
            trendSnapshots: { orderBy: { snapshotAt: "desc" }, take: 1 },
            watchSignals: true,
            suggestion: { include: { decisions: { orderBy: { createdAt: "desc" }, take: 1 } } },
        },
    });

    logger.info(`Scoring ${titles.length} candidate titles`);

    let scored = 0;
    let excluded = 0;

    for (const title of titles) {
        const latestSnapshot = title.trendSnapshots[0];
        const watchSignal = title.watchSignals[0];

        // Compute freshness: how recent is the snapshot? (0–1)
        const snapshotAgeMs = latestSnapshot
            ? Date.now() - latestSnapshot.snapshotAt.getTime()
            : Infinity;
        const freshnessScore = Math.max(0, 1 - snapshotAgeMs / (14 * 24 * 60 * 60 * 1000));

        // Check last rejection date
        const lastRejectionDecision = title.suggestion?.decisions.find(
            (d) => d.action === "REJECT"
        );

        const result = scoreTitle({
            externalTrendScore: latestSnapshot?.trendScore ?? 0,
            localInterestScore: watchSignal?.localInterestScore ?? 0,
            freshnessScore,
            editorialBoost: 0,
            weights,
            rules: {
                snapshotAt: latestSnapshot?.snapshotAt ?? null,
                lastRejectedAt: lastRejectionDecision?.createdAt ?? null,
                uniqueViewerCount: watchSignal?.uniqueViewerCount ?? 0,
                completionRate: watchSignal?.completionRate ?? 0,
                inLibrary: title.inLibrary,
                isRequested: title.isRequested,
                isPermanentlyRejected: title.lifecyclePolicy === "PERMANENT" && title.status === "REJECTED",
                excludeInLibrary: exclusions?.excludeInLibrary ?? true,
                excludeAlreadyRequested: exclusions?.excludeAlreadyRequested ?? true,
                excludePermanentlyRejected: exclusions?.excludePermanentlyRejected ?? true,
            },
        });

        if (result.excluded) {
            excluded++;

            // For in-library titles the exclusion is intentional for the suggestion feed
            // (don't surface things already owned), but lifecycle evaluation still needs
            // an up-to-date score so ACTIVE_TRENDING promotion can work.
            // Re-score without exclusion rules and persist the result on the suggestion
            // record (kept FULFILLED so it never surfaces in the UI).
            if (title.inLibrary) {
                const lifecycleResult = scoreTitle({
                    externalTrendScore: latestSnapshot?.trendScore ?? 0,
                    localInterestScore: watchSignal?.localInterestScore ?? 0,
                    freshnessScore,
                    editorialBoost: 0,
                    weights,
                    rules: {
                        snapshotAt: latestSnapshot?.snapshotAt ?? null,
                        lastRejectedAt: lastRejectionDecision?.createdAt ?? null,
                        uniqueViewerCount: watchSignal?.uniqueViewerCount ?? 0,
                        completionRate: watchSignal?.completionRate ?? 0,
                        inLibrary: false,
                        isRequested: false,
                        isPermanentlyRejected: false,
                        excludeInLibrary: false,
                        excludeAlreadyRequested: false,
                        excludePermanentlyRejected: false,
                    },
                });

                await prisma.suggestion.upsert({
                    where: { titleId: title.id },
                    update: {
                        externalTrendScore: lifecycleResult.breakdown.externalTrendScore,
                        localInterestScore: lifecycleResult.breakdown.localInterestScore,
                        freshnessScore: lifecycleResult.breakdown.freshnessScore,
                        editorialBoost: lifecycleResult.breakdown.editorialBoost,
                        finalScore: lifecycleResult.breakdown.finalScore,
                        status: "FULFILLED",
                        generatedAt: new Date(),
                    },
                    create: {
                        titleId: title.id,
                        externalTrendScore: lifecycleResult.breakdown.externalTrendScore,
                        localInterestScore: lifecycleResult.breakdown.localInterestScore,
                        freshnessScore: lifecycleResult.breakdown.freshnessScore,
                        editorialBoost: lifecycleResult.breakdown.editorialBoost,
                        finalScore: lifecycleResult.breakdown.finalScore,
                        status: "FULFILLED",
                    },
                });
            } else {
                // Not in-library: just close the suggestion so it disappears from the UI.
                if (title.suggestion && !["FULFILLED", "REJECTED"].includes(title.suggestion.status)) {
                    await prisma.suggestion.update({
                        where: { id: title.suggestion.id },
                        data: { status: "FULFILLED" },
                    });
                }
            }

            continue;
        }

        // Upsert the suggestion
        await prisma.suggestion.upsert({
            where: { titleId: title.id },
            update: {
                externalTrendScore: result.breakdown.externalTrendScore,
                localInterestScore: result.breakdown.localInterestScore,
                freshnessScore: result.breakdown.freshnessScore,
                editorialBoost: result.breakdown.editorialBoost,
                finalScore: result.breakdown.finalScore,
                scoreExplanation: result.explanation,
                suggestedReasons: result.reasons,
                generatedAt: new Date(),
            },
            create: {
                titleId: title.id,
                externalTrendScore: result.breakdown.externalTrendScore,
                localInterestScore: result.breakdown.localInterestScore,
                freshnessScore: result.breakdown.freshnessScore,
                editorialBoost: result.breakdown.editorialBoost,
                finalScore: result.breakdown.finalScore,
                scoreExplanation: result.explanation,
                suggestedReasons: result.reasons,
                status: "PENDING",
            },
        });

        // Promote CANDIDATE titles that now have a score to SUGGESTED
        if (title.status === "CANDIDATE") {
            await prisma.title.update({ where: { id: title.id }, data: { status: "SUGGESTED" } });
        }

        scored++;
    }

    logger.info("Scoring complete", { scored, excluded });
}

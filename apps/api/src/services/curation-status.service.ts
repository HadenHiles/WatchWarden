import { z } from "zod";
import { DEFAULT_CATALOGUE_STORAGE } from "@watchwarden/db";

export const CURATION_JOBS = ["trend-sync", "plex-library-sync", "tautulli-sync", "plex-sync", "rotation-cleanup", "download-priority", "catalogue-observe"] as const;

const priorityStatusSchema = z.object({
    checkedAt: z.string().datetime(), mode: z.enum(["observe", "apply"]),
    sabDemotions: z.number().int().min(0).max(100), torrentDemotions: z.number().int().min(0).max(100),
    torrentQueueing: z.boolean(), verified: z.boolean(),
});

const storagePolicySchema = z.object({
    maxStorageBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    movieReservationBytes: z.number().int().positive().nullable(),
    showReservationBytes: z.number().int().positive().nullable(),
});
const accountingSchema = z.object({ observedAt: z.string().datetime(), complete: z.boolean(),
    managedBytes: z.number().int().nonnegative(), reservedBytes: z.number().int().nonnegative(),
    managedTitles: z.number().int().nonnegative(), accountingBasis: z.literal("plex_logical_media_parts") });
const retentionReviewSchema = z.object({
    checkedAt: z.string().datetime(), complete: z.boolean(), mode: z.literal("review_only"), deletionAuthority: z.literal("reclaimerr"),
    items: z.array(z.object({ titleId: z.string().max(100), title: z.string().max(500), mediaType: z.enum(["MOVIE", "SHOW"]),
        decision: z.enum(["keep", "review", "retirement_candidate"]), reasons: z.array(z.string().max(80)).max(20),
        deletionAuthorized: z.literal(false), reviewKind: z.enum(["none", "investigation_required", "owner_decision"]) })).max(100),
});

interface Run {
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
}

interface Shelf {
    id: string;
    name: string;
    mediaType: string;
    shelfType: string;
    enabled: boolean;
    publishToHome: boolean;
    autoRequest: boolean;
    itemCount: number;
    lastSyncAt: Date | null;
}

export function curationStatus(
    jobs: Array<{ name: string; lastAttempt: Run | null; lastSuccess: Run | null }>,
    shelves: Shelf[],
    now = new Date(),
    downloadPriority: unknown = null,
    catalogue: { storagePolicy?: unknown; retentionReview?: unknown; storageEvidence?: unknown } = {},
) {
    if (shelves.length > 100) throw new Error("Curation status exceeds the 100-shelf limit");
    const priority = priorityStatusSchema.safeParse(downloadPriority);
    const storage = storagePolicySchema.safeParse({ ...DEFAULT_CATALOGUE_STORAGE, ...(catalogue.storagePolicy as object ?? {}) });
    const review = retentionReviewSchema.safeParse(catalogue.retentionReview);
    const accounting = accountingSchema.safeParse(catalogue.storageEvidence);
    return {
        version: 1,
        checkedAt: now.toISOString(),
        evidence: "recorded_job_outcomes",
        plexVerification: "not_live_verified",
        sourceFreshness: "not_verified",
        downloadPriority: priority.success ? { ...priority.data, policy: "watchwarden_only_demotion" } : null,
        catalogue: {
            storagePolicy: storage.success ? storage.data : null,
            accountingState: "not_verified", admission: "requires_fresh_accounting_and_reservation",
            accounting: accounting.success ? accounting.data : null,
            retentionReview: review.success ? { ...review.data, items: review.data.items.slice(0, 10),
                returnedItems: Math.min(review.data.items.length, 10), recordedItems: review.data.items.length } : null,
        },
        jobs: jobs.map(({ name, lastAttempt, lastSuccess }) => ({
            name,
            lastAttempt: lastAttempt ? {
                status: lastAttempt.status,
                startedAt: lastAttempt.startedAt.toISOString(),
                finishedAt: lastAttempt.finishedAt?.toISOString() ?? null,
            } : null,
            lastSuccessAt: lastSuccess?.finishedAt?.toISOString() ?? null,
        })),
        shelves: shelves.map((shelf) => ({
            id: shelf.id, name: shelf.name, mediaType: shelf.mediaType, shelfType: shelf.shelfType,
            enabled: shelf.enabled, publishToHome: shelf.publishToHome, autoRequest: shelf.autoRequest,
            itemCount: shelf.itemCount, lastSyncAt: shelf.lastSyncAt?.toISOString() ?? null,
        })),
    };
}
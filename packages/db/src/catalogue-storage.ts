import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./client";

export const DEFAULT_CATALOGUE_STORAGE = {
    maxStorageBytes: 1_000_000_000_000,
    movieReservationBytes: null,
    showReservationBytes: null,
};

interface Evidence { observedAt: Date; complete: boolean; managedBytes: number; reservedBytes: number }
type Admission = (evidence: Evidence | null, reservationBytes: number | null, maxStorageBytes: number) => { allowed: boolean; reason: string };

export async function reserveCatalogueStorage(
    titleId: string, mediaType: "MOVIE" | "SHOW", assess: Admission,
    db: Pick<PrismaClient, "$transaction"> = prisma,
): Promise<void> {
    await db.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(614621)`;
        const rows = await transaction.appSetting.findMany({ where: { key: { in: ["catalogue.storage", "catalogue.storageEvidence", "catalogue.reservations"] } } });
        const settings = new Map(rows.map((row) => [row.key, row.value as Prisma.JsonObject]));
        const policy = { ...DEFAULT_CATALOGUE_STORAGE, ...settings.get("catalogue.storage") };
        const snapshot = settings.get("catalogue.storageEvidence");
        const ledger = settings.get("catalogue.reservations");
        const reservations = ledger?.items ?? [];
        if (!Array.isArray(reservations) || reservations.length > 10000
            || reservations.some((item) => !item || typeof item !== "object" || Array.isArray(item)
                || typeof item.titleId !== "string" || !Number.isSafeInteger(item.bytes) || Number(item.bytes) <= 0)) {
            throw new Error("catalogue_reservations_invalid");
        }
        const held = reservations as Array<{ titleId: string; bytes: number; createdAt: string }>;
        if (held.some((item) => item.titleId === titleId)) throw new Error("catalogue_reservation_already_held");
        const reservation = mediaType === "MOVIE" ? policy.movieReservationBytes : policy.showReservationBytes;
        const evidence = snapshot ? {
            observedAt: new Date(String(snapshot.observedAt)), complete: snapshot.complete === true,
            managedBytes: typeof snapshot.managedBytes === "number" ? snapshot.managedBytes : Number.NaN,
            reservedBytes: held.reduce((total, item) => total + item.bytes, 0),
        } : null;
        const maximum = typeof policy.maxStorageBytes === "number" ? policy.maxStorageBytes : Number.NaN;
        const decision = assess(evidence, typeof reservation === "number" ? reservation : null, maximum);
        if (!decision.allowed) throw new Error(`catalogue_admission_blocked:${decision.reason}`);
        const value = { items: [...held, { titleId, bytes: Number(reservation), createdAt: new Date().toISOString() }] };
        await transaction.appSetting.upsert({ where: { key: "catalogue.reservations" },
            update: { value }, create: { key: "catalogue.reservations", category: "catalogue", value } });
    });
}
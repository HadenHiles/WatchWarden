import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, PrismaClient, reserveCatalogueStorage } from "@watchwarden/db";
import { assessStorageAdmission } from "@watchwarden/scoring";

function store(managedBytes: number | null, reservationBytes = 20_000_000_000) {
    const values: Record<string, unknown> = {
        "catalogue.storage": { maxStorageBytes: 1_000_000_000_000, movieReservationBytes: reservationBytes },
        ...(managedBytes === null ? {} : { "catalogue.storageEvidence": { observedAt: new Date().toISOString(), complete: true, managedBytes } }),
    };
    let tail = Promise.resolve();
    const transaction = {
        $queryRaw: async (parts: TemplateStringsArray) => { assert.match(parts.join(""), /pg_advisory_xact_lock/); },
        appSetting: {
            findMany: async () => Object.entries(values).map(([key, value]) => ({ key, value })),
            upsert: async (args: { where: { key: string }; update: { value: unknown } }) => { values[args.where.key] = args.update.value; },
        },
    } as unknown as Prisma.TransactionClient;
    const db = { $transaction: (callback: (client: Prisma.TransactionClient) => Promise<void>) => {
        const result = tail.then(() => callback(transaction));
        tail = result.then(() => undefined, () => undefined);
        return result;
    } } as unknown as Pick<PrismaClient, "$transaction">;
    return { db, values };
}

test("concurrent admissions cannot spend the same remaining budget twice", async () => {
    const { db, values } = store(980_000_000_000);
    const results = await Promise.allSettled([
        reserveCatalogueStorage("first", "MOVIE", assessStorageAdmission, db),
        reserveCatalogueStorage("second", "MOVIE", assessStorageAdmission, db),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.equal((values["catalogue.reservations"] as { items: unknown[] }).items.length, 1);
});

test("unknown storage blocks acquisition and duplicate held reservations are never reused", async () => {
    const unknown = store(null);
    await assert.rejects(reserveCatalogueStorage("first", "MOVIE", assessStorageAdmission, unknown.db), /storage_evidence_unknown/);
    const known = store(0);
    await reserveCatalogueStorage("first", "MOVIE", assessStorageAdmission, known.db);
    await assert.rejects(reserveCatalogueStorage("first", "MOVIE", assessStorageAdmission, known.db), /already_held/);
    await assert.rejects(reserveCatalogueStorage("show", "SHOW", assessStorageAdmission, known.db), /acquisition_size_unknown/);
});

test("malformed accounting is not coerced into an empty catalogue", async () => {
    const invalid = store(0);
    invalid.values["catalogue.storageEvidence"] = { observedAt: new Date().toISOString(), complete: true, managedBytes: null };
    await assert.rejects(reserveCatalogueStorage("first", "MOVIE", assessStorageAdmission, invalid.db), /storage_evidence_unknown/);
});
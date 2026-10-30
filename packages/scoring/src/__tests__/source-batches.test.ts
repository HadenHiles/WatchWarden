import { describe, expect, it } from "vitest";
import { selectCurrentSourceSnapshots } from "../source-batches";

describe("complete source batches", () => {
    const now = new Date("2026-10-29T12:00:00Z");
    const batch = { source: "provider_CA", snapshotAt: now.toISOString(), completedAt: now.toISOString(), count: 10 };
    it("removes departed titles even when the new batch has no locally available titles", () => {
        const rows = [{ source: "provider_CA", titleId: "old-hit", snapshotAt: new Date("2026-10-28T12:00:00Z") }];
        expect(selectCurrentSourceSnapshots(rows, [batch], now)).toEqual([]);
    });
    it("selects exact batch timestamps and never adopts unmarked history", () => {
        const rows = [{ source: "provider_CA", titleId: "current", snapshotAt: now },
            { source: "other", titleId: "unmarked", snapshotAt: now }];
        expect(selectCurrentSourceSnapshots(rows, [batch], now).map((row) => row.titleId)).toEqual(["current"]);
    });
    it("rejects stale markers and duplicate source claims", () => {
        expect(() => selectCurrentSourceSnapshots([], [{ ...batch, completedAt: "2026-10-26T12:00:00Z" }], now)).toThrow();
        expect(() => selectCurrentSourceSnapshots([], [batch, batch], now)).toThrow("Duplicate");
    });
});
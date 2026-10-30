import assert from "node:assert/strict";
import test from "node:test";
import { curationStatus } from "../curation-status.service";

const now = new Date("2026-10-29T12:00:00Z");

test("distinguishes a failed latest attempt from historical success without claiming live health", () => {
    const status = curationStatus([{
        name: "plex-sync",
        lastAttempt: { status: "FAILED", startedAt: now, finishedAt: now },
        lastSuccess: { status: "COMPLETED", startedAt: new Date("2026-10-28T12:00:00Z"), finishedAt: new Date("2026-10-28T12:01:00Z") },
    }], [], now);
    assert.equal(status.jobs[0].lastAttempt?.status, "FAILED");
    assert.equal(status.jobs[0].lastSuccessAt, "2026-10-28T12:01:00.000Z");
    assert.equal(status.plexVerification, "not_live_verified");
    assert.equal(status.sourceFreshness, "not_verified");
});

test("represents missing history as unknown and strips unapproved fields", () => {
    const shelf = { id: "shelf", name: "Top 10", mediaType: "MOVIE", shelfType: "CUSTOM", enabled: true,
        publishToHome: true, autoRequest: false, itemCount: 0, lastSyncAt: null, token: "secret", error: "/private/path" };
    const status = curationStatus([{ name: "plex-sync", lastAttempt: null, lastSuccess: null }], [shelf], now);
    assert.equal(status.jobs[0].lastAttempt, null);
    assert.equal(status.shelves[0].lastSyncAt, null);
    assert.doesNotMatch(JSON.stringify(status), /secret|private|token/);
});

test("refuses a truncated shelf inventory", () => {
    const shelf = { id: "shelf", name: "Top 10", mediaType: "MOVIE", shelfType: "CUSTOM", enabled: true,
        publishToHome: true, autoRequest: false, itemCount: 0, lastSyncAt: null };
    assert.throws(() => curationStatus([], Array(101).fill(shelf)), /100-shelf limit/);
});
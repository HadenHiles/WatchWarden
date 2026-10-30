import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorkerSchedules, workerEnvSchema } from "@watchwarden/config";

const env = workerEnvSchema.parse({ DATABASE_URL: "postgresql://test:test@localhost/test" });

test("worker loads saved UI schedules over environment defaults without needing Ops", () => {
    const resolved = resolveWorkerSchedules(env, { plexSyncCron: "*/10 * * * *", trendSyncCron: "0 */3 * * *" });
    assert.equal(resolved.PLEX_SYNC_CRON, "*/10 * * * *");
    assert.equal(resolved.TREND_SYNC_CRON, "0 */3 * * *");
    assert.equal(resolved.LIBRARY_SYNC_CRON, env.LIBRARY_SYNC_CRON);
    assert.equal(env.PLEX_SYNC_CRON, "10,40 * * * *");
    assert.equal(resolved.DOWNLOAD_PRIORITY_ENABLED, false);
});

test("missing saved settings preserve defaults and invalid values are explicit errors", () => {
    assert.deepEqual(resolveWorkerSchedules(env, null), env);
    for (const saved of [[], "bad", { plexSyncCron: null }, { plexSyncCron: "" }, { plexSyncCron: 3 }]) {
        assert.throws(() => resolveWorkerSchedules(env, saved), /schedule/i);
    }
    assert.equal(resolveWorkerSchedules(env, { DOWNLOAD_PRIORITY_ENABLED: true }).DOWNLOAD_PRIORITY_ENABLED, false);
});
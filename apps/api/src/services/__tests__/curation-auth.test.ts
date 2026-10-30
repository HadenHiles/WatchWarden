import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import express from "express";
import { requireAuth, requireCurationRead, requireCurationControl } from "../../middleware/auth";
import { errorHandler } from "../../middleware/error";

test("the curation credential permits only the exact status GET, never other reads or writes", async (context) => {
    const before = { admin: process.env.API_SECRET, read: process.env.CURATION_READ_TOKEN };
    const readToken = "read-only-".repeat(5);
    const adminToken = "admin-".repeat(8);
    process.env.API_SECRET = adminToken;
    process.env.CURATION_READ_TOKEN = readToken;
    context.after(() => {
        if (before.admin === undefined) delete process.env.API_SECRET; else process.env.API_SECRET = before.admin;
        if (before.read === undefined) delete process.env.CURATION_READ_TOKEN; else process.env.CURATION_READ_TOKEN = before.read;
    });
    const app = express();
    app.get("/plex/curation-status", requireCurationRead, (_req, res) => { res.json({ success: true }); });
    app.use(requireAuth);
    app.use((_req, res) => { res.json({ success: true }); });
    app.use(errorHandler);
    const server = app.listen(0, "127.0.0.1");
    context.after(() => { server.closeAllConnections(); server.close(); });
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const request = (path: string, method: string, token?: string) => fetch(`http://127.0.0.1:${address.port}${path}`, {
        method, headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    assert.equal((await request("/plex/curation-status", "GET", readToken)).status, 200);
    for (const [path, method] of [["/jobs", "GET"], ["/jobs/plex-sync/trigger", "POST"], ["/settings", "PATCH"], ["/plex/curation-status", "POST"]]) {
        assert.equal((await request(path, method, readToken)).status, 403);
    }
    assert.equal((await request("/plex/curation-status", "GET", "wrong")).status, 401);
    assert.equal((await request("/plex/curation-status", "GET")).status, 401);
    assert.equal((await request("/plex/curation-status", "GET", adminToken)).status, 200);
    assert.equal((await request("/settings", "PATCH", adminToken)).status, 200);
    process.env.API_SECRET = readToken;
    assert.equal((await request("/settings", "PATCH", readToken)).status, 403);
    delete process.env.CURATION_READ_TOKEN;
    assert.equal((await request("/plex/curation-status", "GET", adminToken)).status, 401);
});

test("the control token permits only refresh and Keep, never acquisition or deletion", async (context) => {
    const previous = process.env.CURATION_CONTROL_TOKEN;
    const token = "control-only-".repeat(4);
    process.env.CURATION_CONTROL_TOKEN = token;
    context.after(() => { if (previous === undefined) delete process.env.CURATION_CONTROL_TOKEN; else process.env.CURATION_CONTROL_TOKEN = previous; });
    const app = express();
    app.post("/plex/curation-refresh", requireCurationControl, (_req, res) => { res.json({ ok: true }); });
    app.post("/plex/retention/:titleId/keep", requireCurationControl, (_req, res) => { res.json({ ok: true }); });
    app.use(requireAuth);
    app.use((_req, res) => { res.json({ ok: true }); });
    app.use(errorHandler);
    const server = app.listen(0, "127.0.0.1");
    context.after(() => { server.closeAllConnections(); server.close(); });
    await once(server, "listening");
    const address = server.address(); assert.ok(address && typeof address !== "string");
    for (const [path, method, expected] of [
        ["/plex/curation-refresh", "POST", 200], ["/plex/retention/title123/keep", "POST", 200],
        ["/plex/retention/title123/delete", "POST", 403], ["/requests", "POST", 403],
        ["/settings", "PATCH", 403], ["/jobs/plex-sync/trigger", "POST", 403], ["/jobs", "GET", 403],
    ] as const) {
        const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
        assert.equal(response.status, expected);
    }
});
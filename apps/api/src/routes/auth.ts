import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import type { ApiEnv } from "@watchwarden/config";
import { prisma } from "@watchwarden/db";
import { TautulliClient, JellyseerrClient } from "@watchwarden/integrations";
import { AppError } from "../middleware/error";
import { z } from "zod";

const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
});

/** Verifies the Authorization: Bearer <API_SECRET> header. */
function hasApiSecret(req: Request): boolean {
    const token = req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : null;
    return !!token && token === process.env.API_SECRET;
}

export function authRouter(env: ApiEnv) {
    const router = Router();

    // ── GET /auth/setup-status ─────────────────────────────────────────────
    // Fully public — used by the onboarding wizard and dashboard layout guard.
    router.get("/setup-status", async (_req: Request, res: Response) => {
        const setting = await prisma.appSetting.findUnique({ where: { key: "setup.complete" } });
        res.json({ success: true, data: { complete: setting?.value === true } });
    });

    // ── GET /auth/admin-username ───────────────────────────────────────────
    // Public — returns the admin username from DB or env so the login page
    // can display it as a hint without exposing the password hash.
    router.get("/admin-username", async (_req: Request, res: Response) => {
        const creds = await prisma.appSetting.findUnique({ where: { key: "admin.credentials" } });
        const username =
            creds?.value && typeof creds.value === "object"
                ? (creds.value as { username: string }).username
                : env.ADMIN_USERNAME;
        res.json({ success: true, data: { username } });
    });

    // ── POST /auth/setup ───────────────────────────────────────────────────
    // One-time first-run setup.  Requires API_SECRET bearer token (injected
    // server-side by the Next.js /api/setup/submit route — never from browser).
    // Fails with 409 if setup is already complete.
    router.post("/setup", async (req: Request, res: Response) => {
        if (!hasApiSecret(req)) {
            return res.status(401).json({ success: false, error: "Unauthorized" });
        }

        const existing = await prisma.appSetting.findUnique({ where: { key: "setup.complete" } });
        if (existing?.value === true) {
            return res.status(409).json({ success: false, error: "Setup is already complete" });
        }

        const { admin, tautulli, jellyseerr, sources, refreshIntervals } = req.body as {
            admin?: { username?: string; password?: string };
            tautulli?: { baseUrl?: string; apiKey?: string };
            jellyseerr?: { baseUrl?: string; apiKey?: string; botUserId?: number };
            sources?: { tmdbApiKey?: string; traktClientId?: string };
            refreshIntervals?: Record<string, string>;
        };

        if (!admin?.username || !admin?.password) {
            return res.status(400).json({ success: false, error: "Admin username and password are required" });
        }
        if (admin.password.length < 8) {
            return res.status(400).json({ success: false, error: "Password must be at least 8 characters" });
        }

        const passwordHash = await bcrypt.hash(admin.password, 12);

        type UpsertArg = Parameters<typeof prisma.appSetting.upsert>[0];
        const writes: UpsertArg[] = [
            {
                where: { key: "admin.credentials" },
                update: { value: { username: admin.username, passwordHash } as object },
                create: { key: "admin.credentials", value: { username: admin.username, passwordHash } as object, category: "system" },
            },
        ];

        if (tautulli?.baseUrl || tautulli?.apiKey) {
            writes.push({
                where: { key: "tautulli" },
                update: { value: tautulli as object },
                create: { key: "tautulli", value: tautulli as object, category: "integrations" },
            });
        }

        if (jellyseerr?.baseUrl || jellyseerr?.apiKey) {
            writes.push({
                where: { key: "jellyseerr" },
                update: { value: jellyseerr as object },
                create: { key: "jellyseerr", value: jellyseerr as object, category: "integrations" },
            });
        }

        if (sources?.tmdbApiKey || sources?.traktClientId) {
            writes.push({
                where: { key: "sources" },
                update: { value: sources as object },
                create: { key: "sources", value: sources as object, category: "integrations" },
            });
        }

        if (refreshIntervals && Object.keys(refreshIntervals).length > 0) {
            writes.push({
                where: { key: "refreshIntervals" },
                update: { value: refreshIntervals as object },
                create: { key: "refreshIntervals", value: refreshIntervals as object, category: "scheduler" },
            });
        }

        writes.push({
            where: { key: "setup.complete" },
            update: { value: true as unknown as object },
            create: { key: "setup.complete", value: true as unknown as object, category: "system" },
        });

        await prisma.$transaction(writes.map((args) => prisma.appSetting.upsert(args)));

        res.json({ success: true });
    });

    // ── POST /auth/test-connection ─────────────────────────────────────────
    // Called during onboarding (server-side, with API_SECRET) to verify
    // Tautulli / Jellyseerr credentials before saving them.
    router.post("/test-connection", async (req: Request, res: Response) => {
        if (!hasApiSecret(req)) {
            return res.status(401).json({ success: false, error: "Unauthorized" });
        }

        const { type, baseUrl, apiKey } = req.body as { type: string; baseUrl: string; apiKey: string };

        if (!type || !baseUrl || !apiKey) {
            return res.status(400).json({ success: false, error: "type, baseUrl, and apiKey are required" });
        }

        if (type === "tautulli") {
            try {
                const client = new TautulliClient({ baseUrl, apiKey, timeout: 8_000 });
                const ok = await client.healthCheck();
                return res.json({ success: ok, message: ok ? "Connected successfully" : "Connection failed" });
            } catch (e) {
                return res.json({ success: false, message: String(e) });
            }
        }

        if (type === "jellyseerr") {
            try {
                const client = new JellyseerrClient({ baseUrl, apiKey, timeout: 8_000 });
                const health = await client.healthCheck();
                return res.json({
                    success: health.healthy,
                    message: health.healthy
                        ? `Connected — Jellyseerr v${health.version}`
                        : (health.error ?? "Connection failed"),
                });
            } catch (e) {
                return res.json({ success: false, message: String(e) });
            }
        }

        return res.status(400).json({ success: false, error: `Unknown type: ${type}` });
    });

    // ── POST /auth/login ───────────────────────────────────────────────────
    // Checks DB admin.credentials first; falls back to env vars.
    router.post("/login", async (req: Request, res: Response) => {
        const result = loginSchema.safeParse(req.body);
        if (!result.success) {
            throw new AppError(400, "Username and password required");
        }

        const { username, password } = result.data;

        // Prefer credentials stored during onboarding over env vars
        const dbCreds = await prisma.appSetting.findUnique({ where: { key: "admin.credentials" } });
        let expectedUsername: string;
        let expectedHash: string;

        if (dbCreds?.value && typeof dbCreds.value === "object") {
            const c = dbCreds.value as { username: string; passwordHash: string };
            expectedUsername = c.username;
            expectedHash = c.passwordHash;
        } else {
            expectedUsername = env.ADMIN_USERNAME;
            expectedHash = env.ADMIN_PASSWORD_HASH;
        }

        if (username !== expectedUsername) {
            throw new AppError(401, "Invalid credentials", "INVALID_CREDENTIALS");
        }

        const valid = await bcrypt.compare(password, expectedHash);
        if (!valid) {
            throw new AppError(401, "Invalid credentials", "INVALID_CREDENTIALS");
        }

        req.session.adminAuthenticated = true;
        req.session.userId = username;

        return res.json({ success: true, data: { username } });
    });

    // ── POST /auth/logout ──────────────────────────────────────────────────
    router.post("/logout", (req: Request, res: Response) => {
        req.session.destroy(() => {
            res.json({ success: true });
        });
    });

    // ── GET /auth/me ───────────────────────────────────────────────────────
    router.get("/me", (req: Request, res: Response) => {
        if (!req.session.adminAuthenticated) {
            return res.status(401).json({ success: false, error: "Not authenticated" });
        }
        return res.json({ success: true, data: { username: req.session.userId } });
    });

    return router;
}

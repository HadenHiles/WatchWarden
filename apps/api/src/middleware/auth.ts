import type { Request, Response, NextFunction } from "express";
import { AppError } from "./error";
import { timingSafeEqual } from "node:crypto";

function matchesSecret(token: string, expected: string | undefined): boolean {
    if (!expected) return false;
    const actual = Buffer.from(token);
    const secret = Buffer.from(expected);
    return actual.length === secret.length && timingSafeEqual(actual, secret);
}

export function requireCurationRead(req: Request, res: Response, next: NextFunction) {
    const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
    const expected = process.env.CURATION_READ_TOKEN;
    if (req.method === "GET" && req.path === "/plex/curation-status" && expected && expected.length >= 32 && matchesSecret(token, expected)) {
        return next();
    }
    return requireAuth(req, res, next);
}

// Extend the session type to carry our admin auth flag
declare module "express-session" {
    interface SessionData {
        adminAuthenticated?: boolean;
        userId?: string;
    }
}

/**
 * Middleware: requires a valid admin session OR a valid Bearer API secret.
 * Allows service-to-service calls (worker → api) using API_SECRET.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
    // Allow Bearer token for service-to-service calls
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        if (matchesSecret(token, process.env.CURATION_READ_TOKEN)) {
            throw new AppError(403, "Curation token is read-only and endpoint-scoped", "CURATION_SCOPE_DENIED");
        }
        if (matchesSecret(token, process.env.API_SECRET)) {
            return next();
        }
        throw new AppError(401, "Invalid API secret", "INVALID_API_SECRET");
    }

    // Check session-based admin auth
    if (req.session?.adminAuthenticated) {
        return next();
    }

    throw new AppError(401, "Authentication required", "UNAUTHENTICATED");
}

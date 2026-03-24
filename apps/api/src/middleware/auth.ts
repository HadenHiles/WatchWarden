import type { Request, Response, NextFunction } from "express";
import { AppError } from "./error";

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
export function requireAuth(req: Request, res: Response, next: NextFunction) {
    // Allow Bearer token for service-to-service calls
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        if (token === process.env.API_SECRET) {
            return next();
        }
        throw new AppError(401, "Invalid API secret", "INVALID_API_SECRET");
    }

    // Check session-based admin auth
    if (req.session.adminAuthenticated) {
        return next();
    }

    throw new AppError(401, "Authentication required", "UNAUTHENTICATED");
}

import type { Request, Response, NextFunction } from "express";
import { createLogger } from "@watchwarden/config";

const logger = createLogger("api-error");

export class AppError extends Error {
    constructor(
        public readonly statusCode: number,
        message: string,
        public readonly code?: string
    ) {
        super(message);
        this.name = "AppError";
    }
}

/** Wraps async route handlers so rejections are forwarded to Express's error handler. */
export function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
    return (req: Request, res: Response, next: NextFunction): void => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            error: err.message,
            code: err.code,
        });
    }

    // Zod validation errors are passed through as 400
    if (err.name === "ZodError") {
        return res.status(400).json({ success: false, error: "Validation error", details: err });
    }

    logger.error("Unhandled error", { name: err.name, message: err.message, stack: err.stack });

    return res.status(500).json({
        success: false,
        error: "Internal server error",
    });
}

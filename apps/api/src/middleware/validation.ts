import { ZodSchema } from "zod";
import type { Request, Response, NextFunction } from "express";

/**
 * Validates req.body against a Zod schema.
 * Returns 400 with validation details on failure.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: "Validation error",
                details: result.error.flatten(),
            });
        }
        req.body = result.data;
        return next();
    };
}

/**
 * Validates req.query against a Zod schema.
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.query);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: "Validation error",
                details: result.error.flatten(),
            });
        }
        req.query = result.data as typeof req.query;
        return next();
    };
}

import { z } from "zod";

// ─── Environment schema ───────────────────────────────────────────────────────
// Validates all required environment variables at startup.
// Call validateEnv() once at the top of each service entry point.
// ─────────────────────────────────────────────────────────────────────────────

const baseEnvSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    LOG_LEVEL: z.enum(["error", "warn", "info", "http", "debug"]).default("info"),
    DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL connection string"),
    EXPORT_OUTPUT_DIR: z.string().default("./exports"),
});

// Default password hash is bcrypt of "password" (12 rounds).
// The app forces a change on first login — this is only the bootstrap credential.
const DEFAULT_PASSWORD_HASH = "$2a$12$k.s9xneegzdTGzbkhsQQqeQUISf8KqCfuIM6axc3zDwKR71Mvgwn.";
// Default secrets are intentionally weak — a warning is logged at startup in production.
const DEFAULT_SESSION_SECRET = "watch-warden-default-session-secret-change-me!!";
const DEFAULT_API_SECRET = "watch-warden-default-api-secret-change!!";

export const apiEnvSchema = baseEnvSchema.extend({
    PORT: z.coerce.number().int().positive().default(4000),
    SESSION_SECRET: z.string().min(32).default(DEFAULT_SESSION_SECRET),
    API_SECRET: z.string().min(16).default(DEFAULT_API_SECRET),
    ADMIN_USERNAME: z.string().min(1).default("admin"),
    ADMIN_PASSWORD_HASH: z.string().min(1).default(DEFAULT_PASSWORD_HASH),
    TAUTULLI_BASE_URL: z.string().url().optional(),
    TAUTULLI_API_KEY: z.string().optional(),
    JELLYSEERR_BASE_URL: z.string().url().optional(),
    JELLYSEERR_API_KEY: z.string().optional(),
    JELLYSEERR_BOT_USER_ID: z.coerce.number().int().positive().optional(),
});

export const workerEnvSchema = baseEnvSchema.extend({
    TAUTULLI_BASE_URL: z.string().url().optional(),
    TAUTULLI_API_KEY: z.string().optional(),
    JELLYSEERR_BASE_URL: z.string().url().optional(),
    JELLYSEERR_API_KEY: z.string().optional(),
    JELLYSEERR_BOT_USER_ID: z.coerce.number().int().positive().optional(),
    PLEX_BASE_URL: z.string().url().optional(),
    PLEX_TOKEN: z.string().optional(),
    TMDB_API_KEY: z.string().optional(),
    TRAKT_CLIENT_ID: z.string().optional(),
    TREND_SYNC_CRON: z.string().default("0 */6 * * *"),
    TAUTULLI_SYNC_CRON: z.string().default("0 */2 * * *"),
    SCORING_CRON: z.string().default("30 */6 * * *"),
    JELLYSEERR_STATUS_SYNC_CRON: z.string().default("0 * * * *"),
    LIBRARY_SYNC_CRON: z.string().default("0 */3 * * *"),
    LIFECYCLE_EVAL_CRON: z.string().default("0 4 * * *"),
    EXPORT_CRON: z.string().default("15 */6 * * *"),
    PLEX_LIBRARY_SYNC_CRON: z.string().default("0 */4 * * *"),
    PLEX_SYNC_CRON: z.string().default("45 */6 * * *"),
});

export const webEnvSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    API_URL: z.string().url().default("http://localhost:4000"),
    API_SECRET: z.string().min(16).default(DEFAULT_API_SECRET),
    ADMIN_USERNAME: z.string().min(1).default("admin"),
    ADMIN_PASSWORD_HASH: z.string().min(1).default(DEFAULT_PASSWORD_HASH),
    SESSION_SECRET: z.string().min(32).default(DEFAULT_SESSION_SECRET),
    NEXT_PUBLIC_APP_NAME: z.string().default("Watch Warden"),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
export type WebEnv = z.infer<typeof webEnvSchema>;

/**
 * Validates environment variables against the given schema and returns the
 * parsed result.  Throws a descriptive error and exits with code 1 on failure
 * so misconfigured containers fail loudly at startup.
 */
export function validateEnv<T extends z.ZodTypeAny>(schema: T): z.infer<T> {
    const result = schema.safeParse(process.env);
    if (!result.success) {
        const issues = result.error.issues
            .map((i: { path: (string | number)[]; message: string }) => `  • ${i.path.join(".")}: ${i.message}`)
            .join("\n");
        console.error(`[Watch Warden] Environment validation failed:\n${issues}`);
        process.exit(1);
    }
    return result.data as z.infer<T>;
}

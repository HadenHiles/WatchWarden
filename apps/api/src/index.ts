import { validateEnv, apiEnvSchema } from "@watchwarden/config";
import { createApp } from "./app";
import { createLogger } from "@watchwarden/config";

// Validate environment variables before anything else
const env = validateEnv(apiEnvSchema);

const logger = createLogger("api");

if (env.NODE_ENV === "production") {
    const DEFAULT_SESSION = "watch-warden-default-session-secret-change-me!!";
    const DEFAULT_API = "watch-warden-default-api-secret-change!!";
    if (env.SESSION_SECRET === DEFAULT_SESSION || env.API_SECRET === DEFAULT_API) {
        logger.warn(
            "⚠️  Running with default secrets in production. Set SESSION_SECRET and API_SECRET in your environment for security."
        );
    }
}

const app = createApp(env);

app.listen(env.PORT, () => {
    logger.info(`Watch Warden API listening on port ${env.PORT}`, {
        env: env.NODE_ENV,
        port: env.PORT,
    });
});

// Graceful shutdown
process.on("SIGTERM", () => {
    logger.info("SIGTERM received, shutting down gracefully");
    process.exit(0);
});

process.on("SIGINT", () => {
    logger.info("SIGINT received, shutting down gracefully");
    process.exit(0);
});

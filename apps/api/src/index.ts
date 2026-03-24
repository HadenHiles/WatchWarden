import { validateEnv, apiEnvSchema } from "@watchwarden/config";
import { createApp } from "./app";
import { createLogger } from "@watchwarden/config";

// Validate environment variables before anything else
const env = validateEnv(apiEnvSchema);

const logger = createLogger("api");

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

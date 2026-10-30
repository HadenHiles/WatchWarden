import { validateEnv, workerEnvSchema, createLogger, resolveWorkerSchedules } from "@watchwarden/config";
import { prisma } from "@watchwarden/db";
import { buildScheduler } from "./scheduler";

const env = validateEnv(workerEnvSchema);
const logger = createLogger("worker");

async function main() {
    logger.info("Watch Warden Worker starting...", { env: env.NODE_ENV });
    const saved = await prisma.appSetting.findUnique({ where: { key: "refreshIntervals" }, select: { value: true } });
    const scheduler = buildScheduler(resolveWorkerSchedules(env, saved?.value));
    scheduler.start();
    logger.info("Scheduler started. Worker is running.");
}

main().catch((err) => {
    console.error("Worker startup failed:", err);
    process.exit(1);
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

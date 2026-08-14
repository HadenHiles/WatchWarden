import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { ApiEnv } from "@watchwarden/config";
import { createLogger } from "@watchwarden/config";
import { errorHandler } from "./middleware/error";
import { createRouter } from "./routes";

const logger = createLogger("api-app");

export function createApp(env: ApiEnv) {
    const app = express();

    if (env.NODE_ENV === "production") {
        // Cloudflare / reverse proxies terminate TLS before forwarding to Express.
        // Trust the first proxy so secure session cookies are issued correctly.
        app.set("trust proxy", 1);
    }

    // ── Security headers ───────────────────────────────────────────────────────
    app.use(helmet());

    // ── CORS ───────────────────────────────────────────────────────────────────
    // In production, restrict to the web app's origin.
    const allowedOrigins =
        env.NODE_ENV === "production"
            ? [process.env.NEXTAUTH_URL ?? "http://localhost:3000"]
            : ["http://localhost:3000", "http://127.0.0.1:3000"];

    app.use(
        cors({
            origin: allowedOrigins,
            credentials: true,
        })
    );

    // ── Request parsing ────────────────────────────────────────────────────────
    app.use(express.json({ limit: "1mb" }));
    app.use(express.urlencoded({ extended: false }));

    // ── HTTP logging ───────────────────────────────────────────────────────────
    if (env.NODE_ENV !== "test") {
        app.use(
            morgan("combined", {
                stream: { write: (msg) => logger.http(msg.trim()) },
            })
        );
    }

    // ── Session ────────────────────────────────────────────────────────────────
    const PostgresSessionStore = connectPgSimple(session);
    app.use(
        session({
            store: new PostgresSessionStore({
                conString: env.DATABASE_URL,
                createTableIfMissing: true,
            }),
            secret: env.SESSION_SECRET,
            resave: false,
            saveUninitialized: false,
            cookie: {
                httpOnly: true,
                secure: env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge: 8 * 60 * 60 * 1000, // 8 hours
            },
        })
    );

    // ── Routes ─────────────────────────────────────────────────────────────────
    app.use("/", createRouter(env));

    // ── Error handler (must be last) ───────────────────────────────────────────
    app.use(errorHandler);

    return app;
}

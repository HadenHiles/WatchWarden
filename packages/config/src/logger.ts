import winston from "winston";

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

const devFormat = combine(
    colorize(),
    timestamp({ format: "HH:mm:ss" }),
    errors({ stack: true }),
    printf((info) => {
        const { level, message, timestamp: ts, service, ...meta } = info as {
            level: string;
            message: string;
            timestamp?: string;
            service?: string;
            [key: string]: unknown;
        };
        const svc = service ? `[${String(service)}] ` : "";
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
        return `${String(ts)} ${level}: ${svc}${String(message)}${metaStr}`;
    })
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

export function createLogger(service: string) {
    const logLevel = process.env.LOG_LEVEL ?? "info";
    const isDev = process.env.NODE_ENV !== "production";

    return winston.createLogger({
        level: logLevel,
        defaultMeta: { service },
        format: isDev ? devFormat : prodFormat,
        transports: [new winston.transports.Console()],
    });
}

// Default root logger — services should create their own with a service label.
export const logger = createLogger("watchwarden");

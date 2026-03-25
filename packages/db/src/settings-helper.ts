import { prisma } from "./client";

export interface IntegrationConfig {
    tautulli: { baseUrl: string | null; apiKey: string | null };
    jellyseerr: { baseUrl: string | null; apiKey: string | null; botUserId: number | null };
    sources: { tmdbApiKey: string | null; traktClientId: string | null };
}

/**
 * Reads integration credentials from DB AppSetting rows, falling back to
 * environment variables.  Called at job execution time so credentials configured
 * via the onboarding wizard are used without restarting the worker.
 */
export async function getIntegrationConfig(): Promise<IntegrationConfig> {
    const rows = await prisma.appSetting.findMany({
        where: { key: { in: ["tautulli", "jellyseerr", "sources"] } },
    });
    const db = Object.fromEntries(rows.map((r) => [r.key, r.value as Record<string, unknown>]));

    const t = db.tautulli as { baseUrl?: string; apiKey?: string } | undefined;
    const j = db.jellyseerr as { baseUrl?: string; apiKey?: string; botUserId?: number } | undefined;
    const s = db.sources as { tmdbApiKey?: string; traktClientId?: string } | undefined;

    return {
        tautulli: {
            baseUrl: t?.baseUrl || process.env.TAUTULLI_BASE_URL || null,
            apiKey: t?.apiKey || process.env.TAUTULLI_API_KEY || null,
        },
        jellyseerr: {
            baseUrl: j?.baseUrl || process.env.JELLYSEERR_BASE_URL || null,
            apiKey: j?.apiKey || process.env.JELLYSEERR_API_KEY || null,
            botUserId:
                j?.botUserId ??
                (process.env.JELLYSEERR_BOT_USER_ID
                    ? parseInt(process.env.JELLYSEERR_BOT_USER_ID, 10)
                    : null),
        },
        sources: {
            tmdbApiKey: s?.tmdbApiKey || process.env.TMDB_API_KEY || null,
            traktClientId: s?.traktClientId || process.env.TRAKT_CLIENT_ID || null,
        },
    };
}

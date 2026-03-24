import type { MediaType } from "./media";

// ─── App settings ─────────────────────────────────────────────────────────────

export interface ScoreWeightSettings {
    externalTrendScore: number;
    localInterestScore: number;
    freshnessScore: number;
    editorialBoost: number;
}

export interface ExclusionSettings {
    excludeInLibrary: boolean;
    excludeAlreadyRequested: boolean;
    excludePermanentlyRejected: boolean;
}

export interface RetentionDefaults {
    movies: {
        lifecyclePolicy: "PERMANENT" | "TEMPORARY_TRENDING" | "WATCH_AND_EXPIRE";
        keepUntilDays: number | null;
    };
    shows: {
        lifecyclePolicy: "PERMANENT" | "TEMPORARY_TRENDING" | "WATCH_AND_EXPIRE";
        keepUntilDays: number | null;
    };
}

export interface JellyseerrDefaultsPerType {
    rootFolder: string | null;
    qualityProfileId: number | null;
    requestMode: "auto" | "manual";
}

export interface JellyseerrSettings {
    baseUrl: string;
    apiKey: string;
    botUserId: number;
    movieDefaults: JellyseerrDefaultsPerType;
    showDefaults: JellyseerrDefaultsPerType;
}

export interface TautulliSettings {
    baseUrl: string;
    apiKey: string;
}

export interface AppSettings {
    tautulli: TautulliSettings;
    jellyseerr: JellyseerrSettings;
    exportOutputDir: string;
    scoreWeights: ScoreWeightSettings;
    enabledRegions: Array<"US" | "CA">;
    exclusions: ExclusionSettings;
    retention: RetentionDefaults;
    refreshIntervals: {
        trendSyncCron: string;
        tautulliSyncCron: string;
        scoringCron: string;
        jellyseerrStatusSyncCron: string;
        librarySyncCron: string;
        lifecycleEvalCron: string;
        exportCron: string;
    };
}

// ─── Source config ────────────────────────────────────────────────────────────

export interface SourceConfig {
    id: string;
    sourceId: string;
    sourceName: string;
    enabled: boolean;
    region: string | null;
    mediaType: MediaType | null;
    config: Record<string, unknown>;
    lastSyncAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

// ─── Individual AppSetting row (key-value store) ─────────────────────────────

export interface AppSetting {
    id: string;
    key: string;
    value: unknown;
    category: string;
    updatedAt: Date;
}

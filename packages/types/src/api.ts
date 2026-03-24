// ─── API response envelopes ─────────────────────────────────────────────────

export interface ApiSuccess<T> {
    success: true;
    data: T;
}

export interface ApiError {
    success: false;
    error: string;
    code?: string;
    details?: unknown;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Paginated list response ─────────────────────────────────────────────────

export interface PaginatedList<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

// ─── Audit log entry ─────────────────────────────────────────────────────────

export interface AuditLogEntry {
    id: string;
    action: string;
    entityType: string | null;
    entityId: string | null;
    titleId: string | null;
    details: Record<string, unknown> | null;
    userId: string | null;
    createdAt: Date;
    title?: { title: string; mediaType: string } | null;
}

// ─── Export artifact metadata ─────────────────────────────────────────────────

export interface PublishedExport {
    id: string;
    exportType: string;
    filePath: string;
    itemCount: number;
    generatedAt: Date;
    metadata: Record<string, unknown> | null;
}

// ─── Kometa export item shape ─────────────────────────────────────────────────

export interface KometaExportItem {
    tmdbId: number | null;
    tvdbId: number | null;
    imdbId: string | null;
    title: string;
    year: number | null;
    mediaType: "MOVIE" | "SHOW";
    lifecyclePolicy: string;
    status: string;
    keepUntil: string | null;
    cleanupEligible: boolean;
    isPinned: boolean;
}

export interface KometaExportFile {
    exportType: string;
    generatedAt: string;
    itemCount: number;
    items: KometaExportItem[];
}

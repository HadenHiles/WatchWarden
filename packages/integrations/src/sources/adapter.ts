import type { SourceTrendItem } from "@watchwarden/types";

/**
 * Common interface all external trend source adapters must implement.
 * Adapters should ONLY fetch and normalize data — no business logic inside.
 */
export interface SourceAdapter {
    /** Unique identifier for this source (used in SourceConfig.sourceId) */
    readonly sourceId: string;
    /** Human-readable display name */
    readonly sourceName: string;
    /** Fetch the current trending items from this source */
    fetchTrending(): Promise<SourceTrendItem[]>;
}

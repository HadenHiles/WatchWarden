import axios, { AxiosInstance, AxiosError } from "axios";
import { createLogger } from "@watchwarden/config";

const logger = createLogger("plex-client");

export interface PlexClientConfig {
    baseUrl: string;
    token: string;
    /** Request timeout in milliseconds (default: 15000) */
    timeout?: number;
}

export interface PlexSection {
    key: string;
    title: string;
    type: "movie" | "show" | "artist" | "photo";
    agent: string;
    language: string;
}

export interface PlexMediaItem {
    ratingKey: string;
    title: string;
    year?: number;
    type: "movie" | "show" | "episode";
    guids: Array<{ id: string }>; // e.g. { id: "tmdb://12345" }
}

export interface PlexCollection {
    ratingKey: string;
    title: string;
    type: string;
    leafCount?: number;
    childCount?: number;
}

export interface PlexIdentity {
    machineIdentifier: string;
    version: string;
}

// Plex type codes used as query parameters
const PLEX_TYPE_MOVIE = 1;
const PLEX_TYPE_SHOW = 2;

export class PlexClient {
    private readonly http: AxiosInstance;
    private readonly baseUrl: string;

    constructor(config: PlexClientConfig) {
        this.baseUrl = config.baseUrl.replace(/\/$/, "");

        this.http = axios.create({
            baseURL: this.baseUrl,
            timeout: config.timeout ?? 15_000,
            headers: {
                "Accept": "application/json",
                "X-Plex-Token": config.token,
                "X-Plex-Client-Identifier": "watchwarden",
                "X-Plex-Product": "WatchWarden",
                "X-Plex-Version": "1.0.0",
            },
        });
    }

    private handleError(context: string, err: unknown): never {
        if (err instanceof AxiosError) {
            logger.error(`Plex API error [${context}]`, {
                status: err.response?.status,
                message: err.message,
            });
            throw new Error(
                `Plex ${context} failed (HTTP ${err.response?.status ?? "N/A"}): ${err.message}`
            );
        }
        throw err;
    }

    // ── Identity & health ─────────────────────────────────────────────────────

    async getIdentity(): Promise<PlexIdentity> {
        try {
            const res = await this.http.get<{ MediaContainer: { machineIdentifier: string; version: string } }>(
                "/identity"
            );
            return {
                machineIdentifier: res.data.MediaContainer.machineIdentifier,
                version: res.data.MediaContainer.version,
            };
        } catch (err) {
            this.handleError("getIdentity", err);
        }
    }

    async healthCheck(): Promise<{ healthy: boolean; version?: string; error?: string }> {
        try {
            const identity = await this.getIdentity();
            return { healthy: true, version: identity.version };
        } catch (err) {
            return { healthy: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    // ── Library sections ──────────────────────────────────────────────────────

    async getSections(): Promise<PlexSection[]> {
        try {
            const res = await this.http.get<{
                MediaContainer: { Directory: Array<{ key: string; title: string; type: string; agent: string; language: string }> };
            }>("/library/sections");
            const dirs = res.data.MediaContainer.Directory ?? [];
            return dirs.map((d) => ({
                key: d.key,
                title: d.title,
                type: d.type as PlexSection["type"],
                agent: d.agent,
                language: d.language,
            }));
        } catch (err) {
            this.handleError("getSections", err);
        }
    }

    // ── Library items (bulk, paginated) ───────────────────────────────────────

    /**
     * Fetches all items in a library section.
     * Returns ratingKey + GUIDs for each item so they can be matched to TMDB IDs.
     */
    async getAllItemsInSection(
        sectionId: string,
        mediaType: "movie" | "show"
    ): Promise<PlexMediaItem[]> {
        const plexType = mediaType === "movie" ? PLEX_TYPE_MOVIE : PLEX_TYPE_SHOW;
        const pageSize = 300;
        let offset = 0;
        const allItems: PlexMediaItem[] = [];

        while (true) {
            try {
                const res = await this.http.get<{
                    MediaContainer: {
                        totalSize?: number;
                        size: number;
                        Metadata?: Array<{
                            ratingKey: string;
                            title: string;
                            year?: number;
                            type: string;
                            Guid?: Array<{ id: string }>;
                        }>;
                    };
                }>(`/library/sections/${sectionId}/all`, {
                    headers: {
                        "X-Plex-Container-Start": String(offset),
                        "X-Plex-Container-Size": String(pageSize),
                    },
                    params: { type: plexType },
                });

                const container = res.data.MediaContainer;
                const items = container.Metadata ?? [];

                for (const item of items) {
                    allItems.push({
                        ratingKey: item.ratingKey,
                        title: item.title,
                        year: item.year,
                        type: item.type as PlexMediaItem["type"],
                        guids: item.Guid ?? [],
                    });
                }

                if (items.length < pageSize) break;
                offset += pageSize;
            } catch (err) {
                this.handleError(`getAllItemsInSection(${sectionId})`, err);
            }
        }

        return allItems;
    }

    // ── Collections ───────────────────────────────────────────────────────────

    async getCollections(sectionId: string): Promise<PlexCollection[]> {
        try {
            const res = await this.http.get<{
                MediaContainer: {
                    Metadata?: Array<{
                        ratingKey: string;
                        title: string;
                        type: string;
                        leafCount?: number;
                        childCount?: number;
                    }>;
                };
            }>(`/library/sections/${sectionId}/collections`);
            const items = res.data.MediaContainer.Metadata ?? [];
            return items.map((c) => ({
                ratingKey: c.ratingKey,
                title: c.title,
                type: c.type,
                leafCount: c.leafCount,
                childCount: c.childCount,
            }));
        } catch (err) {
            this.handleError(`getCollections(${sectionId})`, err);
        }
    }

    async getCollectionItems(collectionId: string): Promise<PlexMediaItem[]> {
        try {
            const res = await this.http.get<{
                MediaContainer: {
                    Metadata?: Array<{
                        ratingKey: string;
                        title: string;
                        year?: number;
                        type: string;
                        Guid?: Array<{ id: string }>;
                    }>;
                };
            }>(`/library/collections/${collectionId}/children`);
            const items = res.data.MediaContainer.Metadata ?? [];
            return items.map((item) => ({
                ratingKey: item.ratingKey,
                title: item.title,
                year: item.year,
                type: item.type as PlexMediaItem["type"],
                guids: item.Guid ?? [],
            }));
        } catch (err) {
            this.handleError(`getCollectionItems(${collectionId})`, err);
        }
    }

    /**
     * Creates a new collection, seeded with one initial item.
     * Returns the new collection's ratingKey.
     */
    async createCollection(params: {
        sectionId: string;
        title: string;
        mediaType: "movie" | "show";
        machineIdentifier: string;
        initialItemRatingKey: string;
    }): Promise<string> {
        const { sectionId, title, mediaType, machineIdentifier, initialItemRatingKey } = params;
        const plexType = mediaType === "movie" ? PLEX_TYPE_MOVIE : PLEX_TYPE_SHOW;
        const uri = `server://${machineIdentifier}/com.plexapp.plugins.library/library/metadata/${initialItemRatingKey}`;

        try {
            const res = await this.http.post<{
                MediaContainer: { Metadata?: Array<{ ratingKey: string }> };
            }>("/library/collections", null, {
                params: {
                    type: plexType,
                    title,
                    smart: 0,
                    sectionId,
                    uri,
                },
            });

            const created = res.data.MediaContainer.Metadata?.[0];
            if (!created?.ratingKey) {
                throw new Error("Plex createCollection returned no ratingKey");
            }
            logger.info("Created Plex collection", { title, ratingKey: created.ratingKey });
            return created.ratingKey;
        } catch (err) {
            this.handleError(`createCollection(${title})`, err);
        }
    }

    async addItemToCollection(params: {
        collectionId: string;
        machineIdentifier: string;
        itemRatingKey: string;
    }): Promise<void> {
        const { collectionId, machineIdentifier, itemRatingKey } = params;
        const uri = `server://${machineIdentifier}/com.plexapp.plugins.library/library/metadata/${itemRatingKey}`;

        try {
            await this.http.put(`/library/collections/${collectionId}/items`, null, {
                params: { uri },
            });
        } catch (err) {
            this.handleError(`addItemToCollection(${collectionId}, ${itemRatingKey})`, err);
        }
    }

    async removeItemFromCollection(collectionId: string, itemRatingKey: string): Promise<void> {
        try {
            await this.http.delete(
                `/library/collections/${collectionId}/items/${itemRatingKey}`
            );
        } catch (err) {
            this.handleError(`removeItemFromCollection(${collectionId}, ${itemRatingKey})`, err);
        }
    }

    async deleteCollection(collectionId: string): Promise<void> {
        try {
            await this.http.delete(`/library/collections/${collectionId}`);
        } catch (err) {
            this.handleError(`deleteCollection(${collectionId})`, err);
        }
    }

    // ── GUID helpers ──────────────────────────────────────────────────────────

    /**
     * Parses all GUIDs on a media item and extracts the TMDB ID if present.
     * Plex stores GUIDs in formats like "tmdb://12345" or "com.plexapp.agents.themoviedb://12345"
     */
    static extractTmdbId(guids: Array<{ id: string }>): number | null {
        for (const g of guids) {
            const m = g.id.match(/^tmdb:\/\/(\d+)/i) ?? g.id.match(/themoviedb:\/\/(\d+)/i);
            if (m) return parseInt(m[1], 10);
        }
        return null;
    }
}

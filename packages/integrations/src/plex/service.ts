import { createLogger } from "@watchwarden/config";
import { PlexClient } from "./client";

const logger = createLogger("plex-service");

export interface CollectionSyncResult {
    collectionRatingKey: string;
    added: number;
    removed: number;
    unchanged: number;
}

/**
 * High-level service for managing WatchWarden-controlled Plex collections.
 * Handles create-or-update logic idempotently.
 */
export class PlexService {
    private readonly client: PlexClient;

    constructor(client: PlexClient) {
        this.client = client;
    }

    /**
     * Syncs a named Plex collection in the given section to exactly match the
     * provided set of ratingKeys.  Creates the collection if it doesn't exist.
     *
     * @param sectionId       Plex library section key
     * @param collectionName  Display name of the collection in Plex
     * @param mediaType       "movie" | "show" — used when creating a new collection
     * @param targetRatingKeys Set of Plex ratingKeys that should be in the collection
     * @param existingCollectionKey  Known ratingKey of the collection (if already created)
     */
    async syncCollection(params: {
        sectionId: string;
        collectionName: string;
        mediaType: "movie" | "show";
        targetRatingKeys: string[];
        existingCollectionKey?: string | null;
    }): Promise<CollectionSyncResult> {
        const { sectionId, collectionName, mediaType, targetRatingKeys, existingCollectionKey } =
            params;

        const targetSet = new Set(targetRatingKeys);
        let collectionKey = existingCollectionKey ?? null;

        // ── Resolve existing collection ────────────────────────────────────────
        if (!collectionKey) {
            const existing = await this.client.getCollections(sectionId);
            const match = existing.find(
                (c) => c.title.toLowerCase() === collectionName.toLowerCase()
            );
            if (match) {
                collectionKey = match.ratingKey;
                logger.info("Found existing Plex collection", {
                    title: collectionName,
                    ratingKey: collectionKey,
                });
            }
        }

        // ── No items to sync ───────────────────────────────────────────────────
        if (targetRatingKeys.length === 0) {
            if (collectionKey) {
                // Clear all items instead of deleting the collection, so users
                // can see the collection still exists even when temporarily empty
                const existingItems = await this.client.getCollectionItems(collectionKey);
                for (const item of existingItems) {
                    await this.client.removeItemFromCollection(collectionKey, item.ratingKey);
                }
                logger.info("Cleared empty Plex collection", { title: collectionName });
                return { collectionRatingKey: collectionKey, added: 0, removed: existingItems.length, unchanged: 0 };
            }
            return { collectionRatingKey: "", added: 0, removed: 0, unchanged: 0 };
        }

        // ── Get machine identifier ─────────────────────────────────────────────
        const identity = await this.client.getIdentity();
        const machineId = identity.machineIdentifier;

        // ── Create collection if needed ────────────────────────────────────────
        if (!collectionKey) {
            const [firstKey, ...rest] = targetRatingKeys;
            collectionKey = await this.client.createCollection({
                sectionId,
                title: collectionName,
                mediaType,
                machineIdentifier: machineId,
                initialItemRatingKey: firstKey,
            });

            // Add remaining items
            let added = 1;
            for (const key of rest) {
                await this.client.addItemToCollection({
                    collectionId: collectionKey,
                    machineIdentifier: machineId,
                    itemRatingKey: key,
                });
                added++;
            }
            return { collectionRatingKey: collectionKey, added, removed: 0, unchanged: 0 };
        }

        // ── Diff against current collection items ─────────────────────────────
        const currentItems = await this.client.getCollectionItems(collectionKey);
        const currentSet = new Set(currentItems.map((i) => i.ratingKey));

        const toAdd = [...targetSet].filter((k) => !currentSet.has(k));
        const toRemove = [...currentSet].filter((k) => !targetSet.has(k));
        const unchanged = [...currentSet].filter((k) => targetSet.has(k)).length;

        for (const key of toAdd) {
            await this.client.addItemToCollection({
                collectionId: collectionKey,
                machineIdentifier: machineId,
                itemRatingKey: key,
            });
        }

        for (const key of toRemove) {
            await this.client.removeItemFromCollection(collectionKey, key);
        }

        if (toAdd.length > 0 || toRemove.length > 0) {
            logger.info("Synced Plex collection", {
                title: collectionName,
                added: toAdd.length,
                removed: toRemove.length,
                unchanged,
            });
        }

        return {
            collectionRatingKey: collectionKey,
            added: toAdd.length,
            removed: toRemove.length,
            unchanged,
        };
    }
}

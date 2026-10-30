import assert from "node:assert/strict";
import test from "node:test";
import { PlexClient, PlexService } from "@watchwarden/integrations";
import { resolvePlatformSnapshots } from "@watchwarden/scoring";

test("successive source cycles update an owned Plex shelf without any Ops dependency", async () => {
    let order = ["1", "2"];
    const writes: string[] = [];
    const client = {
        getCollections: async () => [{ ratingKey: "100", title: "Popular Shows" }],
        getIdentity: async () => ({ machineIdentifier: "server" }),
        getCollectionItems: async () => order.map((ratingKey) => ({ ratingKey })),
        addItemToCollection: async ({ itemRatingKey }: { itemRatingKey: string }) => { order.push(itemRatingKey); writes.push(`add:${itemRatingKey}`); },
        removeItemFromCollection: async (_collection: string, ratingKey: string) => { order = order.filter((key) => key !== ratingKey); writes.push(`remove:${ratingKey}`); },
        setCollectionOrder: async (_collection: string, keys: string[]) => { order = [...keys]; writes.push("order"); },
    };
    const service = new PlexService(client as unknown as PlexClient);
    const previous = new Date("2026-10-28T12:00:00Z");
    const current = new Date("2026-10-29T12:00:00Z");
    const snapshots = [
        { titleId: "1", providerRank: 1, region: "CA", snapshotAt: previous },
        { titleId: "2", providerRank: 2, region: "CA", snapshotAt: previous },
    ];
    const publish = () => service.syncCollection({ sectionId: "1", collectionName: "Popular Shows", mediaType: "show",
        existingCollectionKey: "100", targetRatingKeys: resolvePlatformSnapshots(snapshots).slice(0, 2).map((snapshot) => snapshot.titleId) });
    await publish();
    assert.deepEqual(writes, []);
    snapshots.push(
        { titleId: "1", providerRank: 12, region: "CA", snapshotAt: current },
        { titleId: "2", providerRank: 1, region: "CA", snapshotAt: current },
        { titleId: "3", providerRank: 2, region: "CA", snapshotAt: current },
    );
    assert.deepEqual(await publish(), { collectionRatingKey: "100", added: 1, removed: 1, unchanged: 1 });
    assert.deepEqual(order, ["2", "3"]);
    assert.deepEqual(writes, ["add:3", "remove:1", "order"]);
    writes.length = 0;
    await publish();
    assert.deepEqual(writes, []);
});
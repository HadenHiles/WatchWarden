import { describe, expect, it, vi } from "vitest";
import { PlexClient } from "../client";
import { PlexService } from "../service";

vi.mock("@watchwarden/config", () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));

describe("Plex collection reconciliation", () => {
    it("applies changed rank even when membership is unchanged and verifies the result", async () => {
        const client = {
            getCollections: vi.fn().mockResolvedValue([{ ratingKey: "100", title: "FamFlix Top 10" }]),
            getIdentity: vi.fn().mockResolvedValue({ machineIdentifier: "server" }),
            getCollectionItems: vi.fn()
                .mockResolvedValueOnce([{ ratingKey: "1" }, { ratingKey: "2" }])
                .mockResolvedValueOnce([{ ratingKey: "2" }, { ratingKey: "1" }]),
            setCollectionOrder: vi.fn().mockResolvedValue(undefined),
            addItemToCollection: vi.fn(),
            removeItemFromCollection: vi.fn(),
        };

        const result = await new PlexService(client as unknown as PlexClient).syncCollection({
            sectionId: "1", collectionName: "FamFlix Top 10", mediaType: "movie",
            targetRatingKeys: ["2", "1"], existingCollectionKey: "100",
        });

        expect(client.setCollectionOrder).toHaveBeenCalledWith("100", ["2", "1"]);
        expect(client.getCollectionItems).toHaveBeenCalledTimes(2);
        expect(client.addItemToCollection).not.toHaveBeenCalled();
        expect(client.removeItemFromCollection).not.toHaveBeenCalled();
        expect(result).toMatchObject({ added: 0, removed: 0, unchanged: 2 });
    });

    function setup(current = ["1", "2"], verified = current) {
        const client = {
            getCollections: vi.fn().mockResolvedValue([{ ratingKey: "100", title: "FamFlix Top 10" }]),
            getIdentity: vi.fn().mockResolvedValue({ machineIdentifier: "server" }),
            getCollectionItems: vi.fn()
                .mockResolvedValueOnce(current.map((ratingKey) => ({ ratingKey })))
                .mockResolvedValue(verified.map((ratingKey) => ({ ratingKey }))),
            setCollectionOrder: vi.fn().mockResolvedValue(undefined),
            addItemToCollection: vi.fn().mockResolvedValue(undefined),
            removeItemFromCollection: vi.fn().mockResolvedValue(undefined),
            createCollection: vi.fn().mockResolvedValue("100"),
        };
        return { client, service: new PlexService(client as unknown as PlexClient) };
    }

    const params = {
        sectionId: "1", collectionName: "FamFlix Top 10", mediaType: "movie" as const,
        targetRatingKeys: ["1", "2"], existingCollectionKey: "100",
    };

    it("does not rewrite an already-correct collection", async () => {
        const { client, service } = setup();
        await service.syncCollection(params);
        expect(client.setCollectionOrder).not.toHaveBeenCalled();
        expect(client.addItemToCollection).not.toHaveBeenCalled();
        expect(client.removeItemFromCollection).not.toHaveBeenCalled();
        expect(client.getCollectionItems).toHaveBeenCalledTimes(2);
    });

    it("reconciles additions and removals before ordering", async () => {
        const { client, service } = setup(["1", "3"], ["2", "1"]);
        const result = await service.syncCollection({ ...params, targetRatingKeys: ["2", "1"] });
        expect(client.addItemToCollection).toHaveBeenCalledWith({ collectionId: "100", machineIdentifier: "server", itemRatingKey: "2" });
        expect(client.removeItemFromCollection).toHaveBeenCalledWith("100", "3");
        expect(client.setCollectionOrder).toHaveBeenCalledWith("100", ["2", "1"]);
        expect(result).toMatchObject({ added: 1, removed: 1, unchanged: 1 });
    });

    it("fails when Plex does not retain the requested order", async () => {
        const { service } = setup();
        await expect(service.syncCollection({ ...params, targetRatingKeys: ["2", "1"] }))
            .rejects.toThrow("membership/order verification failed");
    });

    it("fails when the final membership differs", async () => {
        const { service } = setup(["1", "2"], ["1"]);
        await expect(service.syncCollection(params)).rejects.toThrow("verification failed");
    });

    it("verifies empty targets without deleting the collection", async () => {
        const { client, service } = setup(["1", "2"], []);
        const result = await service.syncCollection({ ...params, targetRatingKeys: [] });
        expect(client.removeItemFromCollection).toHaveBeenCalledTimes(2);
        expect(client.getCollectionItems).toHaveBeenCalledTimes(2);
        expect(client.setCollectionOrder).not.toHaveBeenCalled();
        expect(result).toMatchObject({ collectionRatingKey: "100", removed: 2 });
    });

    it("does not create an empty untracked collection", async () => {
        const { client, service } = setup();
        expect(await service.syncCollection({ ...params, existingCollectionKey: null, targetRatingKeys: [] }))
            .toMatchObject({ collectionRatingKey: "" });
        expect(client.createCollection).not.toHaveBeenCalled();
    });

    it("persists a new collection ID before further writes and verifies its order", async () => {
        const { client, service } = setup();
        const onCollectionCreated = vi.fn().mockResolvedValue(undefined);
        await service.syncCollection({ ...params, existingCollectionKey: null, onCollectionCreated });
        expect(onCollectionCreated).toHaveBeenCalledWith("100");
        expect(onCollectionCreated.mock.invocationCallOrder[0]).toBeLessThan(client.addItemToCollection.mock.invocationCallOrder[0]);
        expect(client.setCollectionOrder).toHaveBeenCalledWith("100", ["1", "2"]);
    });

    it("retains ownership when a new collection fails verification", async () => {
        const { service } = setup(["2", "1"]);
        const onCollectionCreated = vi.fn().mockResolvedValue(undefined);
        await expect(service.syncCollection({ ...params, existingCollectionKey: null, onCollectionCreated }))
            .rejects.toThrow("verification failed");
        expect(onCollectionCreated).toHaveBeenCalledWith("100");
    });

    it("deduplicates target keys while preserving rank", async () => {
        const { client, service } = setup(["1", "2"], ["2", "1"]);
        await service.syncCollection({ ...params, targetRatingKeys: ["2", "1", "2"] });
        expect(client.setCollectionOrder).toHaveBeenCalledWith("100", ["2", "1"]);
    });

    it("rejects malformed targets before any Plex calls", async () => {
        const { client, service } = setup();
        await expect(service.syncCollection({ ...params, targetRatingKeys: ["../bad"] })).rejects.toThrow("numeric rating keys");
        expect(client.getCollections).not.toHaveBeenCalled();
    });

    it("stops on an incomplete current-membership read", async () => {
        const { client, service } = setup();
        client.getCollectionItems.mockReset().mockRejectedValue(new Error("incomplete"));
        await expect(service.syncCollection(params)).rejects.toThrow("incomplete");
        expect(client.addItemToCollection).not.toHaveBeenCalled();
        expect(client.removeItemFromCollection).not.toHaveBeenCalled();
        expect(client.setCollectionOrder).not.toHaveBeenCalled();
    });

    it("keeps Home publication independent from Library Recommended visibility", async () => {
        const visibility = { promotedToOwnHome: true, promotedToSharedHome: true, promotedToRecommended: false };
        const client = {
            getCollections: vi.fn().mockResolvedValue([{ ratingKey: "100", ...visibility }]),
            getCollectionRecommendation: vi.fn().mockResolvedValue(visibility),
            setCollectionRecommendation: vi.fn(),
        };
        const settings = { sectionId: "1", collectionId: "100", publishToHome: true,
            publishToSharedHome: true, publishToLibrary: false };
        expect(await new PlexService(client as unknown as PlexClient).syncCollectionRecommendation(settings)).toBe(false);
        expect(client.setCollectionRecommendation).not.toHaveBeenCalled();
    });
});
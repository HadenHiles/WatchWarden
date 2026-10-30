import { getIntegrationConfig, prisma, Prisma } from "@watchwarden/db";
import { JellyseerrClient, PlexClient } from "@watchwarden/integrations";

export async function catalogueObserveJob(): Promise<void> {
    const { plex, jellyseerr } = await getIntegrationConfig();
    if (!plex.baseUrl || !plex.token || !jellyseerr.baseUrl || !jellyseerr.apiKey || !jellyseerr.botUserId) throw new Error("Catalogue observation requires Plex and a dedicated Jellyseerr requester");
    const requests = await new JellyseerrClient({ baseUrl: jellyseerr.baseUrl, apiKey: jellyseerr.apiKey }).getAllRequests();
    const requestMap = new Map<number, typeof requests>();
    for (const request of requests) requestMap.set(request.media.tmdbId, [...(requestMap.get(request.media.tmdbId) ?? []), request]);
    const titles = await prisma.title.findMany({ where: { requestRecord: { requestedByBot: true } },
        select: { id: true, tmdbId: true, mediaType: true, inLibrary: true, plexRatingKey: true } });
    const client = new PlexClient({ baseUrl: plex.baseUrl, token: plex.token });
    let managedBytes = 0;
    const measuredIds: string[] = [];
    const protectedIds: string[] = [];
    for (const title of titles) {
        const active = (requestMap.get(title.tmdbId ?? -1) ?? []).filter((request) => request.status !== 3);
        if (active.some((request) => !request.requestedBy?.id || request.requestedBy.id !== jellyseerr.botUserId)) protectedIds.push(title.id);
        if (!title.inLibrary) continue;
        if (!title.plexRatingKey) throw new Error("Managed title has no verified Plex identity");
        managedBytes += await client.getItemStorage(title.plexRatingKey, title.mediaType);
        measuredIds.push(title.id);
    }
    await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(614621)::text`;
        const current = await transaction.appSetting.findUnique({ where: { key: "catalogue.reservations" } });
        const ledger = current?.value as Prisma.JsonObject | undefined;
        const items = (ledger?.items ?? []) as Array<{ titleId: string; bytes: number; createdAt: string }>;
        if (!Array.isArray(items)) throw new Error("Invalid catalogue reservations");
        const remaining = items.filter((item) => !measuredIds.includes(item.titleId));
        const evidence = { observedAt: new Date().toISOString(), complete: true, managedBytes,
            managedTitles: measuredIds.length, protectedIds, measuredIds, accountingBasis: "plex_logical_media_parts",
            reservedBytes: remaining.reduce((sum, item) => sum + item.bytes, 0) };
        await transaction.appSetting.upsert({ where: { key: "catalogue.storageEvidence" }, update: { value: evidence },
            create: { key: "catalogue.storageEvidence", category: "catalogue", value: evidence } });
        await transaction.appSetting.upsert({ where: { key: "catalogue.reservations" }, update: { value: { items: remaining } },
            create: { key: "catalogue.reservations", category: "catalogue", value: { items: remaining } } });
    }, { timeout: 10000 });
}
import { getIntegrationConfig, prisma } from '@watchwarden/db';
import { writeFile } from 'node:fs/promises';

const { plex } = await getIntegrationConfig();
if (!plex.baseUrl || !plex.token) throw new Error('Plex is not configured');
const headers = { Accept: 'application/json', 'X-Plex-Token': plex.token };
const owned = await prisma.plexCollection.findMany({ where: { enabled: true }, orderBy: { homePriority: 'asc' } });
for (const section of [...new Set(owned.map(row => row.sectionId))]) {
    const path = `/hubs/sections/${section}/manage`;
    const get = async () => {
        const response = await fetch(new URL(path, plex.baseUrl), { headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Managed hub inventory unavailable');
        const hubs = (await response.json()).MediaContainer?.Hub;
        if (!Array.isArray(hubs)) throw new Error('Invalid managed hub inventory');
        return hubs;
    };
    const before = await get();
    await writeFile(`/app/exports/plex-row-order-${section}-${Date.now()}.json`, JSON.stringify({ section, before }, null, 2), { mode: 0o600 });
    const recent = before.find(hub => /^(movie|tv)\.recentlyadded$/.test(hub.identifier));
    const collectionRows = owned.filter(row => row.sectionId === section && row.plexKey)
        .map(row => before.find(hub => hub.identifier === `custom.collection.${section}.${row.plexKey}`)).filter(Boolean);
    const ordered = [recent, ...collectionRows, ...before.filter(hub => hub !== recent && !collectionRows.includes(hub))].filter(Boolean);
    for (let index = 0; index < ordered.length; index++) {
        const url = new URL(`${path}/${ordered[index].identifier}/move`, plex.baseUrl);
        if (index > 0) url.searchParams.set('after', ordered[index - 1].identifier);
        const response = await fetch(url, { method: 'PUT', headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Managed hub reorder failed');
    }
    const after = await get();
    if (JSON.stringify(after.map(hub => hub.identifier)) !== JSON.stringify(ordered.map(hub => hub.identifier))) throw new Error('Managed hub order verification failed');
    for (const previous of before) {
        const current = after.find(hub => hub.identifier === previous.identifier);
        if (!current || ['promotedToRecommended', 'promotedToOwnHome', 'promotedToSharedHome'].some(field => Number(current[field]) !== Number(previous[field]))) throw new Error('Existing hub visibility changed unexpectedly');
    }
    console.log(JSON.stringify({ section, order: after.filter(hub => hub.promotedToOwnHome).map(hub => hub.title), visibilityUnchanged: true }));
}
await prisma.$disconnect();
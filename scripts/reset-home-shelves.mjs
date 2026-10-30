import { getIntegrationConfig, prisma } from '@watchwarden/db';
import { PlexClient } from '@watchwarden/integrations';
import { writeFile } from 'node:fs/promises';

const active = await prisma.jobRun.count({ where: { status: 'RUNNING' } });
if (active) throw new Error('Active jobs block shelf replacement');
const { plex } = await getIntegrationConfig();
if (!plex.baseUrl || !plex.token) throw new Error('Plex is not configured');
const client = new PlexClient({ baseUrl: plex.baseUrl, token: plex.token });
const owned = await prisma.plexCollection.findMany({ include: { titleOverrides: true } });
const sections = await client.getSections();
const movieSections = [...new Set(owned.filter(row => row.mediaType === 'MOVIE').map(row => row.sectionId))];
const showSections = [...new Set(owned.filter(row => row.mediaType === 'SHOW').map(row => row.sectionId))];
if (movieSections.length !== 1 || showSections.length !== 1) throw new Error('Library selection is ambiguous');
if (!sections.some(section => section.key === movieSections[0] && section.type === 'movie')
    || !sections.some(section => section.key === showSections[0] && section.type === 'show')) throw new Error('Configured libraries are unavailable');
const collections = new Map();
for (const section of [movieSections[0], showSections[0]]) collections.set(section, await client.getCollections(section));
const memberships = [];
for (const row of owned) {
    if (!row.plexKey) continue;
    const remote = collections.get(row.sectionId).find(item => item.ratingKey === row.plexKey);
    if (!remote) continue;
    if (remote.type !== 'collection' || remote.title !== row.name) throw new Error('Owned collection identity changed; stop for review');
    memberships.push({ id: row.id, plexKey: row.plexKey, sectionId: row.sectionId,
        members: (await client.getCollectionItems(row.plexKey)).map(item => item.ratingKey) });
}
const backup = `/app/exports/retired-home-shelves-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
await writeFile(backup, JSON.stringify({ createdAt: new Date().toISOString(), owned, memberships }, null, 2), { mode: 0o600 });
for (const collection of memberships) await client.deleteCollection(collection.plexKey);
const members = [...new Set(memberships.flatMap(collection => collection.members))];
for (const ratingKey of members) {
    const response = await fetch(new URL(`/library/metadata/${ratingKey}`, plex.baseUrl), {
        headers: { Accept: 'application/json', 'X-Plex-Token': plex.token }, redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('A former member could not be verified; no further changes');
}
const providers = ['Netflix', 'Prime Video', 'Apple TV+'];
const definitions = [
    { name: 'Top 10 Movies', mediaType: 'MOVIE', sectionId: movieSections[0], shelfType: 'CULTURAL_TRENDING', maxItems: 10, streamingProviders: providers },
    { name: 'Top 10 Shows', mediaType: 'SHOW', sectionId: showSections[0], shelfType: 'CULTURAL_TRENDING', maxItems: 10, streamingProviders: providers },
    { name: 'New Releases', mediaType: 'MOVIE', sectionId: movieSections[0], shelfType: 'RECENTLY_RELEASED', maxItems: 20, streamingProviders: [] },
    ...providers.map(provider => ({ name: `${provider === 'Prime Video' ? 'Prime Video' : provider === 'Apple TV+' ? 'Apple TV' : provider} Picks`,
        mediaType: 'SHOW', sectionId: showSections[0], shelfType: 'PROVIDER_TRENDING', provider, maxItems: 20, streamingProviders: [provider] })),
];
await prisma.$transaction(async transaction => {
    await transaction.plexCollectionTitle.deleteMany({ where: { collectionId: { in: owned.map(row => row.id) } } });
    await transaction.plexCollection.deleteMany({ where: { id: { in: owned.map(row => row.id) } } });
    for (const [index, definition] of definitions.entries()) await transaction.plexCollection.create({ data: {
        ...definition, collectionType: definition.shelfType === 'PROVIDER_TRENDING' ? 'TOP_TRENDING' : 'SMART',
        maxItemsPerProvider: definition.maxItems, enabled: true, publishToHome: true, publishToSharedHome: true,
        homePriority: (index + 1) * 10, autoRequest: true, releaseWindowDays: 90,
    } });
    const home = await transaction.appSetting.findUnique({ where: { key: 'plexHome' } });
    await transaction.appSetting.update({ where: { key: 'plexHome' }, data: { value: {
        ...home?.value, shelfLimit: 6, manageRecommendations: false, defaultMaxItems: 20, recentlyReleasedDays: 90,
    } } });
});
console.log(JSON.stringify({ backup, retiredDefinitions: owned.length, deletedOwnedCollections: memberships.length,
    formerMembersStillAvailable: members.length, newShelves: definitions.map(row => row.name), mediaDeleted: 0 }));
await prisma.$disconnect();
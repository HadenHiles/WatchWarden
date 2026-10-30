import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = parseEnv(await readFile(`${root}/.env`, 'utf8'));
const base = process.env.WATCHWARDEN_VERIFY_URL ?? 'http://127.0.0.1:4000';
const get = async (path, token, method = 'GET') => {
    const response = await fetch(new URL(path, base), { method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, data: await response.json() };
};
const result = await get('/plex/curation-status', env.CURATION_READ_TOKEN);
if (result.status !== 200 || result.data?.data?.version !== 1) throw new Error('Authenticated curation status failed');
const denied = await get('/jobs/plex-sync/trigger', env.CURATION_READ_TOKEN, 'POST');
if (denied.status !== 403) throw new Error('Read token exceeded its scope');
const policyDenied = await get('/settings', env.CURATION_CONTROL_TOKEN);
if (policyDenied.status !== 403) throw new Error('Control token exceeded its scope');
const web = await fetch('http://127.0.0.1:3000/login', { signal: AbortSignal.timeout(15000) });
if (!web.ok) throw new Error('Login UI unavailable');
let queued = false;
if (process.argv.includes('--refresh')) {
    const request = await get('/plex/curation-refresh', env.CURATION_CONTROL_TOKEN, 'POST');
    if (request.status !== 202 || request.data?.data?.acquisitionAllowed !== false) throw new Error('Scoped refresh queue failed');
    queued = true;
}
const status = result.data.data;
console.log(JSON.stringify({ authenticatedStatus: true, readScopeDenied: true, controlScopeDenied: true, uiStatus: web.status,
    refreshQueued: queued, budgetBytes: status.catalogue?.storagePolicy?.maxStorageBytes,
    jobs: status.jobs.map(job => ({ name: job.name, state: job.lastAttempt?.status ?? 'not_run', lastSuccessAt: job.lastSuccessAt })),
    shelves: status.shelves.map(shelf => ({ name: shelf.name, items: shelf.itemCount, lastSyncAt: shelf.lastSyncAt })),
    accounting: status.catalogue?.accounting ?? null }));
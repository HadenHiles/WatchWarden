import { execFileSync } from 'node:child_process';
import { readFile, appendFile, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const path = `${root}/.env`;
const env = parseEnv(await readFile(path, 'utf8'));
const additions = [];
for (const name of ['CURATION_READ_TOKEN', 'CURATION_CONTROL_TOKEN']) {
    if (!env[name] || env[name].length < 32) { env[name] = randomBytes(32).toString('hex'); additions.push(`${name}=${env[name]}`); }
}
if (env.CURATION_READ_TOKEN === env.CURATION_CONTROL_TOKEN || env.CURATION_READ_TOKEN === env.API_SECRET || env.CURATION_CONTROL_TOKEN === env.API_SECRET) throw new Error('Curation credentials must be distinct');
additions.push('LEGACY_AUTOMATION_ENABLED=false', 'DOWNLOAD_PRIORITY_ENABLED=false');
if (additions.length) await appendFile(path, `\n${additions.join('\n')}\n`, { mode: 0o600 });
await chmod(path, 0o600);
const sql = `BEGIN;
INSERT INTO "AppSetting" (id,key,value,category,"updatedAt") VALUES
('catalogue-storage-policy','catalogue.storage','{"maxStorageBytes":1000000000000,"movieReservationBytes":null,"showReservationBytes":null}','catalogue',now())
ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,"updatedAt"=now();
UPDATE "AppSetting" SET value=value || '{"enabled":false,"deleteUnwatched":false}'::jsonb,"updatedAt"=now() WHERE key='automation.roster';
UPDATE "AppSetting" SET value=value || '{"plexSyncCron":"10,40 * * * *","plexLibrarySyncCron":"5,35 * * * *"}'::jsonb,"updatedAt"=now() WHERE key='refreshIntervals';
COMMIT;`;
execFileSync('docker', ['exec', '-i', 'watchwarden-postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'watchwarden', '-d', 'watchwarden'], { input: sql, stdio: ['pipe', 'ignore', 'pipe'] });
const ssh = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=/home/haden/Repos/FamFlix-Ops/infra/ssh_known_hosts', 'root@100.103.47.51'];
for (const [file, value] of [['watchwarden_api_key', env.CURATION_READ_TOKEN], ['watchwarden_control_key', env.CURATION_CONTROL_TOKEN]]) {
    execFileSync('ssh', [...ssh, `umask 077 && tee /root/famflix-ops-private/${file} >/dev/null && chown 1000:1000 /root/famflix-ops-private/${file} && chmod 600 /root/famflix-ops-private/${file}`], { input: value, stdio: ['pipe', 'ignore', 'pipe'] });
}
console.log(JSON.stringify({ credentialsProvisioned: true, budgetBytes: 1e12, acquisitionEnabled: false, legacyJobsEnabled: false }));
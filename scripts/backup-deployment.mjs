import { execFileSync } from 'node:child_process';
import { mkdir, copyFile, chmod, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = resolve(homedir(), '.local/state/watchwarden/backups', stamp);
const docker = args => execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();
const containers = JSON.parse(docker(['inspect', 'watchwarden-postgres', 'watchwarden-api', 'watchwarden-worker', 'watchwarden-web']));
if (containers.some(container => container.State.Running)) throw new Error('Offline backup requires all WatchWarden services stopped');
await mkdir(destination, { recursive: true, mode: 0o700 });
await chmod(destination, 0o700);
await copyFile(resolve(root, '.env'), resolve(destination, 'deployment.env'));
await chmod(resolve(destination, 'deployment.env'), 0o600);
await copyFile(resolve(root, 'docker-compose.yml'), resolve(destination, 'docker-compose.yml'));
const manifest = [];
for (const container of containers) {
    const name = container.Name.slice(1);
    const rollback = `${name}:rollback-${stamp.toLowerCase()}`;
    docker(['image', 'tag', container.Image, rollback]);
    manifest.push({ name, image: container.Image, rollback, state: container.State.Status,
        mounts: container.Mounts.map(mount => ({ type: mount.Type, name: mount.Name, destination: mount.Destination })) });
}
const volumes = [...new Set(containers.flatMap(container => container.Mounts.filter(mount => mount.Type === 'volume').map(mount => mount.Name)))];
for (const volume of volumes) {
    await writeFile(resolve(destination, `${volume}.tar.gz`), '', { mode: 0o600 });
    docker(['run', '--rm', '--network', 'none', '--entrypoint', 'tar', '-v', `${volume}:/source:ro`,
        '-v', `${destination}:/backup`, 'postgres:16-alpine', '-czf', `/backup/${volume}.tar.gz`, '-C', '/source', '.']);
    await chmod(resolve(destination, `${volume}.tar.gz`), 0o600);
}
await writeFile(resolve(destination, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), containers: manifest, volumes }, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ backup: destination, volumes: volumes.length, rollbackImages: manifest.length }));
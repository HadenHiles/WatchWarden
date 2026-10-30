import { execFileSync } from 'node:child_process';

const query = `import sqlite3,json
c=sqlite3.connect("file:/app/data/database/reclaimerr.db?mode=ro",uri=True)
c.row_factory=sqlite3.Row
settings=dict(c.execute("SELECT favorites_ignore_enabled,favorites_protect_all_users,active_playback_protection_enabled,playback_unavailable_protection_enabled FROM general_settings LIMIT 1").fetchone())
services=[dict(r) for r in c.execute("SELECT id,service_type,enabled FROM service_configs WHERE service_type='SEERR'")]
rules=[dict(r) for r in c.execute("SELECT id,name,enabled,definition,action FROM reclaim_rules")]
print(json.dumps({"settings":settings,"services":services,"rules":rules}))`;
const native = JSON.parse(execFileSync('docker', ['exec', 'reclaimerr', 'python', '-c', query], { encoding: 'utf8' }));
const discovered = process.env.WATCHWARDEN_BOT_USER_ID ?? execFileSync('docker', ['exec', '-w', '/app/apps/api', 'watchwarden-api', 'node', '-e',
    'require("@watchwarden/db").getIntegrationConfig().then(c=>{console.log(c.jellyseerr.botUserId??0);process.exit(0)}).catch(()=>process.exit(1))'], { encoding: 'utf8' }).trim();
const botId = Number(discovered);
if (!Number.isSafeInteger(botId) || botId <= 0) throw new Error('Configured acquisition requester is unknown');
const owners = native.services.filter(service => service.enabled).map(service => `${service.id}:${botId}`);
const flatten = node => node?.type === 'condition' ? [node] : (node?.children ?? []).flatMap(flatten);
const rules = native.rules.filter(rule => rule.enabled).map(rule => {
    const conditions = flatten(JSON.parse(rule.definition).root);
    const action = JSON.parse(rule.action);
    const requesterBased = conditions.some(condition => condition.field === 'seerr.requester_has_watched');
    const excludesBot = conditions.some(condition => condition.field === 'seerr.requested_by_user_ids'
        && condition.operator === 'not_contains_any' && owners.every(owner => condition.value?.includes(owner)));
    return { id: rule.id, name: rule.name, autoDelete: action.auto_delete_enabled === true,
        requesterBased, excludesBot, householdPlayback: conditions.some(condition => condition.field.startsWith('playback.')) };
});
const unsafe = rules.filter(rule => rule.autoDelete && rule.requesterBased && !rule.excludesBot);
const protections = native.settings;
const report = { botUserId: botId, requesterNamespaces: owners, unsafeBotRequesterExpiryRules: unsafe,
    rules, protections, botPlaybackRequired: unsafe.length > 0,
    watchlistCoverage: 'not_established_for_every_account', automatedWatchwardenRetirement: false };
console.log(JSON.stringify(report, null, 2));
if (unsafe.length || !owners.length || !protections.active_playback_protection_enabled
    || !protections.playback_unavailable_protection_enabled) process.exitCode = 1;
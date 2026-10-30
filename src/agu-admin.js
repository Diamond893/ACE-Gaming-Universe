"use strict";
const registry = require('./communityRegistry');
const [actionRaw, id] = process.argv.slice(2);
const queue = require('./broadcastQueue');
const action = String(actionRaw || '').toLowerCase();
function locate(groupId) {
    const all = registry.list();
    if (all.whatsapp[groupId]) return 'whatsapp';
    if (all.discord[groupId]) return 'discord';
    throw new Error('Group/server ID not found in SQLite database');
}
try {
    if (action === 'backup') {
        const { spawnSync } = require('child_process');
        const child = spawnSync(process.execPath, [require('path').join(__dirname,'database','backup-cli.js')], {stdio:'inherit'});
        if (child.status !== 0) process.exitCode = 1;
    } else if (action === 'broadcast') {
        const args=process.argv.slice(3);
        const tagAll=args.includes('--tagall');
        const content=args.filter(a=>a!=='--tagall').join(' ');
        const job=queue.preview(content,tagAll);
        console.log(`📢 BROADCAST PREVIEW\nID: ${job.id}\nRecipients: ${job.targets.length} active communities\nTag all: ${tagAll?'YES':'NO'}\n\n${job.message}\n\nNot sent yet. To confirm:\nnode src/agu-admin.js broadcast-confirm ${job.id}`);
    } else if (action === 'broadcast-confirm' && id) {
        const job=queue.confirm(id);
        console.log(`✅ Queued broadcast ${job.id} for ${job.targets.length} communities. Keep both bots running.`);
    } else if (action === 'broadcast-status' && id) {
        const report=queue.summary(queue.getJob(id));
        console.log(`Broadcast ${id} (${report.job.confirmed?'confirmed':'unconfirmed'}):`);
        for (const r of report.rows) console.log(`${r.platform} ${r.id}: ${r.status}`);
    } else if (action === 'communities' || action === 'list') {
        const all = registry.list();
        for (const platform of ['whatsapp', 'discord']) {
            console.log(`\n${platform.toUpperCase()}`);
            const entries = Object.entries(all[platform]);
            if (!entries.length) console.log('  (none)');
            for (const [key, value] of entries) console.log(`  ${value.active ? 'ACTIVE' : 'INACTIVE'} | ${value.name} | ${key}`);
        }
    } else if (['status', 'activate', 'deactivate'].includes(action) && id) {
        const platform = locate(id);
        const record = action === 'status' ? registry.get(platform, id) : registry.setActive(platform, id, action === 'activate');
        console.log(`${platform}: ${record.name}\nID: ${id}\nStatus: ${record.active ? 'ACTIVE' : 'INACTIVE'}\nUpdated: ${record.updatedAt}`);
        if (action === 'activate') console.log('AGU will answer commands in this community. Activation broadcasts require a separate broadcaster.');
    } else {
        console.log('Usage: node src/agu-admin.js communities | status <groupId> | activate <groupId> | deactivate <groupId> | broadcast <message> [--tagall] | broadcast-confirm <id> | broadcast-status <id> | backup');
        process.exitCode = 1;
    }
} catch (error) { console.error('❌', error.message); process.exitCode = 1; }

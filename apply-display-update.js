'use strict';
// Run from AGU project root: node path\to\apply-display-update.js
// Non-destructive surgical change to current processor, preserving customized EXP rules.
const fs = require('fs');
const path = require('path');
const target = path.resolve(process.cwd(), 'src', 'core', 'commandProcessor.js');
const source = fs.readFileSync(target, 'utf8');
const start = source.indexOf('case "achievements": {');
const next = source.indexOf('case "referral": {', start);
if (start < 0 || next < start || !source.slice(start,next).includes('case "missions": {')) {
  console.error('Could not safely locate the achievement/mission switch cases. No changes made.');
  process.exit(1);
}
const block = String.raw`case "achievements": {
            const all = allAchievements().filter(a => a.enabled);
            const completed = new Set(getAchievementSummary(playerId).map(a => a.id));
            const counters = player.achievementCounters || {};
            const readable = {
                level_reached: player.level, coins_reached: player.coins,
                exp_reached: player.exp, activity_streak: player.activityStreak || 0
            };
            const categories = {
                general: '🧭 EXPLORATION', economy: '💰 ECONOMY',
                progression: '⭐ LEVEL PROGRESSION', experience: '✨ EXPERIENCE',
                consistency: '🔥 CONSISTENCY', anime: '🎴 ANIME CARDS',
                football: '⚽ FOOTBALL', pokemon: '🐉 MONSTERS', rpg: '⚔️ RPG'
            };
            // Category is taken from the achievement definitions, not inferred from names.
            const groups = require('./achievements').ACHIEVEMENTS;
            const pages = [];
            for (const [key, items] of Object.entries(groups)) {
                const visible = items.filter(a => a.enabled);
                if (!visible.length) continue;
                const lines = visible.map(a => {
                    const count = readable[a.event] ?? (a.event === 'unique_command'
                        ? (player.uniqueCommands || []).length : (counters[a.event] || 0));
                    const value = Math.min(Number(count) || 0, a.target);
                    return (completed.has(a.id) ? '✅' : '⬜') + ' *' + a.name + '*\n' +
                        '   ' + (a.description || 'Complete the required milestone.') + '\n' +
                        '   ' + value.toLocaleString() + '/' + a.target.toLocaleString() +
                        '  •  🪙 ' + a.reward.toLocaleString();
                });
                pages.push('*' + (categories[key] || key.toUpperCase()) + '*\n' + lines.join('\n\n'));
            }
            const unlocked = agu.hidden.view(player.gameId);
            message = '🏆 *NYX ACHIEVEMENTS*\n✅ Completed: ' + completed.size +
                ' / ' + all.length + '\n\n' + pages.join('\n\n━━━━━━━━━━━━━━\n\n') +
                (unlocked.length ? '\n\n🌌 *DISCOVERED SECRETS*\n' +
                    unlocked.map(a => '✅ ' + a.name + (a.description ? ' — ' + a.description : '')).join('\n') : '');
            break;
        }

        case "missions": {
            const current = getMissionSummary(playerId);
            const completed = current.filter(m => m.completed).length;
            message = '📜 *DAILY MISSIONS*\n🕛 Resets at midnight WAT\n' +
                '✅ ' + completed + '/' + current.length + ' completed\n\n' +
                current.map((m,i) =>
                    (m.completed ? '✅' : '🎯') + ' *' + (i+1) + '. ' + m.name + '*\n' +
                    (m.description || '') + '\n' +
                    '📊 ' + m.progress + '/' + m.target + '  •  🪙 ' + m.reward + ' Coins'
                ).join('\n\n') +
                '\n\n🎁 Rewards are credited automatically when completed.';
            break;
        }

        `;
const updated = source.slice(0,start) + block + source.slice(next);
const backup = `${target}.before-progression-${Date.now()}.bak`;
fs.copyFileSync(target,backup);
fs.writeFileSync(target,updated);
console.log('Updated display cases only:',target);
console.log('Backup:',backup);
console.log('Your EXP exclusion list and handlers were not modified.');

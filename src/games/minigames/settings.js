'use strict';
const { db } = require('../../database/connection');
// Local to each community. Existing AGU activation is entirely separate.
db.exec(`
 CREATE TABLE IF NOT EXISTS minigame_settings (
   platform TEXT NOT NULL, community_id TEXT NOT NULL,
   enabled INTEGER NOT NULL DEFAULT 1,
   PRIMARY KEY (platform, community_id)
 );
 CREATE TABLE IF NOT EXISTS minigame_overrides (
   platform TEXT NOT NULL, community_id TEXT NOT NULL,
   game TEXT NOT NULL, enabled INTEGER NOT NULL,
   PRIMARY KEY (platform, community_id, game)
 );
`);

const gameIds = new Set(['tictactoe', 'rps', 'guess', 'quiz']);
const base = db.prepare('SELECT enabled FROM minigame_settings WHERE platform=? AND community_id=?');
const gameRow = db.prepare('SELECT enabled FROM minigame_overrides WHERE platform=? AND community_id=? AND game=?');
function isEnabled(platform, communityId, game) {
  const overall = base.get(platform, communityId);
  if (overall && !overall.enabled) return false;
  if (!game) return true;
  const specific = gameRow.get(platform, communityId, game);
  return !specific || !!specific.enabled;
}
function setEnabled(platform, communityId, enabled, game) {
  if (game && !gameIds.has(game)) throw new Error(`Unknown minigame: ${game}. Available: ${[...gameIds].join(', ')}.`);
  if (game) {
    db.prepare('INSERT INTO minigame_overrides(platform,community_id,game,enabled) VALUES (?,?,?,?) ON CONFLICT(platform,community_id,game) DO UPDATE SET enabled=excluded.enabled').run(platform,communityId,game,enabled ? 1 : 0);
  } else {
    db.prepare('INSERT INTO minigame_settings(platform,community_id,enabled) VALUES (?,?,?) ON CONFLICT(platform,community_id) DO UPDATE SET enabled=excluded.enabled').run(platform,communityId,enabled ? 1 : 0);
  }
}
function status(platform, communityId) {
  const enabled = isEnabled(platform,communityId);
  const overrides = db.prepare('SELECT game,enabled FROM minigame_overrides WHERE platform=? AND community_id=? ORDER BY game').all(platform,communityId);
  return `🎮 MINIGAMES: ${enabled ? '🟢 ON' : '🔴 OFF'}\n${gameIds.size ? [...gameIds].map(g => `${g}: ${isEnabled(platform,communityId,g) ? 'ON' : 'OFF'}${overrides.some(o=>o.game===g) ? ' (custom)' : ''}`).join('\n') : 'No games installed yet.'}\n\nAdmins: on | off | enable <game> | disable <game>`;
}
function handle(platform, communityId, args, isAdmin) {
  const action = String(args[0] || 'status').toLowerCase();
  if (action === 'status') return status(platform,communityId);
  if (!['on','off','enable','disable'].includes(action)) return '❌ Usage: minigames [status|on|off|enable <game>|disable <game>]';
  if (!isAdmin) return '❌ Only group/server admins can change minigame settings.';
  const game = ['enable','disable'].includes(action) ? String(args[1] || '').toLowerCase() : '';
  if (['enable','disable'].includes(action) && !game) return '❌ Provide a game name (e.g. tictactoe).';
  try { setEnabled(platform,communityId, ['on','enable'].includes(action),game); }
  catch (error) { return `❌ ${error.message}`; }
  return `✅ ${game || 'All minigames'} ${['on','enable'].includes(action) ? 'enabled' : 'disabled'} in this ${platform === 'whatsapp' ? 'group' : 'server'}.`;
}
module.exports = { isEnabled, setEnabled, handle, status };

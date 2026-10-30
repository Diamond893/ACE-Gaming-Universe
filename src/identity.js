'use strict';
const {db,withTransaction} = require('./database/connection');
const get = db.prepare('SELECT game_id FROM identities WHERE identity_key = ?');
function getLinkedGameId(platform,id) { return get.get(`${platform}:${id}`)?.game_id || null; }
const linkIdentity = withTransaction((platform, id, gameId) => {
  if (!['whatsapp','discord'].includes(platform)) return {success:false,message:'❌ Unsupported platform.'};
  const key = `${platform}:${id}`;
  if (get.get(key)) return {success:false,message:'❌ This platform account is already linked.'};
  if (!db.prepare('SELECT 1 FROM players WHERE game_id = ?').get(gameId)) return {success:false,message:'❌ AGU account not found.'};
  if (db.prepare('SELECT 1 FROM identities WHERE game_id = ? AND identity_key LIKE ?').get(gameId,platform+':%')) return {success:false,message:'❌ This AGU account is already linked on that platform.'};
  db.prepare('INSERT INTO identities(identity_key,game_id) VALUES (?,?)').run(key,gameId);
  return {success:true,message:'✅ Platform identity linked successfully!'};
});
module.exports={getLinkedGameId,linkIdentity};

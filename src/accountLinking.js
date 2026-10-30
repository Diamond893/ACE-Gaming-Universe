'use strict';
const crypto = require('crypto');
const {db, withTransaction} = require('./database/connection');
const {getPlayerByGameId} = require('./players');
const {getLinkedGameId,linkIdentity} = require('./identity');
const {resolvePlayer} = require('./playerResolver');
const TTL=5*60*1000;
const hashed=code=>crypto.createHash('sha256').update(code).digest('hex');
const createLinkRequest=withTransaction((gameId,destinationPlatform,destinationId)=>{
  const player=getPlayerByGameId(gameId);
  if(!player) return {success:false,message:'❌ AGU account not found.'};
  if(!['whatsapp','discord'].includes(destinationPlatform)) return {success:false,message:'❌ Unsupported platform.'};
  if(resolvePlayer(destinationPlatform,destinationId)) return {success:false,message:'❌ This account already has an AGU registration. Linking is for unregistered accounts.'};
  const sourcePlatform=String(player.id).split(':')[0];
  if(sourcePlatform===destinationPlatform) return {success:false,message:'❌ Link from the OTHER platform.'};
  if(db.prepare('SELECT 1 FROM identities WHERE game_id=? AND identity_key LIKE ?').get(player.gameId,destinationPlatform+':%')) return {success:false,message:'❌ This AGU account is already connected to that platform.'};
  const code=String(crypto.randomInt(10000000,100000000));
  const key=`${destinationPlatform}:${destinationId}`;
  db.prepare('DELETE FROM pending_links WHERE expires_at <= ? OR game_id = ? OR destination_key = ?').run(Date.now(),player.gameId,key);
  db.prepare('INSERT INTO pending_links(destination_key,game_id,destination_platform,destination_id,code_hash,expires_at) VALUES (?,?,?,?,?,?)').run(key,player.gameId,destinationPlatform,String(destinationId),hashed(code),Date.now()+TTL);
  return {success:true,code,expiresInMinutes:5,sourcePlatform};
});
const verifyLinkCode=withTransaction((sourcePlatform,sourceId,codeInput)=>{
  const code=String(codeInput||'').trim();
  if(!/^\d{8}$/.test(code)) return {success:false,message:'❌ Enter the 8-digit verification code.'};
  const player=resolvePlayer(sourcePlatform,sourceId);
  if(!player) return {success:false,message:'❌ Only the registered account owner can approve linking.'};
  db.prepare('DELETE FROM pending_links WHERE expires_at <= ?').run(Date.now());
  const request=db.prepare('SELECT * FROM pending_links WHERE game_id = ? AND code_hash = ? AND destination_platform <> ?').get(player.gameId,hashed(code),sourcePlatform);
  if(!request) return {success:false,message:'❌ Invalid or expired code for this account.'};
  if(resolvePlayer(request.destination_platform,request.destination_id)||getLinkedGameId(request.destination_platform,request.destination_id)) {
    db.prepare('DELETE FROM pending_links WHERE destination_key = ?').run(request.destination_key);
    return {success:false,message:'❌ Destination account is already registered or linked.'};
  }
  const result=linkIdentity(request.destination_platform,request.destination_id,request.game_id);
  if(!result.success) return result;
  db.prepare('DELETE FROM pending_links WHERE destination_key = ?').run(request.destination_key);
  return {success:true,message:`✅ Linked ${request.destination_platform} to ${player.gameId}! Both platforms now share your account.`};
});
module.exports={createLinkRequest,verifyLinkCode};

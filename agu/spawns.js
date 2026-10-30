'use strict';
const crypto=require('crypto');
const {db,withTransaction}=require('./store');
const config=require('./config'),cards=require('./cards');
const communities=require('../communityRegistry');
db.exec(`
 CREATE TABLE IF NOT EXISTS card_features (platform TEXT NOT NULL,community_id TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,next_spawn_at INTEGER, PRIMARY KEY(platform,community_id));
 CREATE TABLE IF NOT EXISTS card_spawns (platform TEXT NOT NULL,community_id TEXT NOT NULL,code TEXT NOT NULL,card_payload TEXT NOT NULL,created_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'active',claimed_by TEXT,PRIMARY KEY(platform,community_id));
`);
function getFeature(platform,communityId){return db.prepare('SELECT * FROM card_features WHERE platform=? AND community_id=?').get(platform,communityId)||{enabled:0,next_spawn_at:null};}
const toggle=withTransaction((platform,id,enabled)=>{if(!communities.isActive(platform,id))return{success:false,message:'❌ AGU must be active in this community first.'};const due=enabled?Date.now()+config.spawnMinutes*60000:null;db.prepare('INSERT INTO card_features VALUES (?,?,?,?) ON CONFLICT(platform,community_id) DO UPDATE SET enabled=excluded.enabled,next_spawn_at=excluded.next_spawn_at').run(platform,id,enabled?1:0,due);if(!enabled)db.prepare('UPDATE card_spawns SET status=? WHERE platform=? AND community_id=? AND status=?').run('expired',platform,id,'active');return{success:true,message:`🎴 Automatic cards: ${enabled?'ENABLED':'DISABLED'}\n⏰ Global interval: ${config.spawnMinutes} minutes (ACE-controlled).`};});
function status(platform,id){const r=getFeature(platform,id);return{success:true,message:`🎴 NYX CARDS\nFeature: ${r.enabled?'🟢 ON':'🔴 OFF'}\nSpawns: one per eligible community every ${config.spawnMinutes} minutes.\nClaims expire when the next card spawns.`};}
function code4(){const digits='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<config.claimLength;i++)s+=digits[crypto.randomInt(digits.length)];return s;}
// Claim remains valid until the next spawned card replaces it (unless claimed/feature disabled).
const spawnIfDue=withTransaction((platform,id,now=Date.now())=>{if(!communities.isActive(platform,id))return null;const row=getFeature(platform,id);if(!row.enabled)return null;if(!row.next_spawn_at){db.prepare('UPDATE card_features SET next_spawn_at=? WHERE platform=? AND community_id=?').run(now+config.spawnMinutes*60000,platform,id);return null;}if(row.next_spawn_at>now)return null;
 // Catalog must be installed before ticking, otherwise retry later without wiping an active claim.
 let source;try{source=cards.draw();}catch(e){return null;}
 const code=code4();db.prepare(`INSERT INTO card_spawns(platform,community_id,code,card_payload,created_at,status,claimed_by) VALUES (?,?,?,?,?,'active',NULL) ON CONFLICT(platform,community_id) DO UPDATE SET code=excluded.code,card_payload=excluded.card_payload,created_at=excluded.created_at,status='active',claimed_by=NULL`).run(platform,id,code,JSON.stringify(source),now);
 // Keep a stable tick schedule even if process was asleep. Do not catch up flood.
 db.prepare('UPDATE card_features SET next_spawn_at=? WHERE platform=? AND community_id=?').run(now+config.spawnMinutes*60000,platform,id);
 return {platform,communityId:id,code,card:source,message:`🌌 NYX CARD DROP!\n\n🎴 ${source.name}\n📺 ${source.series||'Unknown'}\n💎 T${source.tier}\n🔐 Claim: .claim ${code}\n⏰ Until the next spawn (${config.spawnMinutes} minutes).`};});
function due(platform){return db.prepare('SELECT community_id FROM card_features WHERE platform=? AND enabled=1 AND next_spawn_at<=?').all(platform,Date.now()).map(r=>r.community_id);}
const claim=withTransaction((platform,communityId,code,gameId)=>{const r=db.prepare('SELECT * FROM card_spawns WHERE platform=? AND community_id=?').get(platform,communityId);if(!r||r.status!=='active'||r.code!==String(code||'').toUpperCase())return{success:false,message:'❌ Invalid, expired, or already claimed card code.'};
 // An overdue claim is still valid until the NEXT spawn actually happens.
 const change=db.prepare("UPDATE card_spawns SET status='claimed',claimed_by=? WHERE platform=? AND community_id=? AND status='active' AND code=?").run(gameId,platform,communityId,r.code).changes;if(change!==1)return{success:false,message:'❌ Card already claimed.'};const awarded=cards.issue(gameId,JSON.parse(r.card_payload));return{success:true,message:`✅ CARD CLAIMED!\n${cards.cardText(awarded)}\n👤 You own this unique AGU copy.`,image:awarded.image};});
module.exports={getFeature,toggle,status,due,spawnIfDue,claim};

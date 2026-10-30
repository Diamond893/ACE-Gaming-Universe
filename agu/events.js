'use strict';
const fs=require('fs'),path=require('path');
const {db,withTransaction,randomInt}=require('./store');
const inv=require('./inventory'),cards=require('./cards');
const FILE=path.resolve(__dirname,'../../data/eventCards.json');
db.exec(`CREATE TABLE IF NOT EXISTS event_card_issued (event_id TEXT PRIMARY KEY, game_id TEXT NOT NULL REFERENCES players(game_id), card_instance_id TEXT NOT NULL UNIQUE, obtained_at TEXT NOT NULL);`);
function catalog(){if(!fs.existsSync(FILE))return [];const data=JSON.parse(fs.readFileSync(FILE,'utf8'));if(!Array.isArray(data))throw Error('data/eventCards.json must be an array.');const ids=new Set();return data.filter(x=>{if(!x||!x.id||!x.name||!['5','6'].includes(String(x.tier))||ids.has(String(x.id)))return false;ids.add(String(x.id));return true;});}
function remaining(){return catalog().filter(c=>!db.prepare('SELECT 1 FROM event_card_issued WHERE event_id=?').get(String(c.id)));}
const redeem=withTransaction((gameId)=>{const pool=remaining();if(!pool.length)return{success:false,message:'❌ No undistributed event cards are currently available. Your fragment is safe.'};if(!inv.take(gameId,'event_card_fragment',1))return{success:false,message:'❌ You need 1 Event Card Fragment.'};const card=pool[randomInt(0,pool.length-1)];const owned=cards.issue(gameId,{...card,id:`EVENT:${card.id}`},{eventId:String(card.id)});db.prepare('INSERT INTO event_card_issued VALUES (?,?,?,?)').run(String(card.id),gameId,owned.instanceId,new Date().toISOString());return{success:true,message:`🌌 NYX EXCLUSIVE EVENT CARD\n\n${cards.cardText(owned)}\n\n🎟️ -1 Event Card Fragment\n🌍 AGU Edition: 1/1\nThis design can never be issued again.`,image:owned.image};});
module.exports={catalog,remaining,redeem};

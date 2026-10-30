'use strict';
const fs=require('fs'),path=require('path');
const {db,withTransaction,randomInt,weighted}=require('./store');
const cfg=require('./config'),inventory=require('./inventory');
const collection=require('../games/anime/collection');
const CATALOG=path.resolve(__dirname,'../../data/shoobCards.json');
let cache={mtime:0,cards:[]};
function getCards(){if(!fs.existsSync(CATALOG))return [];const stat=fs.statSync(CATALOG);if(stat.mtimeMs!==cache.mtime){const items=JSON.parse(fs.readFileSync(CATALOG,'utf8'));if(!Array.isArray(items))throw Error('data/shoobCards.json must contain a JSON array.');cache={mtime:stat.mtimeMs,cards:items.filter(c=>c && c.id && c.name && cfg.tiers[String(c.tier)])};}return cache.cards;}
function chooseTier(weights){return weighted(weights);}
function draw(weights=Object.fromEntries(Object.entries(cfg.tiers).map(([tier,value])=>[tier,value.weight]))){const cards=getCards();if(!cards.length)throw Error('Shoob catalog empty. Import master_database.json using scripts/import-shoob.js first.');const eligible=Object.entries(weights).filter(([tier,w])=>Number(w)>0 && cards.some(c=>String(c.tier)===tier));if(!eligible.length)throw Error('No cards available for configured tiers.');const tier=weighted(Object.fromEntries(eligible));const pool=cards.filter(c=>String(c.tier)===tier);return pool[randomInt(0,pool.length-1)];}
function issue(gameId,source,{eventId=null}={}){const tier=String(source.tier),range=cfg.tiers[tier];if(!range)throw Error('Unknown card tier.');const card={cardId:String(source.id),sourceCardId:String(source.id),name:String(source.name),anime:String(source.series||source.anime||'Unknown'),tier,power:randomInt(range.minPower,range.maxPower),maker:String(source.maker||''),image:String(source.image||''),price:Math.max(100,Math.round((range.minPower+range.maxPower)/4)),isEvent:!!eventId,eventId};const result=collection.addCard(gameId,card);const {recordGameEvent}=require('../players');recordGameEvent(result.card ? (db.prepare('SELECT id FROM players WHERE game_id=?').get(gameId)?.id) : '', 'card_collected');return result.card;}
function cardText(card){return `🎴 ${card.name}\n📺 ${card.anime}\n💎 T${card.tier} | ⚡ ${card.power.toLocaleString()} Power\n🆔 ${card.instanceId}${card.isEvent?'\n✨ EXCLUSIVE 1/1 EVENT CARD':''}`;}
const openBundle=withTransaction((gameId,itemId)=>{const rules=cfg.bundleContents[itemId];if(!rules)return{success:false,message:'❌ Not a card bundle.'};if(!inventory.take(gameId,itemId,1))return{success:false,message:'❌ Bundle not found.'};const count=randomInt(rules.min,rules.max),cards=[];for(let i=0;i<count;i++)cards.push(issue(gameId,draw(rules.weights)));return{success:true,message:`🎁 BUNDLE OPENED!\n\n${cards.map((c,i)=>`${i+1}. ${c.name} — T${c.tier} (⚡${c.power})`).join('\n')}\n\nCheck .collection / .deck!`};});
function sourceStatus(){return {count:getCards().length,location:CATALOG};}
function owned(gameId){const p=collection.getCollection(gameId);return [...p.deck,...p.collection];}
function cardValue(c){const tier=Number(c.tier)||6;return Math.max(100,Math.round((Number(c.power)||500)*(.6+tier*.18)));}
module.exports={getCards,draw,issue,cardText,openBundle,sourceStatus,owned,cardValue};

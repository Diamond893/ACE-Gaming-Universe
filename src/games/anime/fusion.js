'use strict';
const crypto=require('crypto');
const {withTransaction}=require('../../database/connection');
const {player,savePlayer}=require('../../database/aguStore');
const cfg=require('../../config/agu');
const collection=require('./collection');
const cards=require('./cards');
// Fixed fee: slightly above the target-tier maximum claim cost.
const RULES=Object.freeze({1:{count:3,fee:25},2:{count:3,fee:60},3:{count:3,fee:135},4:{count:3,fee:260},5:{count:5,fee:515}});
function prices(){return '🧬 NYX FUSION FEES\n\n'+Object.entries(RULES).map(([tier,r])=>`Tier ${tier} → Tier ${Number(tier)+1}: ${r.count} cards + ${r.fee.toLocaleString()} coins`).join('\n')+'\n\nOnly Cards in collection can be be fused, Cards in deck can\'t be used. Event Cards and TS cannot be used.\nFusions are guaranteed.\nUse .fusion <collection slots...>';}
const fuse=withTransaction((gameId,slots)=>{
 if(!Array.isArray(slots)||!slots.length||slots.some(x=>!Number.isSafeInteger(x)||x<1)||new Set(slots).size!==slots.length)return {success:false,message:'❌ Provide distinct collection slots.'};
 const owned=collection.getCollection(gameId);
 const sorted=collection.orderedCollection(owned.collection);
 const inputs=slots.map(slot=>sorted[slot-1]);
 if(inputs.some(x=>!x))return{success:false,message:'❌ Invalid collection slot; no cards consumed.'};
 if(inputs.some(c=>c.isEvent))return{success:false,message:'❌ Event Cards cannot be fused.'};
 const tier=String(inputs[0].tier).replace(/^T/i,'');
 const rule=RULES[tier];
 if(!rule || inputs.length!==rule.count || inputs.some(c=>String(c.tier).replace(/^T/i,'')!==tier))return{success:false,message:'❌ Fusion requires cards from one tier. Check .fusion prices.'};
 const account=player(gameId);
 if(account.coins<rule.fee)return{success:false,message:`❌ Fusion costs ${rule.fee} coins. Balance: ${account.coins}.`};
 const oldRange=cfg.tiers[tier],nextTier=String(Number(tier)+1),range=cfg.tiers[nextTier];
 const percent=inputs.reduce((a,c)=>a+Math.max(0,Math.min(1,((Number(c.power)||oldRange.minPower)-oldRange.minPower)/(oldRange.maxPower-oldRange.minPower))),0)/inputs.length;
 // Integer, cryptographically uniform jitter over [-8%, +8%] percentile.
 const jitter=crypto.randomInt(-800,801)/10000;
 const effective=Math.max(0,Math.min(1,percent+jitter));
 const power=Math.round(range.minPower+effective*(range.maxPower-range.minPower));
 const pool=cards.getCards().filter(c=>String(c.tier)===nextTier);
 if(!pool.length)return{success:false,message:`❌ No Tier ${nextTier} card designs are loaded. No cards consumed.`};
 const source=pool[crypto.randomInt(pool.length)];
 for(const input of inputs){if(!collection.removeCard(gameId,input.instanceId))throw Error('Fusion card was unavailable. Rolled back.');}
 account.coins-=rule.fee;
 savePlayer(account);
 const created=collection.addCard(gameId,{
    cardId:String(source.id),sourceCardId:String(source.id),
    name:String(source.name),anime:String(source.series||source.anime||'Unknown'),
    tier:nextTier,power,maker:String(source.maker||''),image:String(source.image||''),
    isEvent:false,eventId:null,obtainedBy:'fusion'
 }).card;
 return{success:true,message:`🧬 FUSION COMPLETE!\n\n🎴 ${created.name}\n💎 Tier: ${created.tier}\n⚡ Power: ${created.power}\n🆔 ${created.instanceId}\n💰 Fee: ${rule.fee} coins\n🏦 Balance: ${account.coins.toLocaleString()}\n\n${inputs.length} material cards were consumed.`};
});
module.exports={fuse,prices};

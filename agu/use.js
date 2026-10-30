'use strict';
const {db,withTransaction,player,savePlayer}=require('./store');
const inventory=require('./inventory'),cards=require('./cards'),events=require('./events');
const {byId}=require('./items');
const use=withTransaction((gameId,slot)=>{if(!Number.isInteger(slot)||slot<1)return{success:false,message:'❌ Usage: .use <inventory slot>'};const entry=db.prepare('SELECT * FROM inventory_slots WHERE game_id=? AND slot=?').get(gameId,slot);if(!entry)return{success:false,message:'❌ Empty inventory slot.'};
 if(entry.item_id==='event_card_fragment')return events.redeem(gameId);
 if(entry.item_id==='card_fragment'){const {fragmentCost}=require('./config');if(entry.quantity<fragmentCost)return{success:false,message:`🧩 ${entry.quantity}/${fragmentCost} Card Fragments. Keep battling!`};if(!inventory.take(gameId,'card_fragment',fragmentCost))throw Error('Fragment deduction failed.');const result=inventory.add(gameId,'fragment_card_bundle',1,{pendingIfFull:true});return{success:true,message:`🎁 Redeemed ${fragmentCost} Card Fragments for 1 Card Package Bundle!${result.pending?' (pending inventory space)':''}`};}
 if(require('./config').bundleContents[entry.item_id])return cards.openBundle(gameId,entry.item_id);
 if(entry.item_id==='robbery_shield'){const p=player(gameId),now=Date.now();if(p.robShieldUntil>now)return{success:false,message:'🛡️ Your shield is still active.'};inventory.take(gameId,entry.item_id,1);p.robShieldUntil=now+24*3600000;savePlayer(p);return{success:true,message:'🛡️ Robbery Shield activated for 24 hours.'};}
 return{success:false,message:`❌ ${byId(entry.item_id)?.name||entry.item_id} cannot be used yet.`};});
module.exports={use};

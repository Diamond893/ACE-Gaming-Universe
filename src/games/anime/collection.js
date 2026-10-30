'use strict';
const crypto=require('crypto');
const {db,withTransaction}=require('../../database/connection');
const MAX_DECK_SIZE=12;
const empty=()=>({deck:[],collection:[]});
function load(id){if(!id)throw Error('AGU ID is required.');const row=db.prepare('SELECT payload FROM collections WHERE game_id=?').get(id);return row?JSON.parse(row.payload):empty();}
function save(id,data){db.prepare('INSERT INTO collections(game_id,payload) VALUES (?,?) ON CONFLICT(game_id) DO UPDATE SET payload=excluded.payload').run(id,JSON.stringify(data));}
function getCollection(id){return load(id);}
const addCard=withTransaction((gameId,card)=>{
 if(!card||typeof card!=='object'||typeof card.name!=='string'||!card.name.trim())throw Error('Invalid card name.');
 const p=load(gameId),owned={...card,instanceId:crypto.randomUUID(),obtainedAt:new Date().toISOString()};
 const location=p.deck.length<MAX_DECK_SIZE?'deck':'collection';p[location].push(owned);save(gameId,p);return{success:true,location,card:owned};
});
const moveToCollection=withTransaction((id,cardId)=>{const p=load(id),i=p.deck.findIndex(c=>c.instanceId===cardId);if(i<0)return{success:false,message:'Card not found in deck.'};p.collection.push(...p.deck.splice(i,1));save(id,p);return{success:true,message:'Card moved to collection.'};});
const moveToDeck=withTransaction((id,cardId)=>{const p=load(id);if(p.deck.length>=MAX_DECK_SIZE)return{success:false,message:'Deck is full. Maximum 12 cards.'};const i=p.collection.findIndex(c=>c.instanceId===cardId);if(i<0)return{success:false,message:'Card not found in collection.'};p.deck.push(...p.collection.splice(i,1));save(id,p);return{success:true,message:'Card moved to deck.'};});
const swapCards=withTransaction((id,a,b)=>{const p=load(id),i=a-1,j=b-1;if(!Number.isInteger(a)||!Number.isInteger(b)||i<0||j<0||i>=p.deck.length||j>=p.deck.length||i===j)return{success:false,message:'❌ Invalid or duplicate deck slots.'};[p.deck[i],p.deck[j]]=[p.deck[j],p.deck[i]];save(id,p);return{success:true,message:`✅ Deck slots ${a} and ${b} swapped!`};});
module.exports={getCollection,addCard,moveToDeck,moveToCollection,swapCards};
// Universal escrow: removing/restoring original instance retains its 1/1 identity.
const removeCard=withTransaction((id,instanceId)=>{const p=load(id);for(const place of ['deck','collection']){const i=p[place].findIndex(c=>c.instanceId===instanceId);if(i>=0){const [card]=p[place].splice(i,1);save(id,p);return card;}}return null;});
const restoreCard=withTransaction((id,card)=>{if(!card?.instanceId)throw Error('Cannot restore card without instance ID.');const p=load(id);if([...p.deck,...p.collection].some(c=>c.instanceId===card.instanceId))throw Error('Already owned.');p.collection.push(card);save(id,p);return card;});
module.exports.removeCard=removeCard;
module.exports.restoreCard=restoreCard;

// Shared tier ordering for display and slot resolution. Stable among same-tier cards.
function orderedCollection(cards) {
 const rank = c => {const t=String(c.tier||'').toUpperCase().replace(/^T/, '');return t==='S'?7:Number(t)||0;};
 return [...cards].sort((a,b)=>rank(a)-rank(b));
}
const moveSlots=withTransaction((id, slots, direction)=>{
 if(!['deck','collection'].includes(direction))return{success:false,message:'❌ Invalid destination.'};
 if(!Array.isArray(slots)||!slots.length||slots.length>12||slots.some(x=>!Number.isSafeInteger(x)||x<1)||new Set(slots).size!==slots.length)return{success:false,message:'❌ Provide 1–12 distinct positive slot numbers.'};
 const p=load(id),from=direction==='deck'?'collection':'deck',view=from==='collection'?orderedCollection(p.collection):[...p.deck];
 const selected=slots.map(x=>view[x-1]);
 if(selected.some(x=>!x))return{success:false,message:'❌ Invalid slot. No cards moved.'};
 if(direction==='deck'&&p.deck.length+selected.length>MAX_DECK_SIZE)return{success:false,message:'❌ Deck capacity exceeded (12). No cards moved.'};
 const ids=new Set(selected.map(c=>c.instanceId));
 if(ids.size!==selected.length)return{success:false,message:'❌ Duplicate card instance. No cards moved.'};
 p[from]=p[from].filter(c=>!ids.has(c.instanceId));p[direction].push(...selected);save(id,p);
 return{success:true,cards:selected,message:`✅ Moved ${selected.length} card(s) to ${direction}:\n`+selected.map((c,i)=>`${i+1}. ${c.name} — Tier: ${String(c.tier).replace(/^T/i,'')}`).join('\n')};
});
module.exports.orderedCollection=orderedCollection;
module.exports.moveSlots=moveSlots;

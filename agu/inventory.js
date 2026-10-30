'use strict';
const {db,withTransaction,player,savePlayer}=require('./store');
const cfg=require('./config'), {byId,catalog,find,shop}=require('./items');
db.exec(`
 CREATE TABLE IF NOT EXISTS inventory_settings (game_id TEXT PRIMARY KEY REFERENCES players(game_id), capacity INTEGER NOT NULL DEFAULT 50, upgrades INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS inventory_slots (game_id TEXT NOT NULL REFERENCES players(game_id), slot INTEGER NOT NULL, item_id TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0), PRIMARY KEY(game_id,slot), UNIQUE(game_id,item_id));
 CREATE TABLE IF NOT EXISTS pending_inventory (game_id TEXT NOT NULL REFERENCES players(game_id), item_id TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0), PRIMARY KEY(game_id,item_id));
`);
const invRows=db.prepare('SELECT slot,item_id,quantity FROM inventory_slots WHERE game_id=? ORDER BY slot');
function settings(gameId){let row=db.prepare('SELECT * FROM inventory_settings WHERE game_id=?').get(gameId);if(!row){db.prepare('INSERT INTO inventory_settings(game_id,capacity) VALUES (?,?)').run(gameId,cfg.startingSlots);row=db.prepare('SELECT * FROM inventory_settings WHERE game_id=?').get(gameId);}return row;}
function add(gameId,itemId,amount=1,{pendingIfFull=false}={}){
 if(!byId(itemId)||!Number.isSafeInteger(amount)||amount<1)throw Error('Invalid inventory item or amount.');
 const s=settings(gameId), rows=invRows.all(gameId), found=rows.find(i=>i.item_id===itemId);
 if(found){if(found.quantity>Number.MAX_SAFE_INTEGER-amount)throw Error('Inventory quantity limit exceeded.');db.prepare('UPDATE inventory_slots SET quantity=quantity+? WHERE game_id=? AND slot=?').run(amount,gameId,found.slot);return {slot:found.slot,pending:false};}
 const used=new Set(rows.map(i=>i.slot));let slot=1;while(used.has(slot))slot++;
 if(slot>s.capacity){if(!pendingIfFull)throw Error('Inventory full. Free a slot or upgrade.');db.prepare('INSERT INTO pending_inventory(game_id,item_id,quantity) VALUES (?,?,?) ON CONFLICT(game_id,item_id) DO UPDATE SET quantity=quantity+excluded.quantity').run(gameId,itemId,amount);return {pending:true};}
 db.prepare('INSERT INTO inventory_slots VALUES (?,?,?,?)').run(gameId,slot,itemId,amount);return {slot,pending:false};
}
function take(gameId,itemId,amount=1){const row=db.prepare('SELECT * FROM inventory_slots WHERE game_id=? AND item_id=?').get(gameId,itemId);if(!row||row.quantity<amount)return false;if(row.quantity===amount)db.prepare('DELETE FROM inventory_slots WHERE game_id=? AND slot=?').run(gameId,row.slot);else db.prepare('UPDATE inventory_slots SET quantity=quantity-? WHERE game_id=? AND slot=?').run(amount,gameId,row.slot);return true;}
function collectPending(gameId){let received=0;for(const pending of db.prepare('SELECT * FROM pending_inventory WHERE game_id=? ORDER BY item_id').all(gameId)){
 try {add(gameId,pending.item_id,pending.quantity); db.prepare('DELETE FROM pending_inventory WHERE game_id=? AND item_id=?').run(gameId,pending.item_id);received++;}catch(e){if(/full/i.test(e.message))break;throw e;}
}return received;}
function display(gameId,name='Player'){
 const s=settings(gameId);collectPending(gameId);const rows=invRows.all(gameId);
 const groups=new Map();for(const r of rows){const def=byId(r.item_id)||{name:r.item_id,category:'Other',emoji:'📦'};if(!groups.has(def.category))groups.set(def.category,[]);groups.get(def.category).push(`${r.slot}. ${def.emoji} ${def.name} ×${r.quantity}`);}
 const out=[`🌌 NYX INVENTORY\n👤 Player: ${name}\n🎒 Capacity: ${rows.length}/${s.capacity}`];for(const [category,lines] of groups)out.push(`\n── ${category.toUpperCase()}\n${lines.join('\n')}`);
 const pending=db.prepare('SELECT item_id,quantity FROM pending_inventory WHERE game_id=?').all(gameId);if(pending.length)out.push(`\n📨 Pending (space needed): ${pending.map(x=>`${byId(x.item_id)?.name||x.item_id} ×${x.quantity}`).join(', ')}`);
 if(!rows.length)out.push('\nInventory empty.');out.push('\n.use <slot> | .inv upgrade');return out.join('\n');
}
const upgrade=withTransaction((gameId)=>{const s=settings(gameId),price=cfg.firstUpgradeCoins+cfg.upgradeIncrementCoins*s.upgrades,p=player(gameId);if(p.coins<price)return{success:false,message:`❌ Upgrade costs ${price.toLocaleString()} Coins; you have ${p.coins}.`};p.coins-=price;savePlayer(p);db.prepare('UPDATE inventory_settings SET capacity=capacity+?,upgrades=upgrades+1 WHERE game_id=?').run(cfg.upgradeSlots,gameId);collectPending(gameId);return{success:true,message:`🎒 Inventory expanded to ${s.capacity+cfg.upgradeSlots} slots!\n💰 Paid ${price.toLocaleString()} Coins.\nNext upgrade: ${(price+cfg.upgradeIncrementCoins).toLocaleString()} Coins.`};});
function parseOrders(args){const terms=args.map(String);if(!terms.length)throw Error('Usage: .shop buy <shop#> <quantity> OR .shop buy 1:2 3:1');let pairs=[];
 if(terms.every(t=>/^\d+:\d+$/.test(t)))pairs=terms.map(t=>t.split(':').map(Number));
 else if(terms.length<=2 && /^\d+$/.test(terms[0]))pairs=[[Number(terms[0]),terms.length===2?Number(terms[1]):1]];
 else{const selected=find(terms.join(' '));if(!selected)throw Error('Shop item not found. Use .shop for numbered products.');pairs=[[catalog.indexOf(selected)+1,1]];}
 const orders=new Map();for(const [number,quantity] of pairs){if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000||number<1||number>catalog.length)throw Error('Invalid shop item number or quantity (1–1000).');const item=catalog[number-1];orders.set(item.id,(orders.get(item.id)||0)+quantity);}return [...orders].map(([id,quantity])=>({item:catalog.find(x=>x.id===id),quantity}));}
const purchase=withTransaction((gameId,args)=>{let orders;try{orders=parseOrders(args);}catch(e){return{success:false,message:`❌ ${e.message}`};}const total=orders.reduce((n,{item,quantity})=>n+item.price*quantity,0);const p=player(gameId);if(!Number.isSafeInteger(total)||total>p.coins)return{success:false,message:`❌ Insufficient coins. Need ${total.toLocaleString()}.`};
 const s=settings(gameId),rows=invRows.all(gameId),newTypes=orders.filter(o=>!rows.some(r=>r.item_id===o.item.id)).length;if(rows.length+newTypes>s.capacity)return{success:false,message:`❌ Inventory full. Need ${rows.length+newTypes-s.capacity} additional slots.`};
 for(const order of orders)add(gameId,order.item.id,order.quantity);p.coins-=total;savePlayer(p);return{success:true,message:`✅ PURCHASE SUCCESSFUL\n${orders.map(o=>`${o.item.name} ×${o.quantity}`).join('\n')}\n💰 Cost: ${total.toLocaleString()} Coins\n🏦 Balance: ${p.coins.toLocaleString()}\n🎒 Check .inv to use items.`};});
module.exports={settings,add,take,collectPending,display,upgrade,purchase,shop,invRows};

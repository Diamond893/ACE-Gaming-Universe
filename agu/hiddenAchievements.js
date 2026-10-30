'use strict';
// Hidden goals are not shown until unlocked. Edit goals only in backend.
// Enable once you have loaded enough licensed 1/1 event cards.
const achievements=[
 {id:'secret_card_conqueror',name:'Card Conqueror',metric:'battle_wins',target:150,enabled:true},
 {id:'secret_collection_archivist',name:'Collection Archivist',metric:'unique_cards',target:300,enabled:true}
];
const {db,withTransaction}=require('./store');
const inv=require('./inventory'),events=require('./events');
db.exec(`CREATE TABLE IF NOT EXISTS hidden_achievements (game_id TEXT NOT NULL REFERENCES players(game_id), achievement_id TEXT NOT NULL, claimed_at TEXT NOT NULL, PRIMARY KEY(game_id,achievement_id));`);
function view(gameId){const rows=db.prepare('SELECT achievement_id FROM hidden_achievements WHERE game_id=?').all(gameId);const earned=new Set(rows.map(x=>x.achievement_id));return achievements.filter(a=>earned.has(a.id));}
// Rewards must fit 1/1 supply; when catalog empty or fully reserved, do not mint fragments.
const check=withTransaction((gameId)=>{const cards=require('./cards');const wins=db.prepare('SELECT COUNT(*) as count FROM battle_results WHERE winner_id=?').get(gameId)?.count||0;const unique=new Set(cards.owned(gameId).map(c=>c.sourceCardId||c.cardId)).size;
 const notifications=[];for(const a of achievements){if(!a.enabled||db.prepare('SELECT 1 FROM hidden_achievements WHERE game_id=? AND achievement_id=?').get(gameId,a.id))continue;
 const achieved=(a.metric==='battle_wins'?wins:unique)>=a.target;if(!achieved)continue;
 // Every unissued card can be reserved by an outstanding fragment: never promise more than remaining supply.
 const issued=events.remaining().length;
 const outstanding=db.prepare("SELECT COALESCE(SUM(quantity),0) n FROM inventory_slots WHERE item_id='event_card_fragment'").get().n+db.prepare("SELECT COALESCE(SUM(quantity),0) n FROM pending_inventory WHERE item_id='event_card_fragment'").get().n;
 if(issued<=outstanding)continue;
 db.prepare('INSERT INTO hidden_achievements VALUES (?,?,?)').run(gameId,a.id,new Date().toISOString());const grant=inv.add(gameId,'event_card_fragment',1,{pendingIfFull:true});notifications.push(`🌌 SECRET ACHIEVEMENT UNLOCKED!\n🏆 ${a.name}\n🎟️ +1 Event Card Fragment${grant.pending?' (pending inventory space)':''}`);
 }return notifications;});
module.exports={achievements,view,check};

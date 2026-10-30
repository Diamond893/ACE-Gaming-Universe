'use strict';
// Only endgame Event Fragment milestones remain hidden.
// Previous coin milestones now live in visible achievements.js.
const achievements=[
 {id:'secret_card_conqueror',name:'Card Conqueror',description:'Win 500 card battles.',metric:'battle_wins',target:500,rewardItem:'event_card_fragment',enabled:true},
 {id:'secret_collection_archivist',name:'Collection Archivist',description:'Own 1,000 distinct anime card designs.',metric:'unique_cards',target:1000,rewardItem:'event_card_fragment',enabled:true}
];
const {db,withTransaction,player,savePlayer}=require('../database/aguStore');
const inv=require('../inventory/inventory');
const events=require('../games/anime/events');
db.exec(`CREATE TABLE IF NOT EXISTS hidden_achievements (game_id TEXT NOT NULL REFERENCES players(game_id), achievement_id TEXT NOT NULL, claimed_at TEXT NOT NULL, PRIMARY KEY(game_id,achievement_id));`);
function view(gameId){const earned=new Set(db.prepare('SELECT achievement_id FROM hidden_achievements WHERE game_id=?').all(gameId).map(r=>r.achievement_id));return achievements.filter(a=>earned.has(a.id));}
const check=withTransaction(gameId=>{
 const cards=require('../games/anime/cards');
 const wins=db.prepare('SELECT COUNT(*) AS count FROM battle_results WHERE winner_id=?').get(gameId)?.count||0;
 const unique=new Set(cards.owned(gameId).map(c=>c.sourceCardId||c.cardId).filter(Boolean)).size;
 const notifications=require('./achievements').checkCardMilestones(gameId);
 for(const a of achievements){
   if(!a.enabled||db.prepare('SELECT 1 FROM hidden_achievements WHERE game_id=? AND achievement_id=?').get(gameId,a.id))continue;
   if((a.metric==='battle_wins'?wins:unique)<a.target)continue;
   let prizeText='';
   if(a.rewardItem==='event_card_fragment'){
     const remaining=events.remaining().length;
     const outstanding=db.prepare("SELECT COALESCE(SUM(quantity),0) n FROM inventory_slots WHERE item_id='event_card_fragment'").get().n+
       db.prepare("SELECT COALESCE(SUM(quantity),0) n FROM pending_inventory WHERE item_id='event_card_fragment'").get().n;
     if(remaining<=outstanding)continue; // Never overpromise one-of-one event stock.
     const grant=inv.add(gameId,'event_card_fragment',1,{pendingIfFull:true});
     prizeText=`🎟️ +1 Event Card Fragment${grant.pending?' (pending inventory space)':''}`;
   }
   db.prepare('INSERT INTO hidden_achievements VALUES (?,?,?)').run(gameId,a.id,new Date().toISOString());
   notifications.push(`🌌 SECRET ACHIEVEMENT UNLOCKED!\n🏆 ${a.name}\n${prizeText}`);
 }
 return notifications;
});
module.exports={achievements,view,check};

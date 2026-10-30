'use strict';
// Only metrics already wired into the AGU player/stat event system are enabled.
// Keep existing achievement IDs stable to preserve previously claimed rewards.
// Early coin milestones are retired: registration + scheduled claims made them automatic.
// Retired IDs remain in code so historical completion records are not rewritten.
const ACHIEVEMENTS = {
  general: [
    {id:'explorer_5', name:'Getting Started', description:'Use 5 different tracked AGU commands.', event:'unique_command',target:5,reward:50,enabled:true},
    {id:'explorer_10',name:'Curious Mind',description:'Use 10 different tracked AGU commands.',event:'unique_command',target:10,reward:80,enabled:true},
    {id:'explorer_20',name:'Explorer',description:'Use 20 different tracked AGU commands.',event:'unique_command',target:20,reward:120,enabled:true},
    {id:'explorer_35',name:'Command Master',description:'Use 35 different tracked AGU commands.',event:'unique_command',target:35,reward:200,enabled:true},
    {id:'explorer_50',name:'Know It All',description:'Use 50 different tracked AGU commands.',event:'unique_command',target:50,reward:350,enabled:true}
  ],
  economy: [
    {id:'coins_500',name:'Pocket Change',description:'Hold 500 AGU Coins at once.',event:'coins_reached',target:500,reward:20,enabled:false},
    {id:'coins_1500',name:'Coin Keeper',description:'Hold 1,500 AGU Coins at once.',event:'coins_reached',target:1500,reward:40,enabled:false},
    {id:'coins_3000',name:'Savings Habit',description:'Hold 3,000 AGU Coins at once.',event:'coins_reached',target:3000,reward:60,enabled:false},
    {id:'coins_5000',name:'First Savings',description:'Hold 7,500 AGU Coins at once.',event:'coins_reached',target:7500,reward:100,enabled:true},
    {id:'coins_10000',name:'Stacking Up',description:'Hold 15,000 AGU Coins at once.',event:'coins_reached',target:15000,reward:400,enabled:true},
    {id:'coins_25000',name:'High Roller',description:'Hold 25,000 AGU Coins at once.',event:'coins_reached',target:25000,reward:1000,enabled:true},
    {id:'coins_50000',name:'Fortune Builder',description:'Hold 50,000 AGU Coins at once.',event:'coins_reached',target:50000,reward:5000,enabled:true},
    {id:'coins_100000',name:'Millionaire Mindset',description:'Hold 100,000 AGU Coins at once.',event:'coins_reached',target:100000,reward:8000,enabled:true}
  ],
  progression: [
    {id:'level_3',name:'First Steps',description:'Reach player level 3.',event:'level_reached',target:3,reward:50,enabled:true},
    {id:'level_5',name:'Newcomer',description:'Reach player level 5.',event:'level_reached',target:5,reward:120,enabled:true},
    {id:'level_10',name:'Rising Star',description:'Reach player level 10.',event:'level_reached',target:10,reward:200,enabled:true},
    {id:'level_15',name:'Steady Climber',description:'Reach player level 15.',event:'level_reached',target:15,reward:300,enabled:true},
    {id:'level_20',name:'Seasoned Player',description:'Reach player level 20.',event:'level_reached',target:20,reward:500,enabled:true},
    {id:'level_25',name:'Mid-Tier',description:'Reach player level 25.',event:'level_reached',target:25,reward:750,enabled:true},
    {id:'level_30',name:'Veteran',description:'Reach player level 30.',event:'level_reached',target:30,reward:1000,enabled:true},
    {id:'level_50',name:'Legend',description:'Reach player level 50.',event:'level_reached',target:50,reward:3000,enabled:true}
  ],
  experience: [
    {id:'exp_100',name:'Spark',description:'Accumulate 100 EXP.',event:'exp_reached',target:100,reward:20,enabled:true},
    {id:'exp_500',name:'Momentum',description:'Accumulate 500 EXP.',event:'exp_reached',target:500,reward:50,enabled:true},
    {id:'exp_2000',name:'Dedicated',description:'Accumulate 2,000 EXP.',event:'exp_reached',target:2000,reward:120,enabled:true},
    {id:'exp_5000',name:'Unstoppable',description:'Accumulate 5,000 EXP.',event:'exp_reached',target:5000,reward:250,enabled:true},
    {id:'exp_10000',name:'AGU Mainstay',description:'Accumulate 10,000 EXP.',event:'exp_reached',target:10000,reward:500,enabled:true}
  ],
  consistency: [
    {id:'streak_3',name:'Three-Day Flame',description:'Reach a 3-day activity streak.',event:'activity_streak',target:3,reward:40,enabled:true},
    {id:'streak_7',name:'Week Warrior',description:'Reach a 7-day activity streak.',event:'activity_streak',target:7,reward:100,enabled:true},
    {id:'streak_14',name:'Fortnight Flame',description:'Reach a 14-day activity streak.',event:'activity_streak',target:14,reward:250,enabled:true},
    {id:'streak_30',name:'Monthly Loyalist',description:'Reach a 30-day activity streak.',event:'activity_streak',target:30,reward:600,enabled:true}
  ],
  card_battles: [
    {id:'secret_first_blood',name:'First Blood',description:'Win your first card battle.',event:'battle_wins',target:1,reward:30,enabled:true},
    {id:'secret_duelist_5',name:'Rising Duelist',description:'Win 5 card battles.',event:'battle_wins',target:5,reward:75,enabled:true},
    {id:'secret_duelist_15',name:'Relentless Rival',description:'Win 15 card battles.',event:'battle_wins',target:15,reward:150,enabled:true},
    {id:'secret_duelist_50',name:'Arena Champion',description:'Win 50 card battles.',event:'battle_wins',target:50,reward:400,enabled:true},
    {id:'secret_duelist_100',name:'Unyielding',description:'Win 100 card battles.',event:'battle_wins',target:100,reward:800,enabled:true}
  ],
  card_collection: [
    {id:'secret_collector_10',name:'The Collector',description:'Own 10 distinct anime card designs.',event:'unique_cards',target:10,reward:60,enabled:true},
    {id:'secret_collector_25',name:'Card Curator',description:'Own 25 distinct anime card designs.',event:'unique_cards',target:25,reward:150,enabled:true},
    {id:'secret_collector_50',name:'Archive Keeper',description:'Own 50 distinct anime card designs.',event:'unique_cards',target:50,reward:350,enabled:true},
    {id:'secret_collector_100',name:'Living Library',description:'Own 100 distinct anime card designs.',event:'unique_cards',target:100,reward:750,enabled:true}
  ],
  anime: [
    // The existing game has cards, but card_collected is not yet wired to recordGameEvent.
    {id:'first_anime_card',name:'First Pull',description:'Collect your first anime card (tracking not connected yet).',event:'card_collected',target:1,reward:100,enabled:false}
  ],
  football:[],pokemon:[],rpg:[]
};
const STAT_READERS = {
  coins_reached: p => Number(p.coins||0), level_reached: p => Number(p.level||0),
  exp_reached: p => Number(p.exp||0), activity_streak: p => Number(p.activityStreak||0)
};
function allAchievements(){return Object.values(ACHIEVEMENTS).flat();}
function getCompletedAchievements(player){const completed=new Set(player.completedAchievements||[]);return allAchievements().filter(a=>completed.has(a.id));}
function checkStatAchievements(player){
  if(!Array.isArray(player.completedAchievements))player.completedAchievements=[];
  const awards=[];
  for(const a of allAchievements()){
    if(!a.enabled||!Object.prototype.hasOwnProperty.call(STAT_READERS,a.event)||player.completedAchievements.includes(a.id))continue;
    if(!Number.isFinite(a.target)||!Number.isFinite(a.reward)||a.reward<0)continue;
    if(STAT_READERS[a.event](player)<a.target)continue;
    player.completedAchievements.push(a.id); player.coins+=a.reward;
    awards.push({name:a.name,reward:a.reward});
  }
  return awards;
}
function applyAchievementEvent(player,event,detail){
  if(!player.achievementCounters)player.achievementCounters={};
  if(!Array.isArray(player.completedAchievements))player.completedAchievements=[];
  if(!Array.isArray(player.uniqueCommands))player.uniqueCommands=[];
  if(event==='unique_command'){
    if(!detail||player.uniqueCommands.includes(detail))return [];
    player.uniqueCommands.push(detail);player.achievementCounters.unique_command=player.uniqueCommands.length;
  }else player.achievementCounters[event]=(player.achievementCounters[event]||0)+1;
  const awards=[];
  for(const a of allAchievements()){
    if(!a.enabled||a.event!==event||player.completedAchievements.includes(a.id))continue;
    if((player.achievementCounters[event]||0)<a.target)continue;
    player.completedAchievements.push(a.id);player.coins+=a.reward;
    awards.push({name:a.name,reward:a.reward});
  }
  return awards;
}

// Card milestones are ordinary, visible achievements. Their historical IDs are
// preserved so players who earned them as hidden achievements are NOT paid again.
// Uses the existing hidden_achievements ledger for cross-version idempotency.
function cardAchievementProgress(gameId) {
  const {db}=require('../database/aguStore');
  const cards=require('../games/anime/cards');
  const wins=db.prepare('SELECT COUNT(*) AS n FROM battle_results WHERE winner_id=?').get(gameId)?.n || 0;
  const unique=new Set(cards.owned(gameId).map(c=>c.sourceCardId||c.cardId).filter(Boolean)).size;
  const earned=new Set(db.prepare('SELECT achievement_id FROM hidden_achievements WHERE game_id=?').all(gameId).map(r=>r.achievement_id));
  return [...ACHIEVEMENTS.card_battles,...ACHIEVEMENTS.card_collection].map(a=>({
    ...a,progress:a.event==='battle_wins'?wins:unique,completed:earned.has(a.id)
  }));
}
function checkCardMilestones(gameId) {
  const {db,withTransaction,player,savePlayer}=require('../database/aguStore');
  return withTransaction(()=>{
    const alerts=[];
    for(const a of cardAchievementProgress(gameId)) {
      if(!a.enabled||a.completed||a.progress<a.target)continue;
      // No duplicate awards even if this check runs after every claim or battle.
      const inserted=db.prepare('INSERT OR IGNORE INTO hidden_achievements (game_id,achievement_id,claimed_at) VALUES (?,?,?)')
        .run(gameId,a.id,new Date().toISOString());
      if(inserted.changes!==1)continue;
      const p=player(gameId);p.coins+=a.reward;savePlayer(p);
      alerts.push(`🏆 ACHIEVEMENT UNLOCKED!\n${a.name}\n🪙 +${a.reward} AGU Coins`);
    }
    return alerts;
  })();
}
module.exports={ACHIEVEMENTS,allAchievements,getCompletedAchievements,applyAchievementEvent,checkStatAchievements,cardAchievementProgress,checkCardMilestones};

'use strict';
const crypto=require('crypto');

//missions
const MISSION_LIBRARY=[
  {id:'daily_claim',name:'Collect your daily login reward',description:'Successfully claim .daily today.',event:'daily_claimed',target:1,reward:30,group:'routine',enabled:true},
  {id:'check_streak',name:'Check your activity streak',description:'Use .streak today.',event:'streak_viewed',target:1,reward:20,group:'routine',enabled:true},
  {id:'streak_twice',name:'Keep an Eye on the Streak',description:'Check .streak twice today.',event:'streak_viewed',target:2,reward:35,group:'routine',enabled:true},
  {id:'view_deck',name:'Inspect your anime deck',description:'Open .deck today.',event:'deck_viewed',target:1,reward:20,group:'cards',enabled:true},
  {id:'view_collection',name:'Browse your collection',description:'Open .collection or .coll today.',event:'collection_viewed',target:1,reward:20,group:'cards',enabled:true},
  {id:'deck_twice',name:'Deck Double-Check',description:'Open .deck twice today.',event:'deck_viewed',target:2,reward:35,group:'cards',enabled:true},
  {id:'collection_twice',name:'Vault Explorer',description:'Open .collection twice today.',event:'collection_viewed',target:2,reward:35,group:'cards',enabled:true},
  {id:'deck_three',name:'Deck Analyst',description:'Open .deck three times today.',event:'deck_viewed',target:3,reward:50,group:'cards',enabled:true},
  {id:'collection_three',name:'Collection Curator',description:'Open .collection three times today.',event:'collection_viewed',target:3,reward:50,group:'cards',enabled:true},
  {id:'variety_2',name:'Try two different tracked actions',description:'Use 2 distinct tracked AGU actions today.',event:'unique_command',target:2,reward:20,group:'variety',enabled:true},
  {id:'variety_3',name:'Mix things up',description:'Use 3 distinct tracked AGU actions today.',event:'unique_command',target:3,reward:35,group:'variety',enabled:true},
  {id:'variety_4',name:'AGU All-Rounder',description:'Use 4 distinct tracked AGU actions today.',event:'unique_command',target:4,reward:50,group:'variety',enabled:true},
  {id:'variety_5',name:'Busy Explorer',description:'Use 5 distinct tracked AGU actions today.',event:'unique_command',target:5,reward:70,group:'variety',enabled:true},
  {id:'variety_6',name:'Command Wanderer',description:'Use 6 distinct tracked AGU actions today.',event:'unique_command',target:6,reward:100,group:'variety',enabled:true},
  {id:'variety_7',name:'AGU Tour',description:'Use 7 distinct tracked AGU actions today.',event:'unique_command',target:7,reward:150,group:'variety',enabled:true},
  {id:'collect_anime_1',name:'Collect an anime card',description:'Collect one card after card event tracking is enabled.',event:'card_collected',target:1,reward:50,group:'cards',enabled:true},
  {id:'collect_anime_3',name:'Collect 3 anime cards',description:'Collect three cards after card event tracking is enabled.',event:'card_collected',target:3,reward:200,group:'cards',enabled:true},
  {id:'collect_anime_5',name:'Collect 5 anime cards',description:'Collect five cards after card event tracking is enabled.',event:'card_collected',target:5,reward:350,group:'cards',enabled:true}
];
function watDay(date=new Date()){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const get=k=>parts.find(x=>x.type===k).value;
 return `${get('year')}-${get('month')}-${get('day')}`;
}
// Exactly three missions: one routine, one cards, one variety.
// Exactly five missions: two routine, two cards, one variety.
function todaysMissions(day=watDay()){
 const groups=[
   {name:'routine',count:1},
   {name:'cards',count:3},
   {name:'variety',count:1}
 ];

 return groups.flatMap(({name,count})=>{
   const choices=MISSION_LIBRARY.filter(m=>m.enabled&&m.group===name);
   if(!choices.length)return [];

   const base=crypto.createHash('sha256')
     .update(`AGU-MISSIONS-V3:${name}`)
     .digest().readUInt32BE(0);

   const ordinal=Math.floor(Date.parse(`${day}T00:00:00Z`)/86400000);

   return Array.from({length:count},(_,i)=>
     choices[(base+ordinal+i)%choices.length]
   ).filter(Boolean);
 });
}
function ensureDailyState(player,day=watDay()){
 if(!player.dailyMissionState||player.dailyMissionState.day!==day){
   player.dailyMissionState={day,progress:{},completed:[],seenCommands:[]};
 }
 return player.dailyMissionState;
}
function getDailyMissionStatus(player,day=watDay()){
 const state=player.dailyMissionState?.day===day?player.dailyMissionState:null;
 return todaysMissions(day).map(m=>({
   id:m.id,name:m.name,description:m.description,category:m.group,target:m.target,reward:m.reward,
   progress:Math.min(m.target,state?.progress?.[m.id]||0),completed:Boolean(state?.completed?.includes(m.id))
 }));
}
function applyMissionEvent(player,event,detail,day=watDay()){
 const state=ensureDailyState(player,day);
 if(event==='unique_command'){
   if(!detail||state.seenCommands.includes(detail))return [];
   state.seenCommands.push(detail);
 }
 const prizes=[];
 for(const m of todaysMissions(day)){
   if(m.event!==event||state.completed.includes(m.id))continue;
   state.progress[m.id]=event==='unique_command' ? state.seenCommands.length : (state.progress[m.id]||0)+1;
   if(state.progress[m.id]>=m.target){
     state.completed.push(m.id);player.coins+=m.reward;
     prizes.push({name:m.name,reward:m.reward});
   }
 }
 return prizes;
}
module.exports={MISSION_LIBRARY,watDay,todaysMissions,getDailyMissionStatus,applyMissionEvent};

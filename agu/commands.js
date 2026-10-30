'use strict';
const inv=require('./inventory'),items=require('./items'),use=require('./use');
const cards=require('./cards'),spawns=require('./spawns'),battles=require('./battles'),auctions=require('./auctions'),hidden=require('./hiddenAchievements');
const {getCollection}=require('../games/anime/collection');
const ALL=new Set(['inv','inventory','use','claim','cardbattle','cs','cardselect','escrow','auction','cardinfo']);
// Synchronous command handlers use existing transaction-based player identity.
function execute({cmd,args,player,platform,communityId,isAdmin=false,targetGameId=null}){
 const gameId=player.gameId, sub=String(args[0]||'').toLowerCase();
 try{
 if(cmd==='inv'||cmd==='inventory')return sub==='upgrade'?inv.upgrade(gameId):{success:true,message:inv.display(gameId,player.name)};
 if(cmd==='use')return use.use(gameId,Number(args[0]));
 if(cmd==='claim')return spawns.claim(platform,communityId,args[0],gameId);
 if(cmd==='cardinfo'){const r=cards.owned(gameId);const ix=Number(args[0])-1;const c=r[ix]||r.find(x=>x.instanceId===args[0]);return c?{success:true,message:cards.cardText(c)}:{success:false,message:'❌ Card not found. Slots are deck first, followed by collection.'};}
 if(cmd==='cardbattle'){
  if(sub==='accept'||sub==='decline')return battles.reply(platform,communityId,gameId,sub==='accept');
  if(!targetGameId)return{success:false,message:'❌ Mention a registered opponent: .cardbattle @player'};
  return battles.challenge(platform,communityId,gameId,targetGameId);
 }
 if(cmd==='cs'||cmd==='cardselect')return battles.select(platform,communityId,gameId,args.map(Number));
 if(cmd==='escrow'){
   if(sub==='add')return auctions.submit(gameId,String(args[1]||'').toLowerCase(),String(args[2]||''));
   if(sub==='withdraw')return auctions.withdraw(gameId,String(args[1]||'').toUpperCase());
   if(sub==='queue')return auctions.queue();
   return{success:false,message:'❌ .escrow add card <instanceId> | .escrow add bundle <itemId> | .escrow withdraw <ID> | .escrow queue'};
 }
 if(cmd==='auction'){
  if(sub==='status'||!sub)return auctions.status(platform,communityId);
  if(sub==='bid')return auctions.bid(platform,communityId,gameId,Number(args[1]));
  if(!isAdmin)return{success:false,message:'❌ Only community admins may manage auctions.'};
  if(sub==='start')return auctions.start(platform,communityId,gameId);
  if(sub==='stop')return auctions.stop(platform,communityId);
  if(sub==='queue')return auctions.queue();
  if(sub==='next')return auctions.next(platform,communityId,String(args[1]||'').toUpperCase());
  return{success:false,message:'❌ .auction start | next <escrow ID> | bid <amount> | stop | status'};
 }
 return{success:false,message:'❌ Unknown command.'};
 }catch(e){return{success:false,message:`❌ ${e.message}`};}
}
function cardsFeature({args,platform,communityId,isAdmin}){const sub=String(args[0]||'status').toLowerCase();if(['on','off','enable','disable'].includes(sub)){if(!isAdmin)return{success:false,message:'❌ Only group/server admins can toggle cards.'};return spawns.toggle(platform,communityId,['on','enable'].includes(sub));}return spawns.status(platform,communityId);}
module.exports={ALL,execute,cardsFeature,items,inv,hidden};

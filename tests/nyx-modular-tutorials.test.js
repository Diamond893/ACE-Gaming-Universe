'use strict';
const assert = require('node:assert/strict');
const {createEngine,isNewPlayer} = require('../src/core/tutorials/engine');
const features = require('../src/core/tutorials/registry');
const storage = new Map();
const players = new Map([
 ['whatsapp:a',{gameId:'AGU-001',joined:new Date(Date.now()-60000).toISOString()}],
 ['discord:b',{gameId:'AGU-001',joined:new Date(Date.now()-60000).toISOString()}],
 ['whatsapp:old',{gameId:'AGU-OLD',joined:new Date(Date.now()-86400000*7).toISOString()}]
]);
let history = new Map();
const key=(gid,feat)=>gid+'|'+feat;
const deps={
 features,
 getPlayer:(platform,id)=>players.get(platform+':'+id),
 getUses:(gid,feat)=>storage.get(key(gid,feat))||0,
 setUses:(gid,feat,n)=>storage.set(key(gid,feat),n),
 historicalUses:(gid,feat)=>history.get(key(gid,feat))||0
};
const engine=createEngine(deps);
const ctx=(cmd,args=[],userId='a',platform='whatsapp')=>({platform,userId,command:cmd,args});
const ok=(message='✅ Existing response',extra={})=>({success:true,message,...extra});
const fail=m=>({success:false,message:m});
function apply(command,args,reply,userId='a',platform='whatsapp'){
 return engine.decorate(reply,ctx(command,args,userId,platform));
}
function test(){
 assert(engine.rules.length>=15, 'must cover current games & economy');
 for(let n=0;n<4;n++){
  const r=apply('cardbattle',['@player'],ok('⚔️ Existing battle challenge',{mentions:['555@lid']}));
  assert(r.message.startsWith('⚔️ Existing battle challenge'));
  assert.deepEqual(r.mentions,['555@lid']);
  assert.equal(r.message.includes('🌙 NYX:'),n<3);
 }
 assert.equal(storage.get('AGU-001|battle_challenge'),3);
 // The linked Discord account shares the same tutorial history.
 assert.equal(apply('cardbattle',['@player'],ok(), 'b','discord').message, '✅ Existing response');
 // Accepted battles advance on their own counter.
 assert.match(apply('cardbattle',['accept'],ok()).message,/🌙 NYX/);
 const before=engine.count('AGU-001','battle_select');
 const cinematic=ok('⚔️', {battleNarration:['intro','1','2','3','4','outro']});
 assert.deepEqual(apply('cs',['1','2','3','4'],cinematic),cinematic);
 assert.equal(engine.count('AGU-001','battle_select'),before+1);
 // Three uses then stop teaching for bids, shop, and seller flows separately.
 for(const cmd of [
   ['auction',['bid','1500'],'auction_bid'],
   ['escrow',['add','card','id'],'escrow_sell'],
   ['shop',['buy','2','3'],'shop_buy'],
   ['shop',['sell','card','1'],'shop_sell'],
   ['referral',['use','AGU-123'],'referral_use'],
   ['trade',['2','5','AGU-OTHER'],'trade_offer'],
 ]) {
  for(let n=0;n<5;n++){
   const res=apply(cmd[0],cmd[1],ok());
   assert.equal(res.message.includes('🌙 NYX:'),n < (cmd[2]==='referral_use'?1:['shop_buy','shop_sell','trade_offer'].includes(cmd[2])?2:3),cmd[2]+' '+n);
  }
 }
 // One-off hints for browsing and referrals.
 assert.match(apply('referral',[],ok()).message,/Share YOUR AGU ID/);
 assert.equal(apply('referral',[],ok()).message,'✅ Existing response');
 // Bad commands do not advance gameplay tutorial counters; errors get short guidance once.
 const n=engine.count('AGU-001','shop_sell');
 const error=fail('❌ Select between 1 and 9 valid card slots.');
 assert.match(apply('shop',['sell','card','90'],error).message,/💡/);
 assert.equal(apply('shop',['sell','card','90'],error).message,error.message);
 assert.equal(engine.count('AGU-001','shop_sell'),n);
 assert.equal(apply('shop',['sell','card','90'],error,'old').message,error.message);
 assert.equal(isNewPlayer(players.get('whatsapp:old')),false);
 // Legacy counters remain honored even after swapping to modular engine.
 history.set('AGU-OLD|battle_challenge',12);
 assert.equal(apply('cardbattle',['@player'],ok(),'old').message,'✅ Existing response');
 // Mini game adapters preserve base messages and reject invalid non-gameplay text.
 const rps=ctx('rps',['rock']);
 assert.equal(engine.decorateText(rps,'🎮 ROCK PAPER SCISSORS\nChoose one:'),'🎮 ROCK PAPER SCISSORS\nChoose one:');
 assert.match(engine.decorateText(rps,'╭────❰ 🎮 ROCK PAPER SCISSORS ❱────╮'),/🌙 NYX/);
 const quiz=engine.decorateText(ctx('quiz',['start']), '🌌 NYX QUIZ BATTLE STARTED!');
 assert.match(quiz,/NYX:/);
 const ttt=engine.decorateText(ctx('ttt',['challenge']), '🎮 TIC-TAC-TOE\nChallenge sent!');
 assert.match(ttt,/Opponent accepts/);
 const invalid=engine.decorateText(ctx('ttt',['challenge']), '❌ Mention a player: .ttt challenge @player');
 assert.match(invalid,/💡/);
 // Engine can be constructed for a future game, with no processor surgery.
 const newEngine=createEngine({...deps,features:[...features,{rules:[{id:'football_match',limit:1,matches:c=>c.command==='footballmatch',tips:[c=>`Formation first: ${c.prefix}team.`]}]}]});
 assert.match(newEngine.decorate(ok(),ctx('footballmatch')).message,/Formation first/);
 console.log('✅ NYX modular tutorial engine: all tests passed.');
}
test();

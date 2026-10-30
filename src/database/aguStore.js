'use strict';
const { db,withTransaction } = require('./connection');
const crypto = require('crypto');
function randomInt(min,max){return crypto.randomInt(min,max+1);}
function player(gameId){const row=db.prepare('SELECT id,payload FROM players WHERE game_id=?').get(gameId);if(!row)throw Error('Player account not found.');return JSON.parse(row.payload);}
const coinLedger = require('../economy/coinLedger');
function savePlayer(p, ledgerMeta = {}) {
 if(!p || !p.gameId) throw Error('Invalid player.');
 const operation = db.transaction(() => {
  const oldRow = db.prepare('SELECT id, payload FROM players WHERE game_id=?').get(p.gameId);
  if (!oldRow) throw Error('Player disappeared.');
  let oldBalance = null;
  try { oldBalance = JSON.parse(oldRow.payload).coins; } catch { oldBalance = null; }
  const n = db.prepare('UPDATE players SET payload=? WHERE game_id=?').run(JSON.stringify(p),p.gameId).changes;
  if(n!==1) throw Error('Player disappeared.');
  coinLedger.recordBalanceChange({
   playerId: oldRow.id, gameId: p.gameId, oldBalance, newBalance: p.coins,
   meta: { ...ledgerMeta, transactionId: ledgerMeta.transactionId || crypto.randomUUID() },
   stack: new Error().stack
  });
 });
 return operation.immediate();
}
function weighted(weights){const entries=Object.entries(weights).filter(([_,x])=>Number(x)>0);const sum=entries.reduce((a,[_,w])=>a+Number(w),0);if(!sum)throw Error('No configured weights.');let n=crypto.randomInt(1000000)/1000000*sum;for(const [key,w] of entries){n-=Number(w);if(n<0)return key;}return entries.at(-1)[0];}
function watDay(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
module.exports={db,withTransaction,randomInt,player,savePlayer,weighted,watDay};

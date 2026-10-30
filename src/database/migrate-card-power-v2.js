'use strict';
// Usage: node src/database/migrate-card-power-v2.js --dry-run
// After copying the SQLite database with NYX stopped: --apply
// Never run simultaneously with the WhatsApp/Discord processes.
const {db}=require('./connection');
const OLD={1:[100,999],2:[1000,1999],3:[2000,2999],4:[3000,3999],5:[4000,4999],6:[5000,5999],S:[6000,6999]};
const NEW={1:[90,199],2:[200,399],3:[400,799],4:[800,1599],5:[1600,3199],6:[3200,6399],S:[6400,12799]};
const apply=process.argv.includes('--apply');
if(!apply&&!process.argv.includes('--dry-run')){console.error('Use --dry-run or --apply');process.exit(1);}
if(apply)db.exec('CREATE TABLE IF NOT EXISTS card_power_migrations (migration_id TEXT PRIMARY KEY, applied_at TEXT NOT NULL, updated_cards INTEGER NOT NULL)');
const migrationId='card-power-v2-2026-10';
if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='card_power_migrations'").get() && db.prepare('SELECT 1 FROM card_power_migrations WHERE migration_id=?').get(migrationId)){
 console.log('Already migrated. No changes made.');process.exit(0);
}
const changes=[];
function rescale(c){
 if(!c||typeof c!=='object')return false;
 const tier=String(c.tier??'').toUpperCase().replace(/^T/,'');const old=OLD[tier],next=NEW[tier];
 if(!old||!next||!Number.isFinite(Number(c.power)))return false;
 const oldPower=Number(c.power);const base=oldPower; // Historical Event Cards did not yet receive the 5% bonus.
 const pct=Math.max(0,Math.min(1,(base-old[0])/(old[1]-old[0])));
 c.power=Math.round((next[0]+pct*(next[1]-next[0]))*(c.isEvent?1.05:1));return true;
}
for(const row of db.prepare('SELECT game_id,payload FROM collections').all()){
 const data=JSON.parse(row.payload);let n=0;
 for(const c of [...(data.deck||[]),...(data.collection||[])])if(rescale(c))n++;
 if(n)changes.push({table:'collections',key:row.game_id,payload:JSON.stringify(data),count:n});
}
for(const row of db.prepare("SELECT id,payload FROM global_escrow WHERE asset_type='card' AND state IN ('pending','active')").all()){
 const data=JSON.parse(row.payload);if(rescale(data))changes.push({table:'global_escrow',key:row.id,payload:JSON.stringify(data),count:1});
}
const total=changes.reduce((n,x)=>n+x.count,0);
console.log(`${apply?'APPLY':'PREVIEW'}: ${total} card copies in ${changes.length} rows`);
if(apply){
 db.transaction(()=>{
  for(const x of changes){
   if(x.table==='collections')db.prepare('UPDATE collections SET payload=? WHERE game_id=?').run(x.payload,x.key);
   else db.prepare('UPDATE global_escrow SET payload=? WHERE id=?').run(x.payload,x.key);
  }
  db.prepare('INSERT INTO card_power_migrations VALUES (?,?,?)').run(migrationId,new Date().toISOString(),total);
 }).immediate();
 console.log('Migration committed.');
}else console.log('No card values were changed.');

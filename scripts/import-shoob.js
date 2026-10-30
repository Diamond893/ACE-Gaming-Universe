'use strict';
// Usage: node scripts/import-shoob.js "C:\\path\\to\\master_database.json"
const fs=require('fs'),path=require('path');
const source=process.argv[2];if(!source){console.error('Usage: node scripts/import-shoob.js path/to/master_database.json');process.exit(1);}
const raw=JSON.parse(fs.readFileSync(path.resolve(source),'utf8'));
const data=Array.isArray(raw)?raw:Array.isArray(raw.cards)?raw.cards:Array.isArray(raw.data)?raw.data:Object.values(raw).flatMap(v=>Array.isArray(v)?v:[]);
const safeText=x=>typeof x==='string'?x.trim():'';
const getTier=v=>{const m=String(v??'').match(/(?:tier\s*)?(S|[1-6])\b/i);return m?m[1].toUpperCase():null;};
const seen=new Set(),items=[];
for(const r of data){if(!r||typeof r!=='object')continue;
 const id=safeText(r.id||r._id||r.cardId||r.card_id||r.cardID),name=safeText(r.name||r.character||r.title||r.character_name),tier=getTier(r.tier||r.rarity||r.tier_name);
 if(!id||!name||!tier||seen.has(id))continue;
 const image=safeText(r.imageUrl||r.image_url||r.image||r.imageURL||r.url||r.image_link);
 const series=safeText(r.series||r.anime||r.anime_name||r.source||r.origin)||'Unknown';
 const maker=safeText(r.maker||r.creator||r.artist);
 // Do not guess image URLs. They may be missing: user must validate source metadata.
 items.push({id,name,series,tier,image,maker});seen.add(id);
}
const output=path.join(__dirname,'../data/shoobCards.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(items));
console.log(`Imported ${items.length} Shoob card designs (${items.filter(x=>x.image).length} with images) to ${output}`);
if(!items.length)console.warn('WARNING: Could not read this database format; inspect source keys before use.');

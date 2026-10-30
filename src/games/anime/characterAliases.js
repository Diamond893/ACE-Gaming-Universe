'use strict';
// Franchise-aware canonical names generated from the uploaded name-variant list.
const REGISTRY = require('./characterRegistry.json');
function norm(s) { return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim(); }
const lookup = new Map();
for (const row of REGISTRY) for (const spelling of [row.name,...row.aliases]) {
 const key=norm(row.series)+'|'+norm(spelling);
 if (lookup.has(key) && lookup.get(key)!==row.name) throw new Error('Conflicting alias: '+key);
 lookup.set(key,row.name);
}
function resolve(series,name) { return lookup.get(norm(series)+'|'+norm(name)) || null; }
module.exports={norm,resolve,registry:REGISTRY};

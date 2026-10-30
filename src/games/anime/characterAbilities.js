'use strict';
// Explicit, reviewed character-specific signature moves. All types use V1.1 battle math.
const rows=require('./characterAbilities.json');
const {norm}=require('./characterAliases');
const skills=new Map();
function register(series,name,type,ability,description) {skills.set(norm(series)+'|'+norm(name),{type,name:ability,description,source:'character'});}
for(const [series,name,type,ability,description] of rows)register(series,name,type,ability,description);
function lookup(series,name) {return skills.get(norm(series)+'|'+norm(name)) || null;}
module.exports={lookup,register,count:skills.size};

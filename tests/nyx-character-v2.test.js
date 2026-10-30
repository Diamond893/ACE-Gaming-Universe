'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {getAbility,simulate}=require('../src/games/anime/abilities');
const {registry,resolve}=require('../src/games/anime/characterAliases');
assert.equal(registry.length,927);
let checked=0;
for(const r of registry){
 const a=getAbility({name:r.name,series:r.series,power:500,tier:3});
 assert.ok(a.name && a.type);
 for(const alt of r.aliases){
  assert.equal(resolve(r.series,alt),r.name);
  const b=getAbility({name:alt,series:r.series,power:300,tier:2});
  assert.equal(b.name,a.name,`Ability differs: ${r.series} ${r.name} / ${alt}`);
  assert.equal(b.type,a.type);
  checked++;
 }
}
assert.equal(getAbility({name:'Maki Zenin',anime:'Jujutsu Kaisen'}).source,'character');
assert.equal(getAbility({name:'Yor & Anya',anime:'Spy x Family'}).name,'🤝 United Front');
assert.equal(getAbility({name:'Unknown original person',anime:'Sample series'}).source,'fallback');
const c=(name,power,anime='Naruto')=>({name,anime,power,tier:3});
const teamA=[c('Naruto Uzumaki',800),c('Sasuke',500),c('Kakashi',450),c('Sakura',400)];
const teamB=[c('Itachi',700),c('Madara',600),c('Hinata',400),c('Pain',350)];
const r1=simulate(teamA,teamB),r2=simulate(teamA,teamB);
assert.deepEqual(r1,r2); assert.equal(r1.rounds.length,4);
assert.deepEqual(teamA.map(x=>x.power),[800,500,450,400]);
console.log(`PASS: ${registry.length} listed characters, ${checked} alias variants, fixed skills, groups, unknowns and four-round simulation.`);

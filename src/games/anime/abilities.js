'use strict';
// NYX battle-only signature abilities. No card/database mutations.
const crypto = require('crypto');
const aliases=require('./characterAliases');
const characterAbilities=require('./characterAbilities');
const TYPES = ['assault', 'enhance', 'guard', 'support', 'disrupt', 'recover'];
const FALLBACK = {
  assault: ['⚔️ Battle Rush', 'An attack that strengthens this card’s strike.'],
  enhance: ['⚡ Battle Instinct', 'Temporarily enhances this card’s contribution.'],
  guard: ['🛡️ Guardian Stance', 'Blocks part of the opposing strike bonus.'],
  support: ['🤝 Rallying Cry', 'Empowers allies acting in later rounds.'],
  disrupt: ['🌑 Power Break', 'Temporarily weakens the opposing card.'],
  recover: ['💚 Second Wind', 'Recovers disruption or provides a small resilience bonus.']
};
// Exact identity includes the series to prevent namesakes from receiving the wrong power.
const SIGNATURES = [
  ['naruto','naruto uzumaki','assault','🌀 Rasengan','Naruto unleashes a focused Rasengan.'],
  ['naruto','sasuke uchiha','disrupt','⚡ Chidori','Sasuke strikes through enemy defenses.'],
  ['naruto','itachi uchiha','disrupt','👁️ Tsukuyomi','Itachi clouds his opponent’s power.'],
  ['naruto','sakura haruno','recover','💚 Medical Ninjutsu','Sakura restores her own fighting strength.'],
  ['attack on titan','eren yeager','assault','🔥 Titan’s Wrath','Eren unleashes the Attack Titan’s fury.'],
  ['attack on titan','levi ackerman','assault','⚔️ Blade Storm','Levi launches a precision assault.'],
  ['jujutsu kaisen','satoru gojo','guard','🛡️ Infinity','Gojo bends space to resist the opposing attack.'],
  ['jujutsu kaisen','gojo satoru','guard','🛡️ Infinity','Gojo bends space to resist the opposing attack.'],
  ['jujutsu kaisen','ryomen sukuna','assault','🔥 Malevolent Shrine','Sukuna releases a devastating slash.'],
  ['jujutsu kaisen','megumi fushiguro','support','🐺 Ten Shadows','Megumi’s shikigami empower later allies.'],
  ['jujutsu kaisen','yuuta okkotsu','enhance','💍 Rika’s Bond','Yuta draws strength from his bond with Rika.'],
  ['jujutsu kaisen','yuta okkotsu','enhance','💍 Rika’s Bond','Yuta draws strength from his bond with Rika.'],
  ['one piece','monkey d. luffy','assault','👊 Gum-Gum Barrage','Luffy lands a relentless string of punches.'],
  ['one piece','roronoa zoro','assault','⚔️ Three-Sword Style','Zoro attacks with all three swords.'],
  ['one piece','sanji','enhance','🔥 Diable Jambe','Sanji ignites his kicks.'],
  ['one piece','nami','support','🌩️ Weather Tactics','Nami coordinates the team with weather tricks.'],
  ['demon slayer','tanjiro kamado','assault','🌊 Water Breathing','Tanjiro strikes with a flowing sword technique.'],
  ['demon slayer','nezuko kamado','enhance','🔥 Exploding Blood','Nezuko unleashes her blood demon art.'],
  ['demon slayer','shinobu kocho','disrupt','🦋 Insect Breathing','Shinobu’s poison slows the opponent.'],
  ['bleach','ichigo kurosaki','assault','🌙 Getsuga Tensho','Ichigo releases a powerful spiritual slash.'],
  ['bleach','byakuya kuchiki','assault','🌸 Senbonzakura','Byakuya strikes with countless blades.'],
  ['dragon ball','son goku','enhance','🔥 Super Saiyan Surge','Goku raises his fighting power.'],
  ['dragon ball','goku','enhance','🔥 Super Saiyan Surge','Goku raises his fighting power.'],
  ['dragon ball','vegeta','assault','💥 Final Flash','Vegeta fires a concentrated blast.'],
  ['solo leveling','sung jinwoo','support','🖤 Shadow Army','Jinwoo’s shadows reinforce later allies.'],
  ['death note','light yagami','disrupt','📓 Perfect Plan','Light outmaneuvers his opponent.'],
  ['death note','l lawliet','guard','🧠 Deduction','L anticipates and guards against enemy attacks.'],
  ['spy x family','anya forger','support','🧠 Mind Reading','Anya warns and prepares later allies.'],
  ['spy x family','yor forger','assault','🌹 Thorn Princess','Yor delivers a precise and powerful attack.'],
  ['spy x family','loid forger','guard','🎭 Twilight Tactics','Loid anticipates the opposing strike.'],
  ['sousou no frieren','frieren','assault','✨ Zoltraak','Frieren fires a piercing magical attack.'],
  ['sousou no frieren','fern','assault','✨ Zoltraak','Fern casts high-speed offensive magic.'],
  ['sousou no frieren','himmel','support','🗡️ Heroic Resolve','Himmel inspires the allies who follow.'],
  ['honkai impact 3rd','kiana kaslana','assault','🔥 Herrscher Burst','Kiana unleashes overwhelming Herrscher energy.'],
  ['zenless zone zero','burnice white','assault','🔥 Nitro-Fuel Inferno','Burnice scorches the battlefield with flames.'],
  ['dc comics','tim drake','guard','🦇 Tactical Counter','Tim reads the enemy strike and raises his guard.'],
  ['dc comics','batman','guard','🦇 Gotham Contingency','Batman anticipates and deflects an enemy assault.'],
  ['jujutsu kaisen','maki zenin','assault','⚔️ Heavenly Restriction','Maki strikes with extraordinary physical prowess.'],
  ['honkai star rail','kafka','disrupt','⚡ Spirit Whisper','Kafka disrupts the opponent’s combat rhythm.'],
  ['zenless zone zero','ellen joe','assault','❄️ Glacial Slash','Ellen delivers a chilling attack.'],
  ['demon slayer','akaza','assault','🥊 Destructive Death','Akaza launches a relentless martial strike.']
];
function norm(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim(); }
function isGroup(name) { return /\s(?:&|and|\+)\s|,\s|\bteam\b|\bsquad\b|\bduo\b|\btrio\b|\bdivision\b|\bfamily\b|\bguild\b/i.test(String(name)); }
function hashPick(input, modulo) { return crypto.createHash('sha256').update(input).digest().readUInt32BE(0) % modulo; }
function getAbility(card) {
  const name = norm(card?.name);
  const series = norm(card?.anime || card?.series);
  const identity = `${series}|${name}`;
  // Group names must never accidentally inherit an individual's signature ability.
  if (isGroup(card?.name)) return {type:'support',name:'🤝 United Front',description:'The group rallies allies in later rounds.',source:'group'};
  const canonical = aliases.resolve(card?.anime || card?.series, card?.name);
  const target = norm(canonical || card?.name);
  const curated = characterAbilities.lookup(card?.anime || card?.series,canonical || card?.name);
  if (curated) return {...curated};
  const exact = SIGNATURES.find(([s,n]) => series === norm(s) && target === norm(n));
  if (exact) return {type:exact[2],name:exact[3],description:exact[4],source:'character'};
  // All listed characters are recognized, but we do not invent lore for the rest.
  // A stable, fixed generic skill is based on CANONICAL character identity.
  const type = TYPES[hashPick(`${series}|${target}` || identity,TYPES.length)];
  return {type,name:FALLBACK[type][0],description:FALLBACK[type][1],source:canonical?'recognized-generic':'fallback'};
}
// A 4-round, fully deterministic comparison. A support card benefits only future turns.
// All effects are battle-local. Defense blocks enemy ASSAULT bonuses, not base power.
function simulate(teamA,teamB) {
  if (![teamA,teamB].every(t => Array.isArray(t) && t.length === 4 && t.every(c => Number.isFinite(Number(c.power)) && Number(c.power) >= 0))) throw Error('Battle teams require four valid cards each.');
  const teams = [teamA,teamB];
  const bonuses = [0,0], totals = [0,0], rounds = [];
  for(let turn=0;turn<4;turn++) {
    const abilities = teams.map(team => getAbility(team[turn]));
    const bases = teams.map(team => Math.round(Number(team[turn].power)));
    const before = [...bonuses];
    const effects = abilities.map((a,i) => {
      const base=bases[i]; const incoming=abilities[1-i];
      const assisted = Math.round(base * before[i]);
      const self = a.type==='enhance' ? Math.round(base*0.12) : 0;
      const strike = a.type==='assault' ? Math.round(base*0.12) : 0;
      const weaken = incoming.type==='disrupt' ? Math.round(base*0.08) : 0;
      const defense = incoming.type==='guard' ? Math.round(strike*0.75) : 0;
      // Recovery cleanses a current disruption; if there is none, it
      // contributes a modest 4% resilience boost instead of doing nothing.
      const restored = a.type==='recover' ? (weaken || Math.round(base*0.04)) : 0;
      const gain = Math.max(0,base+assisted+self+strike-weaken-defense+restored);
      return {base,assisted,self,strike,weaken,defense,restored,gain,recoveryType:a.type==='recover'?(weaken?'cleanse':'resilience'):null};
    });
    abilities.forEach((a,i) => { if (a.type==='support') bonuses[i]=Math.min(0.20,bonuses[i]+0.08); totals[i]+=effects[i].gain; });
    rounds.push({number:turn+1, cards:teams.map(t=>t[turn]),abilities,effects,totals:[...totals],teamBuffs:[...bonuses]});
  }
  return {rounds,totals,winner: totals[0]===totals[1]?null:(totals[0]>totals[1]?0:1)};
}
module.exports={getAbility,simulate};

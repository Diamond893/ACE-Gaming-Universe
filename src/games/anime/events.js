'use strict';
const fs=require('fs'),path=require('path');
const {db,withTransaction,randomInt}=require('../../database/aguStore');
const inv=require('../../inventory/inventory'),cards=require('./cards');
const FILE=path.resolve(__dirname,'../../../data/eventCards.json');
db.exec(`CREATE TABLE IF NOT EXISTS event_card_issued (event_id TEXT PRIMARY KEY, game_id TEXT NOT NULL REFERENCES players(game_id), card_instance_id TEXT NOT NULL UNIQUE, obtained_at TEXT NOT NULL);`);
function catalog(){if(!fs.existsSync(FILE))return [];const data=JSON.parse(fs.readFileSync(FILE,'utf8'));if(!Array.isArray(data))throw Error('data/eventCards.json must be an array.');const ids=new Set();return data.filter(x=>{if(!x||!x.id||!x.name||!['5','6'].includes(String(x.tier))||ids.has(String(x.id)))return false;ids.add(String(x.id));return true;});}
function remaining(){return catalog().filter(c=>!db.prepare('SELECT 1 FROM event_card_issued WHERE event_id=?').get(String(c.id)));}
const redeem=withTransaction((gameId)=>{const pool = remaining().filter(card =>
    String(card.category || 'normal').toLowerCase() === 'normal'
);
// Separate available normal event cards by tier
const t5 = pool.filter(card => Number(card.tier) === 5);
const t6 = pool.filter(card => Number(card.tier) === 6);

// T5 must be available for normal redemption to continue.
// This prevents T6 from becoming guaranteed when T5 runs out.
if (!t5.length) {
    return {
        success: false,
        message: '❌ No T5 Event Cards are currently available. Event redemption is temporarily paused. Your fragment is safe.'
    };
}

// Select tier: 80% T5, 20% T6
const roll = randomInt(1, 100);

let selectedPool;

if (roll <= 80) {
    selectedPool = t5;
} else {
    // If T6 is exhausted, award T5 instead
    selectedPool = t6.length ? t6 : t5;
}

// Check fragment before awarding
if (!inv.take(gameId, 'event_card_fragment', 1)) {
    return {
        success: false,
        message: '❌ You need 1 Event Card Fragment.'
    };
}

// Pick a random available card from the selected tier
const card = selectedPool[randomInt(0, selectedPool.length - 1)];
const owned=cards.issue(gameId,{...card,id:`EVENT:${card.id}`},{eventId:String(card.id)});db.prepare('INSERT INTO event_card_issued VALUES (?,?,?,?)').run(String(card.id),gameId,owned.instanceId,new Date().toISOString());
return {
    success: true,
    tagAll: true,
    image: owned.image,
    message: `📢 @all

🌌✨ NYX: CONGRATULATIONS COLLECTOR! ✨🌌

👑 A ONE-OF-ONE EVENT CARD HAS BEEN UNLOCKED!

🔥 HISTORY HAS JUST BEEN WRITTEN IN AGU!

${cards.cardText(owned)}
🎨 Card Maker: ${owned.maker || 'Unknown'}


🎟️ -1 Event Card Fragment
🌍 AGU Edition: 1/1

✨ This design can never be issued again.

🌌 NYX: A LEGEND HAS BEEN BORN!`
};
});

module.exports={catalog,remaining,redeem};

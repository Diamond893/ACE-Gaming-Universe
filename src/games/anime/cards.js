'use strict';
const fs=require('fs'),path=require('path');
const {db,withTransaction,randomInt,weighted}=require('../../database/aguStore');
const cfg=require('../../config/agu'),inventory=require('../../inventory/inventory');
const collection=require('./collection');
const CATALOG=path.resolve(__dirname,'../../../data/shoobCards.json');
let cache={mtime:0,cards:[]};
function getCards(){if(!fs.existsSync(CATALOG))return [];const stat=fs.statSync(CATALOG);if(stat.mtimeMs!==cache.mtime){const items=JSON.parse(fs.readFileSync(CATALOG,'utf8'));if(!Array.isArray(items))throw Error('data/shoobCards.json must contain a JSON array.');cache={mtime:stat.mtimeMs,cards:items.filter(c=>c && c.id && c.name && cfg.tiers[String(c.tier)])};}return cache.cards;}
function chooseTier(weights){return weighted(weights);}
function draw(weights=Object.fromEntries(Object.entries(cfg.tiers).map(([tier,value])=>[tier,value.weight]))){const cards=getCards();if(!cards.length)throw Error('Shoob catalog empty. Import master_database.json using scripts/import-shoob.js first.');const eligible=Object.entries(weights).filter(([tier,w])=>Number(w)>0 && cards.some(c=>String(c.tier)===tier));if(!eligible.length)throw Error('No cards available for configured tiers.');const tier=weighted(Object.fromEntries(eligible));const pool=cards.filter(c=>String(c.tier)===tier);return pool[randomInt(0,pool.length-1)];}

function issue(gameId,source,{eventId=null}={}){const tier=String(source.tier),range=cfg.tiers[tier];if(!range)throw Error('Unknown card tier.');const card={cardId:String(source.id),sourceCardId:String(source.id),name:String(source.name),anime:String(source.series||source.anime||'Unknown'),tier,power:Math.round(randomInt(range.minPower,range.maxPower)*(eventId?1.05:1)),maker:String(source.maker||''),image:String(source.image||''),
    price: eventId
    ? null
    : (
        Number.isSafeInteger(source.claimPrice)
            ? source.claimPrice
            : Math.max(100, Math.round((range.minPower + range.maxPower) / 4))
    ),

claimPrice: eventId
    ? null
    : (
        Number.isSafeInteger(source.claimPrice)
            ? source.claimPrice
            : null
    ),

    isEvent:!!eventId,eventId};const result=collection.addCard(gameId,card);const {recordGameEvent}=require('../../players');recordGameEvent(result.card ? (db.prepare('SELECT id FROM players WHERE game_id=?').get(gameId)?.id) : '', 'card_collected');return result.card;}

function cardText(card){return `🎴 ${card.name}\n📺 ${card.anime}\n💎 T${card.tier} | ⚡ ${card.power.toLocaleString()} Power\n🆔 ${card.instanceId}${card.isEvent?'\n✨ EXCLUSIVE 1/1 EVENT CARD':''}`;}
const openBundle=withTransaction((gameId,itemId)=>{const rules=cfg.bundleContents[itemId];if(!rules)return{success:false,message:'❌ Not a card bundle.'};if(!inventory.take(gameId,itemId,1))return{success:false,message:'❌ Bundle not found.'};const count=randomInt(rules.min,rules.max),cards=[];for(let i=0;i<count;i++)cards.push(issue(gameId,draw(rules.weights)));return{success:true,message:`🎁 BUNDLE OPENED!\n\n${cards.map((c,i)=>`${i+1}. ${c.name} — T${c.tier} (⚡${c.power})`).join('\n')}\n\nCheck .collection / .deck!`};});
function sourceStatus(){return {count:getCards().length,location:CATALOG};}
function owned(gameId){const p=collection.getCollection(gameId);return [...p.deck,...p.collection];}
function cardValue(c){const tier=Number(c.tier)||6;return Math.max(100,Math.round((Number(c.power)||500)*(.6+tier*.18)));}

// Count owners and copies of a card design across AGU.
function getOwnerStats(card) {
    const key = String(card.sourceCardId || card.cardId || '');

    const eventKey = card.isEvent
        ? String(card.eventId || '')
        : null;

    if (!key && !eventKey) {
        throw new Error('This card has no source ID.');
    }

    function sameDesign(other) {
        if (!other || typeof other !== 'object') {
            return false;
        }

        if (card.isEvent) {
            return Boolean(other.isEvent) &&
                String(other.eventId || '') === eventKey;
        }

        return !other.isEvent &&
            String(other.sourceCardId || other.cardId || '') === key;
    }

    const byOwner = new Map();

    function add(gameId, other) {
        if (sameDesign(other)) {
            byOwner.set(
                gameId,
                (byOwner.get(gameId) || 0) + 1
            );
        }
    }

    // Check every player's deck and collection.
    const collections = db.prepare(`
        SELECT game_id, payload
        FROM collections
    `).all();

    for (const row of collections) {
        const data = JSON.parse(row.payload);

        const allCards = [
            ...(data.deck || []),
            ...(data.collection || [])
        ];

        for (const ownedCard of allCards) {
            add(row.game_id, ownedCard);
        }
    }

    // Cards in auction escrow still belong to their sellers.
    const escrow = db.prepare(`
        SELECT seller_id, payload
        FROM global_escrow
        WHERE asset_type = 'card'
        AND state IN ('pending', 'active')
    `).all();

    for (const row of escrow) {
        add(row.seller_id, JSON.parse(row.payload));
    }

    return {
        owners: byOwner.size,

        copies: [...byOwner.values()].reduce(
            (total, quantity) => total + quantity,
            0
        ),

        holders: [...byOwner.entries()].map(
            ([gameId, quantity]) => ({
                gameId,
                quantity
            })
        )
    };
}


// Find the platform identities belonging to an AGU player.
function ownerContact(gameId) {
    const row = db.prepare(`
        SELECT id, payload
        FROM players
        WHERE game_id = ?
    `).get(gameId);

    const identityKeys = db.prepare(`
        SELECT identity_key
        FROM identities
        WHERE game_id = ?
    `).all(gameId).map(x => x.identity_key);

    // Include original registration identity.
    if (row?.id) {
        identityKeys.push(row.id);
    }

    // Retrieve the player's actual WhatsApp JID.
const whatsappJid = identityKeys
    .filter(key => String(key).startsWith('whatsapp:'))
    .map(key =>
        String(key)
            .slice('whatsapp:'.length)
            .replace(/:\d+(?=@)/, '')
    )
    .find(jid =>
        /^\d{7,22}@(s\.whatsapp\.net|lid)$/.test(jid)
    ) || null;

    const wa = identityKeys
        .map(key => String(key).match(
            /^whatsapp:(\d{7,15})(?::\d+)?(?:@s\.whatsapp\.net|@c\.us)?$/i
        ))
        .find(Boolean);

    const discord = identityKeys
        .map(key => String(key).match(
            /^discord:(\d{15,22})$/
        ))
        .find(Boolean);

    const name = row
        ? JSON.parse(row.payload).name || gameId
        : gameId;

    return {
        name,
        gameId,

        whatsapp: wa
            ? '+' + wa[1]
            : null,

        discord: discord
            ? discord[1]
            : null,

        whatsappJid,
    };
}
module.exports = {
    getCards,
    draw,
    issue,
    cardText,
    openBundle,
    sourceStatus,
    owned,
    cardValue,
    getOwnerStats,
    ownerContact
};

'use strict';
const crypto=require('crypto');
const {
    db,
    withTransaction,
    player,
    savePlayer
} = require('../../database/aguStore');
const config=require('../../config/agu'),cards=require('./cards');
const events = require('./events');
const { getAbility } = require('./abilities');
function claimedAbilityText(card) {
    const ability = getAbility(card);
    return `\n\n✨ SIGNATURE ABILITY\n⚔️ ${ability.name}\n📖 ${ability.description}`;
}
const communities=require('../../communityRegistry');
db.exec(`
 CREATE TABLE IF NOT EXISTS card_features (platform TEXT NOT NULL,community_id TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,next_spawn_at INTEGER, PRIMARY KEY(platform,community_id));
 CREATE TABLE IF NOT EXISTS card_spawns (platform TEXT NOT NULL,community_id TEXT NOT NULL,code TEXT NOT NULL,card_payload TEXT NOT NULL,created_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'active',claimed_by TEXT,PRIMARY KEY(platform,community_id));
`);
// Durable outgoing drop queue: a failed send must not consume a generated spawn.
db.exec(`CREATE TABLE IF NOT EXISTS card_spawn_delivery (
 platform TEXT NOT NULL, community_id TEXT NOT NULL, code TEXT NOT NULL,
 message TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(platform,community_id)
)`);
function pendingDeliveries(platform) {
 return db.prepare(`SELECT d.community_id,d.code,d.message,s.card_payload
 FROM card_spawn_delivery d JOIN card_spawns s ON s.platform=d.platform AND s.community_id=d.community_id AND s.code=d.code
 JOIN card_features f ON f.platform=d.platform AND f.community_id=d.community_id
 WHERE d.platform=? AND d.sent=0 AND f.enabled=1 AND s.status='active'`).all(platform)
 .filter(x=>communities.isActive(platform,x.community_id))
 .map(x=>({communityId:x.community_id,code:x.code,message:x.message,card:JSON.parse(x.card_payload)}));
}
function markDelivered(platform,id,code) {
 return db.prepare('UPDATE card_spawn_delivery SET sent=1 WHERE platform=? AND community_id=? AND code=?').run(platform,id,code).changes>0;
}
function getFeature(platform,communityId){
    return db.prepare('SELECT * FROM card_features WHERE platform=? AND community_id=?').get(platform,communityId)||{enabled:0,next_spawn_at:null};}
const toggle=withTransaction((platform,id,enabled)=>{if(!communities.isActive(platform,id))return{success:false,message:'❌ AGU must be active in this community first.'};const due=enabled?Date.now()+config.spawnMinutes*60000:null;db.prepare('INSERT INTO card_features VALUES (?,?,?,?) ON CONFLICT(platform,community_id) DO UPDATE SET enabled=excluded.enabled,next_spawn_at=excluded.next_spawn_at').run(platform,id,enabled?1:0,due);if(!enabled)db.prepare('UPDATE card_spawns SET status=? WHERE platform=? AND community_id=? AND status=?').run('expired',platform,id,'active');return{success:true,message:`🎴 Automatic cards: ${enabled?'ENABLED':'DISABLED'}.`};});
function status(platform,id){const r=getFeature(platform,id);return{success:true,message:`🎴 NYX CARDS\nFeature: ${r.enabled?'🟢 ON':'🔴 OFF'}\nSpawns: one per eligible community every ${config.spawnMinutes} minutes.\nClaims expire when the next card spawns.`};}

function priceSpawn(source) {
    // Exclusive event cards cannot spawn.
    if (source.isEvent || source.eventId) {
        throw new Error('Event cards cannot spawn normally.');
    }

    const tier = String(source.tier);
    const range = config.claimPriceRanges[tier];

    if (
        !Array.isArray(range) ||
        range.length !== 2 ||
        !range.every(Number.isSafeInteger) ||
        range[0] < 1 ||
        range[1] < range[0]
    ) {
        throw new Error(`Invalid claim price range for tier ${tier}`);
    }

    const price = crypto.randomInt(range[0], range[1] + 1);

    return {
        ...source,
        claimPrice: price
    };
}

function spawnHeadline(source, ownerTriggered = false) {
    const isSTier = ['S', 'TS'].includes(
        String(source.tier).toUpperCase()
    );

    if (isSTier) {
        return `🔥🔥 NYX: WOAHHHHH!!! 🔥🔥

🌌 AN S-TIER CARD HAS APPEARED!

🌙 What a once-in-a-blue-moon scenario!

✨ Only the fortunate get to witness
such an extraordinary appearance!`;
    }

    return `🌌 NYX CARD DROP!${ownerTriggered ? ' 👑' : ''}`;
}

function code4(){const digits='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<config.claimLength;i++)s+=digits[crypto.randomInt(digits.length)];return s;}
// Claim remains valid until the next spawned card replaces it (unless claimed/feature disabled).
const spawnIfDue=withTransaction((platform,id,now=Date.now())=>{if(!communities.isActive(platform,id))return null;const row=getFeature(platform,id);if(!row.enabled)return null;if(!row.next_spawn_at){db.prepare('UPDATE card_features SET next_spawn_at=? WHERE platform=? AND community_id=?').run(now+config.spawnMinutes*60000,platform,id);return null;}if(row.next_spawn_at>now)return null;
// Preserve active Seasonal Event Card drops.
const activeSpawn = db.prepare(`
    SELECT card_payload
    FROM card_spawns
    WHERE platform = ?
      AND community_id = ?
      AND status = 'active'
`).get(platform, id);

if (activeSpawn) {
    const activeCard = JSON.parse(activeSpawn.card_payload);

    if (activeCard.isEvent) {
        return null;
    }
}

 // Catalog must be installed before ticking, otherwise retry later without wiping an active claim.
 let source;

try {
    source = priceSpawn(cards.draw());
} catch (e) {
    console.error('NYX card spawn error:', e.message);
    return null;
}
 const code=code4();db.prepare(`INSERT INTO card_spawns(platform,community_id,code,card_payload,created_at,status,claimed_by) VALUES (?,?,?,?,?,'active',NULL) ON CONFLICT(platform,community_id) DO UPDATE SET code=excluded.code,card_payload=excluded.card_payload,created_at=excluded.created_at,status='active',claimed_by=NULL`).run(platform,id,code,JSON.stringify(source),now);
 // Keep a stable tick schedule even if process was asleep. Do not catch up flood.
 db.prepare('UPDATE card_features SET next_spawn_at=? WHERE platform=? AND community_id=?').run(now+config.spawnMinutes*60000,platform,id);
 const generated = {platform,communityId:id,code,card:source,message:`${spawnHeadline(source)}\n\n🎴 ${source.name}\n📺 ${source.series||'Unknown'}\n💎 Tier: ${source.tier}\n🔢 Captcha: ${code}\n\n💰 Claim Price: ${source.claimPrice.toLocaleString()} AGU Coins\n\n🔐 To claim: Type .claim <captcha>\n⏱️ Countdown until next drop\n${['S', 'TS'].includes(String(source.tier).toUpperCase())
    ? '\n🔥 WHO WILL CLAIM THIS LEGEND?!'
    : ''}`};
 db.prepare('INSERT INTO card_spawn_delivery(platform,community_id,code,message,sent) VALUES(?,?,?,?,0) ON CONFLICT(platform,community_id) DO UPDATE SET code=excluded.code,message=excluded.message,sent=0').run(platform,id,code,generated.message);
 return generated;
});

// Owner-only on-demand card drop. This replaces the current unclaimed drop in the community, if any. The card is drawn from the catalog, not the spawn queue.
// Caller MUST validate the platform sender's owner identity before invoking.
const forceSpawn = withTransaction((platform, id, sourceId = 'random') => {

    if (!communities.isActive(platform, id)) {
        return {
            success: false,
            message: '❌ Activate AGU in this community first.'
        };
    }

    if (!getFeature(platform, id).enabled) {
        return {
            success: false,
            message: '❌ Cards are OFF here. Use .cards on first.'
        };
    }

    const requested = String(sourceId || 'random').trim();

    let source;
    let seasonal = false;

    // SEASONAL EVENT CARD
    if (/^EVENT-\d+$/i.test(requested)) {

        const eventCard = events.catalog().find(c =>
            String(c.id).toUpperCase() === requested.toUpperCase()
        );

        if (!eventCard) {
            return {
                success: false,
                message: '❌ Event Card not found.'
            };
        }

        if (String(eventCard.category).toLowerCase() !== 'seasonal') {
            return {
                success: false,
                message: '❌ Only Seasonal Event Cards can be manually spawned.'
            };
        }

        const available = events.remaining().some(c =>
            String(c.id).toUpperCase() === requested.toUpperCase()
        );

        if (!available) {
            return {
                success: false,
                message: '❌ This Event Card has already been issued.'
            };
        }

        // Prevent the same exclusive card from spawning in multiple groups.
        const activeSpawns = db.prepare(`
            SELECT card_payload
            FROM card_spawns
            WHERE status = 'active'
        `).all();

        const alreadyActive = activeSpawns.some(row => {
            const active = JSON.parse(row.card_payload);

            return active.isEvent &&
                String(active.eventId).toUpperCase() === requested.toUpperCase();
        });

        if (alreadyActive) {
            return {
                success: false,
                message: '❌ This Event Card already has an active spawn.'
            };
        }

        source = {
            ...eventCard,
            id: `EVENT:${eventCard.id}`,
            eventId: String(eventCard.id),
            isEvent: true,
            category: 'seasonal',
            claimPrice: 0
        };

        seasonal = true;

    } else {

        // NORMAL CARD SPAWN
        if (requested.toLowerCase() === 'random') {

            try {
                source = cards.draw();
            } catch (e) {
                return {
                    success: false,
                    message: `❌ ${e.message}`
                };
            }

        } else {

            source = cards.getCards().find(c =>
                String(c.id).toLowerCase() === requested.toLowerCase()
            );

            if (!source) {
                return {
                    success: false,
                    message: `❌ Shoob card ID ${requested} not found.`
                };
            }

            if (
                !/^(?:[1-6]|S)$/.test(String(source.tier)) ||
                source.isEvent ||
                source.eventId
            ) {
                return {
                    success: false,
                    message: '❌ Special event cards cannot spawn normally.'
                };
            }
        }

        source = priceSpawn(source);
    }

    // Do not overwrite an unclaimed seasonal event.
    const current = db.prepare(`
        SELECT card_payload
        FROM card_spawns
        WHERE platform = ?
          AND community_id = ?
          AND status = 'active'
    `).get(platform, id);

    if (current) {
        const active = JSON.parse(current.card_payload);

        if (active.isEvent) {
            return {
                success: false,
                message: '❌ A Seasonal Event Card is already awaiting a claim here.'
            };
        }
    }

    const now = Date.now();
    const code = code4();

    db.prepare(`
        INSERT INTO card_spawns (
            platform,
            community_id,
            code,
            card_payload,
            created_at,
            status,
            claimed_by
        )
        VALUES (?, ?, ?, ?, ?, 'active', NULL)

        ON CONFLICT(platform, community_id)
        DO UPDATE SET
            code = excluded.code,
            card_payload = excluded.card_payload,
            created_at = excluded.created_at,
            status = 'active',
            claimed_by = NULL
    `).run(
        platform,
        id,
        code,
        JSON.stringify(source),
        now
    );

    // SEASONAL ANNOUNCEMENT
    if (seasonal) {
        return {
            success: true,
            image: source.image || null,
            message: `🌌✨ NYX SEASONAL EVENT DROP! ✨🌌

👑 A ONE-OF-ONE EVENT CARD HAS APPEARED!

🎴 ${source.name}
📺 ${source.series || 'Unknown'}
💎 Tier: T${source.tier}
🎨 Card Maker: ${source.maker || 'Unknown'}

🌍 AGU Edition: 1/1

🎟️ Claim Price: FREE
🔐 Claim: .claim ${code}

⚡ CONGRATULATIONS!

🌌 NYX: HISTORY IS ABOUT TO BE WRITTEN!`
        };
    }

    // NORMAL CARD ANNOUNCEMENT
    return {
        success: true,
        image: source.image || null,
        message: `${spawnHeadline(source, true)}

🎴 ${source.name}
📺 ${source.series || 'Unknown'}
💎 Tier ${source.tier}

💰 Claim Price: ${source.claimPrice.toLocaleString()} AGU Coins
🔐 Claim: .claim ${code}

✨ Owner-triggered drop`
    };
});

function due(platform){return db.prepare('SELECT community_id FROM card_features WHERE platform=? AND enabled=1 AND next_spawn_at<=?').all(platform,Date.now()).map(r=>r.community_id);}
const claim = withTransaction((platform, communityId, code, gameId) => {

    const spawn = db.prepare(`
        SELECT *
        FROM card_spawns
        WHERE platform = ?
        AND community_id = ?
    `).get(platform, communityId);

    if (
        !spawn ||
        spawn.status !== 'active' ||
        spawn.code !== String(code || '').toUpperCase()
    ) {
        return {
            success: false,
            message: '❌ Invalid, expired, or already claimed card code.'
        };
    }

    const source = JSON.parse(spawn.card_payload);

    // SEASONAL EVENT CARD CLAIM
if (source.isEvent || source.eventId) {

    if (
        !source.isEvent ||
        !source.eventId ||
        String(source.category).toLowerCase() !== 'seasonal' ||
        Number(source.claimPrice) !== 0
    ) {
        return {
            success: false,
            message: '❌ Invalid Event Card spawn.'
        };
    }

    const eventId = String(source.eventId);

    // Verify against the actual event catalog.
    const eventCard = events.catalog().find(c =>
        String(c.id) === eventId &&
        String(c.category).toLowerCase() === 'seasonal'
    );

    if (!eventCard) {
        return {
            success: false,
            message: '❌ This Seasonal Event Card is not valid.'
        };
    }

    // Prevent a second issuance.
    const issued = db.prepare(`
        SELECT 1
        FROM event_card_issued
        WHERE event_id = ?
    `).get(eventId);

    if (issued) {
        return {
            success: false,
            message: '❌ This Event Card has already been claimed.'
        };
    }

    // Secure the active spawn for this claimant.
    const result = db.prepare(`
        UPDATE card_spawns
        SET status = 'claimed',
            claimed_by = ?
        WHERE platform = ?
          AND community_id = ?
          AND status = 'active'
          AND code = ?
    `).run(
        gameId,
        platform,
        communityId,
        spawn.code
    );

    if (result.changes !== 1) {
        return {
            success: false,
            message: '❌ This card has already been claimed.'
        };
    }

    // Issue the unique event card.
    const awarded = cards.issue(
        gameId,
        source,
        { eventId }
    );

    // Permanently register its issuance.
    // This is part of the same database transaction.
    db.prepare(`
        INSERT INTO event_card_issued (
            event_id,
            game_id,
            card_instance_id,
            obtained_at
        )
        VALUES (?, ?, ?, ?)
    `).run(
        eventId,
        gameId,
        awarded.instanceId,
        new Date().toISOString()
    );

    return {
        success: true,
        message: `🌌✨ NYX: CONGRATULATIONS COLLECTOR! ✨🌌

👑 A SEASONAL ONE-OF-ONE EVENT CARD HAS BEEN CLAIMED!

${cards.cardText(awarded)}${claimedAbilityText(awarded)}
🎨 Card Maker: ${awarded.maker || 'Unknown'}

🎟️ Claim Price: FREE
🌍 AGU Edition: 1/1

✨ This design can never be issued again!`
    };
}

    const price = source.claimPrice;

    if (!Number.isSafeInteger(price) || price < 1) {
        return {
            success: false,
            message: '❌ This spawn has no valid price. Wait for the next drop.'
        };
    }

    const account = player(gameId);

    if (!Number.isSafeInteger(account.coins) || account.coins < price) {
        return {
            success: false,
            message: `❌ INSUFFICIENT COINS!

💰 Card Price: ${price.toLocaleString()}
🏦 Your Balance: ${Number(account.coins || 0).toLocaleString()}

Earn more coins and try again.`
        };
    }

    // Only one successful claimant can obtain this card.
    const result = db.prepare(`
        UPDATE card_spawns
        SET status = 'claimed',
            claimed_by = ?
        WHERE platform = ?
        AND community_id = ?
        AND status = 'active'
        AND code = ?
    `).run(gameId, platform, communityId, spawn.code);

    if (result.changes !== 1) {
        return {
            success: false,
            message: '❌ This card has already been claimed.'
        };
    }

    // Deduct the card price.
    account.coins -= price;
    savePlayer(account);

    // Award the card.
    const awarded = cards.issue(gameId, source);

    return {
        success: true,
        message: `✅ CARD CLAIMED!

${cards.cardText(awarded)}${claimedAbilityText(awarded)}

💸 Paid: ${price.toLocaleString()} Coins
🏦 Remaining: ${account.coins.toLocaleString()} Coins

🎴 Added to your collection!`
    };
});
module.exports={getFeature,toggle,status,due,spawnIfDue,forceSpawn,claim,pendingDeliveries,markDelivered};

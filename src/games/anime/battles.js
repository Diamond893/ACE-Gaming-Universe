'use strict';
const crypto=require('crypto');
const {db,withTransaction,player,savePlayer,randomInt,watDay}=require('../../database/aguStore');
const config=require('../../config/agu'),inventory=require('../../inventory/inventory'),cards=require('./cards');
const players = require('../../players');
const abilities = require('./abilities');

// WhatsApp mentions are resolved from stored player identities, never guessed
// from display names or AGU Game IDs. Other platforms keep plain names.
function battleParticipant(gameId, platform) {
    const name = player(gameId).name;
    if (platform !== 'whatsapp') return { label: name, jid: null };
    const jid = cards.ownerContact(gameId)?.whatsappJid;
    if (!jid || !/^\d{7,22}@(s\.whatsapp\.net|lid)$/.test(jid)) {
        return { label: name, jid: null };
    }
    return { label: `@${jid.split('@')[0]}`, jid };
}
function participantMentions(...participants) {
    return [...new Set(participants.map(p => p.jid).filter(Boolean))];
}

db.exec(`
 CREATE TABLE IF NOT EXISTS card_battles (id TEXT PRIMARY KEY, platform TEXT NOT NULL, community_id TEXT NOT NULL, challenger TEXT NOT NULL, challenged TEXT NOT NULL, state TEXT NOT NULL, selections_a TEXT, selections_b TEXT, created_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS card_battles_active_idx ON card_battles(platform,community_id,state);
 CREATE TABLE IF NOT EXISTS battle_results (id TEXT PRIMARY KEY, winner_id TEXT, loser_id TEXT, player_a TEXT NOT NULL, player_b TEXT NOT NULL, recorded_at INTEGER NOT NULL,day_wat TEXT NOT NULL);
`);

// Track the last successful action in an accepted battle.
const battleColumns = db.prepare(
    'PRAGMA table_info(card_battles)'
).all();

if (!battleColumns.some(column => column.name === 'updated_at')) {
    db.exec(`
        ALTER TABLE card_battles
        ADD COLUMN updated_at INTEGER
    `);

    // Give existing battles a fresh inactivity window.
    db.prepare(`
        UPDATE card_battles
        SET updated_at = ?
        WHERE updated_at IS NULL
    `).run(Date.now());
}

function current(platform,communityId){return db.prepare("SELECT * FROM card_battles WHERE platform=? AND community_id=? AND state IN ('pending','selecting') ORDER BY created_at DESC LIMIT 1").get(platform,communityId);}

const PENDING_TIMEOUT = 5 * 60 * 1000;
const ACTIVE_TIMEOUT = 30 * 60 * 1000;

function sweep() {
    const now = Date.now();

    // Challenges not accepted within five minutes.
    const pending = db.prepare(`
        UPDATE card_battles
        SET state = 'expired'
        WHERE state = 'pending'
        AND created_at <= ?
    `).run(now - PENDING_TIMEOUT);

    // Accepted battles with no successful action for 30 minutes.
    const active = db.prepare(`
        UPDATE card_battles
        SET state = 'expired'
        WHERE state = 'selecting'
        AND COALESCE(updated_at, created_at) <= ?
    `).run(now - ACTIVE_TIMEOUT);

    return {
        pending: pending.changes,
        active: active.changes
    };
}

const challenge=withTransaction((platform,communityId,challenger,challenged)=>{sweep();if(!challenged||challenger===challenged)return{success:false,message:'❌ Challenge a different registered player'};
const ongoing = current(platform, communityId);

if (ongoing) {
    const challengerName = player(ongoing.challenger).name;
    const challengedName = player(ongoing.challenged).name;

    const remainingSeconds = Math.max(
        0,
        Math.ceil(
            (ongoing.created_at + 5 * 60 * 1000 - Date.now()) / 1000
        )
    );

    return {
        success: false,
        message: [
            '⚔️ NYX CARD BATTLE',
            '',
            '❌ Another battle cannot begin yet',
            '',
            `👤 Challenger: ${challengerName}`,
            `👤 Opponent: ${challengedName}`,
            '',
            ongoing.state === 'pending'
                ? `⏳ Awaiting acceptance (${remainingSeconds}s remaining)`
                : '🔥 Battle in progress',
            '',
            'Only one card battle can be active in this group'
        ].join('\n')
    };
}
const a=cards.owned(challenger),b=cards.owned(challenged);if(a.length<4||b.length<4)return{success:false,message:'❌ Both players need at least four anime cards'};db.prepare('INSERT INTO card_battles(id,platform,community_id,challenger,challenged,state,created_at) VALUES (?,?,?,?,?,?,?)').run(crypto.randomUUID(),platform,communityId,challenger,challenged,'pending',Date.now());const aPlayer = battleParticipant(challenger, platform);
const bPlayer = battleParticipant(challenged, platform);
return {
    success: true,
    mentions: participantMentions(aPlayer, bPlayer),
    message: `⚔️ CARD BATTLE CHALLENGE!\n\n👤 ${aPlayer.label} challenges ${bPlayer.label}!\n\n🎯 ${bPlayer.label}, respond with:\n✅ .cardbattle accept\n❌ .cardbattle decline`
};});
const reply=withTransaction((platform,communityId,gameId,accept)=>{sweep();const b=current(platform,communityId);if(!b||b.state!=='pending'||b.challenged!==gameId)return{success:false,message:'❌ No pending challenge for you'};
db.prepare(`
    UPDATE card_battles
    SET state = ?, updated_at = ?
    WHERE id = ?
`).run(
    accept ? 'selecting' : 'declined',
    Date.now(),
    b.id
);
const challenger = battleParticipant(b.challenger, platform);
const challenged = battleParticipant(b.challenged, platform);
return {
    success: true,
    mentions: participantMentions(challenger, challenged),
    message: accept
        ? `⚔️ CHALLENGE ACCEPTED!\n\n✅ ${challenged.label} accepted the challenge!\n🎴 ${challenger.label}, select your four cards first:\n\n.cs 1 2 3 4\n\nNumbers refer to deck first, then collection. The order decides the turns. Selections are secret.`
        : `❌ BATTLE DECLINED!\n${challenged.label} declined ${challenger.label}'s challenge.`
};});

function awardBattleExp(gameId, amount) {
    if (!Number.isInteger(amount) || amount <= 0) {
        return 0;
    }

    // Preserve the owner's competitive reward exclusion.
    if (gameId === config.ownerGameId) {
        return 0;
    }

    // Battle rewards identify players by AGU Game ID.
    // The EXP system identifies them by internal player ID.
    const account = db.prepare(
        'SELECT id FROM players WHERE game_id = ?'
    ).get(gameId);

    if (!account) {
        return 0;
    }

    // Use NYX's existing level/EXP/milestone system.
    const result = players.addExp(account.id, amount);

    return result ? amount : 0;
}

function reward(gameId, won) {
    const p = player(gameId);

    if (gameId === config.ownerGameId) {
        return {
            coins: 0,
            fragments: 0,
            exp: 0,
            excluded: true
        };
    }

    if (!won) {
        const coins = config.battleReward.lossCoins;
        const exp = awardBattleExp(
            gameId,
            config.battleReward.lossExp
        );

        p.coins += coins;
        savePlayer(p);

        return {
            coins,
            fragments: 0,
            exp
        };
    }

    const day = watDay();

    const total = db.prepare(`
        SELECT COUNT(*) AS n
        FROM battle_results
        WHERE winner_id = ?
        AND day_wat = ?
    `).get(gameId, day).n;

    const rank = total;

    const r = rank <= 3
        ? config.battleReward.first3
        : rank <= 10
            ? config.battleReward.next7
            : config.battleReward.later;

    const coins = randomInt(...r.coins);

    const fragments = r.fragments
        ? randomInt(...r.fragments)
        : (
            crypto.randomInt(100) <
            Math.floor(r.fragmentChance * 100)
                ? 1
                : 0
        );

    p.coins += coins;
    savePlayer(p);

    if (fragments) {
        inventory.add(
            gameId,
            'card_fragment',
            fragments,
            { pendingIfFull: true }
        );
    }

    // Config stores a range [min, max], while addExp requires one integer.
    const expAmount = Array.isArray(r.exp)
        ? randomInt(...r.exp)
        : r.exp;
    const exp = awardBattleExp(gameId, expAmount);

    return {
        coins,
        fragments,
        exp,
        rank
    };
}

const select=withTransaction((platform,communityId,gameId,slots)=>{sweep();const b=current(platform,communityId);if(!b||b.state!=='selecting')return{success:false,message:'❌ No accepted card battle here'};const isA=gameId===b.challenger,isB=gameId===b.challenged;if(!isA&&!isB)return{success:false,message:'❌ You are not in this battle'};const col=isA?'selections_a':'selections_b',other=isA?'selections_b':'selections_a';if(b[col])return{success:false,message:'❌ Already selected'};if(isB&&!b.selections_a)return{success:false,message:'❌ Wait for the challenger to select first'};if(!Array.isArray(slots)||slots.length!==4||new Set(slots).size!==4||slots.some(n=>!Number.isInteger(n)||n<1))return{success:false,message:'❌ Select exactly four different slots: .cs 1 2 3 4'};
 const owned=cards.owned(gameId);if(slots.some(i=>!owned[i-1]))return{success:false,message:'❌ One or more card slots do not exist. .deck and .collection list available cards'};
 const selected=slots.map(i=>owned[i-1].instanceId);
 db.prepare(`
    UPDATE card_battles
    SET ${col} = ?, updated_at = ?
    WHERE id = ?
`).run(
    JSON.stringify(selected),
    Date.now(),
    b.id
);
 if (isA) {
     const challenger = battleParticipant(b.challenger, platform);
     const challenged = battleParticipant(b.challenged, platform);
     return {
         success: true,
         mentions: participantMentions(challenged),
         message: `✅ FIRST TEAM LOCKED IN!\n\n🎴 ${challenger.label} has selected four cards.\n\n⚔️ ${challenged.label}, IT'S YOUR TURN!\n\nChoose four cards in battle order:\n.cs 1 2 3 4\n\n🔒 Your selections stay secret.`
     };
 }
 // Resolve saved instance IDs in order, not in deck-sort order.
 // A missing/transferred card invalidates this battle rather than silently lowering a team score.
 const resolveSelection = (owner, ids) => {
     const inventoryCards = new Map(cards.owned(owner).map(card => [card.instanceId, card]));
     return ids.map(id => inventoryCards.get(id));
 };
 const chosenA = resolveSelection(b.challenger, JSON.parse(b.selections_a));
 const chosenB = resolveSelection(b.challenged, selected);
 if ([...chosenA,...chosenB].some(card => !card)) {
     db.prepare("UPDATE card_battles SET state='expired' WHERE id=?").run(b.id);
     return {success:false,message:'❌ Battle cancelled: a selected card is no longer owned by its player. No battle rewards issued.'};
 }
 const simulation = abilities.simulate(chosenA,chosenB);
 const [a,c] = simulation.totals;
 const winner = simulation.winner === null ? null : (simulation.winner === 0 ? b.challenger : b.challenged);
 const loser = winner === null ? null : (winner === b.challenger ? b.challenged : b.challenger);
 db.prepare("UPDATE card_battles SET state='finished' WHERE id=?").run(b.id);db.prepare('INSERT INTO battle_results VALUES (?,?,?,?,?,?,?)').run(b.id,winner,loser,b.challenger,b.challenged,Date.now(),watDay());
 
 let winnerReward = null;
let loserReward = null;

let drawExpA = 0;
let drawExpB = 0;

if (winner) {
    winnerReward = reward(winner, true);
    loserReward = reward(loser, false);
} else {
    drawExpA = awardBattleExp(
        b.challenger,
        config.battleReward.drawExp
    );

    drawExpB = awardBattleExp(
        b.challenged,
        config.battleReward.drawExp
    );
}

 const hidden=winner?require('../../core/hiddenAchievements').check(winner):[];

 const playerAName=player(b.challenger).name;
 const playerBName=player(b.challenged).name;
 const roundMessages=simulation.rounds.map(round => {
     const parts=[`⚔️ ROUND ${round.number}/4`];
     for (let i=0;i<2;i++) {
         const card=round.cards[i],skill=round.abilities[i],eff=round.effects[i];
         const label=i===0?playerAName:playerBName;
         const breakdown=[];
         if(eff.assisted)breakdown.push(`🤝 +${eff.assisted} team buff`);
         if(eff.self)breakdown.push(`⚡ +${eff.self} enhancement`);
         if(eff.strike)breakdown.push(`⚔️ +${eff.strike} assault`);
         if(eff.weaken)breakdown.push(`🌑 -${eff.weaken} disruption`);
         if(eff.defense)breakdown.push(`🛡️ -${eff.defense} blocked by opponent`);
         if(eff.restored)breakdown.push(`💚 +${eff.restored} ${eff.recoveryType==='cleanse'?'disruption cleansed':'resilience'}`);
         if(skill.type==='guard')breakdown.push(round.effects[1-i].defense?`🛡️ blocked ${round.effects[1-i].defense} enemy assault power`:'🛡️ no incoming assault to block');
         if(skill.type==='support' && round.number<4)breakdown.push('🤝 +8% to future allies');
         parts.push(`${label}'s ${card.name} (T${card.tier}) uses ${skill.name}!`);
         parts.push(`⚡ ${eff.base} → ${eff.gain}${breakdown.length?' ('+breakdown.join('; ')+')':''}`);
     }
     parts.push(`📊 Total: ${round.totals[0].toLocaleString()} vs ${round.totals[1].toLocaleString()}`);
     return parts.join('\n');
 });
 const roundsText=roundMessages.join('\n\n');
 const msg = [
    '⚔️ NYX CARD BATTLE RESULTS',
    `🎴 ${playerAName} vs ${playerBName}`,
    '',
    roundsText,
    '',
    '🏁 FINAL POWER',
    `${player(b.challenger).name}: ⚡ ${a}`,
    `${player(b.challenged).name}: ⚡ ${c}`,
    '',
    winner
        ? `🏆 Winner: ${player(winner).name}`
        : '🤝 Draw!',
    '',
    winner
        ? [
            '🎁 WINNER REWARDS',
            `🪙 +${winnerReward.coins} Coins`,
            `🧩 +${winnerReward.fragments} Fragments`,
            `✨ +${winnerReward.exp} EXP`,
            winnerReward.excluded
                ? '(Owner competitive rewards excluded)'
                : '',
            '',
            '🎁 LOSER REWARDS',
            `🪙 +${loserReward.coins} Coins`,
            `✨ +${loserReward.exp} EXP`
          ].filter(Boolean).join('\n')
        : [
            `${player(b.challenger).name}: +${drawExpA} EXP`,
            `${player(b.challenged).name}: +${drawExpB} EXP`
          ].join('\n'),
    '',
    ...hidden
].join('\n');

 // Persist all results/rewards before WhatsApp begins its narration.
 // Other platforms still receive the original complete text message.
 const intro = [
     '⚔️ NYX CARD BATTLE BEGINS!',
     `🎴 ${playerAName} VS ${playerBName}`,
     '',
     '🔥 Four cards each. The selected order decides the turns!',
     '⏳ Let the clash begin…'
 ].join('\n');
 const finale = msg.slice(msg.indexOf('🏁 FINAL POWER'));
 return {
     success:true,
     message:msg,
     battleNarration: platform==='whatsapp' ? [intro,...roundMessages,finale] : undefined,
     battleId:b.id
 };});

const forfeit = withTransaction((platform, communityId, gameId) => {
    sweep();

    const battle = current(platform, communityId);

    if (!battle) {
        return {
            success: false,
            message: '❌ No active card battle to forfeit'
        };
    }

    if (battle.state !== 'selecting') {
        return {
            success: false,
            message: '❌ The challenge has not been accepted yet'
        };
    }

    if (
        gameId !== battle.challenger &&
        gameId !== battle.challenged
    ) {
        return {
            success: false,
            message: '❌ You are not participating in this battle'
        };
    }

    const winner = gameId === battle.challenger
        ? battle.challenged
        : battle.challenger;

    db.prepare(`
        UPDATE card_battles
        SET state = 'forfeited'
        WHERE id = ?
    `).run(battle.id);

    return {
        success: true,
        message: [
            '🏳️ NYX CARD BATTLE FORFEITED',
            '',
            `👤 ${player(gameId).name} surrendered`,
            `🏆 Winner: ${player(winner).name}`,
            '',
            '🎴 The battle has ended',
            '✅ New challenges are now allowed',
            '',
            'No competitive rewards were issued'
        ].join('\n')
    };
});

module.exports = {
    challenge,
    reply,
    select,
    current,
    forfeit,
    sweep
};

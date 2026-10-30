'use strict';

const { db } = require('../database/connection');

function maskPhone(value) {
    const digits = String(value || '').replace(/\D/g, '');

    if (digits.length < 7) return 'Hidden';

    return digits.slice(0, 5) +
        '*'.repeat(Math.max(4, digits.length - 7)) +
        digits.slice(-2);
}

function findPlayers(query, platform = '') {
    const search = String(query || '');

    if (!search.trim()) {
        return {
            success: false,
            message: '❌ Usage: .scp <exact username or AGU ID>'
        };
    }

    const players = db.prepare(`
        SELECT game_id, payload
        FROM players
    `).all();

    const matches = [];

    for (const row of players) {
        const player = JSON.parse(row.payload);

        const idMatch = row.game_id.toUpperCase() === search.trim().toUpperCase();

        // Exact username comparison.
        // No lowercase conversion or font normalization.
        const nameMatch = String(player.name||'').toLocaleLowerCase() === search.trim().toLocaleLowerCase();

        if (idMatch || nameMatch) {
            matches.push({
                gameId: row.game_id,
                name: player.name
            });
        }
    }

    if (!matches.length) {
        return {
            success: false,
            message: `🔎 No player found matching "${search}".`
        };
    }

    const identityQuery = db.prepare(`
        SELECT identity_key
        FROM identities
        WHERE game_id = ?
    `);

    const lines = [];
    const mentions = [];

    for (let i = 0; i < matches.length; i++) {
        const p = matches[i];

        const identities = identityQuery.all(p.gameId);
        const account = db.prepare('SELECT id FROM players WHERE game_id=?').get(p.gameId);
        if(account?.id && !identities.some(i=>i.identity_key===account.id))identities.push({identity_key:account.id});

        const details = [];
        let playerTag = '';

        for (const identity of identities) {
            const key = identity.identity_key;

            if (key.startsWith('whatsapp:')) {
                const whatsappId = key.slice('whatsapp:'.length);

                details.push(
                    `📱 WhatsApp: ${maskPhone(whatsappId)}`
                );

                mentions.push({
                    platform: 'whatsapp',
                    id: whatsappId,
                    gameId: p.gameId
                });

                // Baileys mentions require visible @identifier and matching
                // metadata JID. Both phone-number JIDs and LID JIDs exist.
                if (platform === 'whatsapp' && !playerTag) {
                    const localId = whatsappId.split('@')[0].replace(/:\d+$/, '');
                    if (/^\d{5,25}$/.test(localId)) {
                        playerTag = `@${localId}`;
                    }
                }
            }

            if (key.startsWith('discord:')) {
                const discordId = key.slice('discord:'.length);

                details.push(
                    `🎮 Discord: <@${discordId}>`
                );

                mentions.push({
                    platform: 'discord',
                    id: discordId,
                    gameId: p.gameId
                });
                if (
    platform === 'discord' &&
    !playerTag &&
    /^\d{15,22}$/.test(discordId)
) {
    playerTag = `<@${discordId}>`;
}
            }
        }

        lines.push(
            `${i + 1}. 👤 ${p.name}${playerTag ? ` (${playerTag})` : ''}\n` +
            `🆔 ${p.gameId}\n` +
            (details.join('\n') || '🔗 No linked platform identity')
        );
    }

    if(matches.length===1 && /^AGU-[A-Z0-9]+$/i.test(search.trim())) {
        const found=db.prepare('SELECT payload FROM players WHERE game_id=?').get(matches[0].gameId);
        const p=JSON.parse(found.payload);
        const all=db.prepare('SELECT payload FROM collections WHERE game_id=?').get(matches[0].gameId);
        const owned=all?JSON.parse(all.payload):{deck:[],collection:[]};
        const cards=[...(owned.deck||[]),...(owned.collection||[])];
        const identity = mentions.find(
    m => m.platform === 'whatsapp'
);

const whatsappJid = identity
    ? String(identity.id)
    : null;

const mentionTag = platform === 'whatsapp' && whatsappJid
    ? ` (@${whatsappJid.split('@')[0].replace(/:\d+$/, '')})`
    : '';
        return {success:true,mentions,message:`🔎 NYX PLAYER PROFILE\n\n👤 ${p.name}${mentionTag}\n🆔 ${p.gameId}\n⭐ Level: ${p.level} | ✨ EXP: ${p.exp}\n🎴 Total Cards: ${cards.length}\n⚡ Total Power: ${cards.reduce((sum,c)=>sum+(Number(c.power)||0),0).toLocaleString()}\n💎 TS: ${cards.filter(c=>String(c.tier).toUpperCase().replace(/^T/,'')==='S'&&!c.isEvent).length} | 🔥 T6: ${cards.filter(c=>String(c.tier).replace(/^T/,'')==='6'&&!c.isEvent).length} | ✨ Event: ${cards.filter(c=>c.isEvent).length}`};
    }
    return {
        success: true,
        message: `🔎 NYX PLAYER SEARCH

🔍 Search: ${search}
👥 Matches: ${matches.length}

${lines.join('\n\n━━━━━━━━━━━━━━\n\n')}

🌌 NYX Player Directory`,

        mentions
    };
}

module.exports = { findPlayers };
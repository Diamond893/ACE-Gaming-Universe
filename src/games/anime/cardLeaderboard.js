'use strict';

const { db } = require('../../database/connection');

function normalizeTier(tier) {
    return String(tier ?? '')
        .trim()
        .toUpperCase()
        .replace(/^TIER\s*/, '')
        .replace(/^T/, '');
}

function getCardLeaderboard(category, viewerGameId = '') {

    if (!['cards', 'power'].includes(category)) {
        return '❌ Invalid card leaderboard category.';
    }

    const players = db.prepare(`
        SELECT game_id, payload
        FROM players
    `).all();

    const collections = db.prepare(`
        SELECT game_id, payload
        FROM collections
    `).all();

    const escrow = db.prepare(`
        SELECT seller_id, payload
        FROM global_escrow
        WHERE asset_type = 'card'
        AND state IN ('pending', 'active')
    `).all();

    const accounts = new Map();

    for (const row of players) {

        const player = JSON.parse(row.payload);

        accounts.set(row.game_id, {
            gameId: row.game_id,
            name: player.name || 'Unknown',
            total: 0,
            power: 0,
            ts: 0,
            t6: 0,
            events: 0
        });
    }

    const counted = new Set();

    function countCard(gameId, card) {

        const account = accounts.get(gameId);

        if (!account || !card) return;

        // Prevent one card instance from being counted twice.
        if (card.instanceId) {
            if (counted.has(card.instanceId)) return;
            counted.add(card.instanceId);
        }

        account.total++;

        account.power +=
            Number.isFinite(Number(card.power))
                ? Math.max(0, Number(card.power))
                : 0;

        if (card.isEvent) {
            account.events++;
            return;
        }

        const tier = normalizeTier(card.tier);

        if (tier === 'S') account.ts++;
        if (tier === '6') account.t6++;
    }

    // Deck and collection.
    for (const row of collections) {

        const owned = JSON.parse(row.payload);

        for (const card of [
            ...(owned.deck || []),
            ...(owned.collection || [])
        ]) {
            countCard(row.game_id, card);
        }
    }

    // Cards still owned by auction sellers.
    for (const row of escrow) {
        countCard(
            row.seller_id,
            JSON.parse(row.payload)
        );
    }

    const ownerGameId =
        require('../../config/agu').ownerGameId;

    const ranking = [...accounts.values()]
    .filter(p =>
        String(p.gameId).toUpperCase() !==
        String(ownerGameId).toUpperCase()
    )
    .filter(p =>
        category === 'cards'
            ? p.total > 0
            : p.power > 0
    )
    .sort((a, b) => {

            if (category === 'power') {
                return b.power - a.power ||
                    b.total - a.total ||
                    a.gameId.localeCompare(b.gameId);
            }

            return b.total - a.total ||
                b.power - a.power ||
                a.gameId.localeCompare(b.gameId);
        });

    const title = category === 'cards'
        ? '🏆 NYX CARD LEADERBOARD'
        : '⚡ NYX CARD POWER LEADERBOARD';

    const lines = ranking.slice(0, 20).map((p, i) => {

        const rank =
            i === 0 ? '🥇' :
            i === 1 ? '🥈' :
            i === 2 ? '🥉' :
            `${i + 1}.`;

        return `${rank} ${p.name}
🎴 Total Cards: ${p.total.toLocaleString()}
⚡ Total Power: ${p.power.toLocaleString()}
💎 TS: ${p.ts} | 🔥 T6: ${p.t6} | ✨ Event: ${p.events}`;
    });

    const viewerIndex = ranking.findIndex(
        p => p.gameId === viewerGameId
    );

    const personalRank = viewerIndex < 0
        ? 'Unranked'
        : `#${viewerIndex + 1}`;

    return `${title}

${lines.join('\n\n') || 'No players found.'}

━━━━━━━━━━━━━━━━━━
👤 Your Rank: ${personalRank}`;
}

module.exports = { getCardLeaderboard };
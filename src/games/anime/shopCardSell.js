'use strict';

const {
    db,
    withTransaction,
    player,
    savePlayer
} = require('../../database/aguStore');

const collection = require('./collection');

const MAX_CARDS = 9;
const CONFIRM_TIME = 5 * 60 * 1000;

db.exec(`
    CREATE TABLE IF NOT EXISTS pending_card_sales (
        game_id TEXT PRIMARY KEY
            REFERENCES players(game_id),

        payload TEXT NOT NULL,

        expires_at INTEGER NOT NULL
    );
`);

function fail(message) {
    return { success: false, message };
}

function buyback(card) {
    if (card.isEvent) {
        throw Error('Exclusive Event Cards cannot be sold.');
    }

    const price = Number(card.price);

    if (
        !Number.isSafeInteger(price) ||
        price <= 0
    ) {
        throw Error(
            `Card "${card.name}" has no valid base price.`
        );
    }

    return Math.floor(price / 3);
}

function cardIsLocked(instanceId) {

    const table = db.prepare(`
        SELECT 1
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'card_trade_offers'
    `).get();

    if (!table) return false;

    const locked = db.prepare(`
        SELECT 1
        FROM card_trade_offers
        WHERE status = 'pending'
          AND expires_at > ?
          AND (
              sender_card_id = ?
              OR recipient_card_id = ?
          )
        LIMIT 1
    `).get(
        Date.now(),
        instanceId,
        instanceId
    );

    return Boolean(locked);
}

const prepareSale = withTransaction((
    gameId,
    source,
    slots
) => {

    if (!['deck', 'collection'].includes(source)) {
        return fail('❌ Invalid selling source.');
    }

    if (
        !Array.isArray(slots) ||
        slots.length < 1 ||
        slots.length > MAX_CARDS
    ) {
        return fail(
            '❌ You can sell between 1 and 9 cards.'
        );
    }

    if (
        slots.some(n =>
            !Number.isSafeInteger(n) || n < 1
        )
    ) {
        return fail('❌ Invalid card slot.');
    }

    if (new Set(slots).size !== slots.length) {
        return fail(
            '❌ Duplicate card slots are not allowed.'
        );
    }

    const owned = collection.getCollection(gameId);

    const available = source === 'collection' ? collection.orderedCollection(owned.collection) : owned.deck;

    const selected = slots.map(slot => ({
        slot,
        card: available[slot - 1]
    }));

    if (selected.some(x => !x.card)) {
        return fail(
            '❌ One or more card slots do not exist.'
        );
    }

    const cards = [];

    for (const entry of selected) {

        const card = entry.card;

        if (!card.instanceId) {
            return fail(
                '❌ Invalid card instance.'
            );
        }

        if (card.isEvent) {
            return fail(
                '❌ Event Cards cannot be sold.'
            );
        }

        if (cardIsLocked(card.instanceId)) {
            return fail(
                `❌ Card in slot ${entry.slot} is committed to a trade.`
            );
        }

        let payout;

        try {
            payout = buyback(card);
        } catch (error) {
            return fail(`❌ ${error.message}`);
        }

        cards.push({
            slot: entry.slot,
            instanceId: card.instanceId,
            name: card.name,
            tier: card.tier,
            payout
        });
    }

    const total = cards.reduce(
        (sum, card) => sum + card.payout,
        0
    );

    if (!Number.isSafeInteger(total)) {
        return fail('❌ Sale amount exceeds limits.');
    }

    const sale = {
        source,
        cards,
        total
    };

    db.prepare(`
        INSERT INTO pending_card_sales (
            game_id,
            payload,
            expires_at
        )
        VALUES (?, ?, ?)

        ON CONFLICT(game_id)
        DO UPDATE SET
            payload = excluded.payload,
            expires_at = excluded.expires_at
    `).run(
        gameId,
        JSON.stringify(sale),
        Date.now() + CONFIRM_TIME
    );

    return {
        success: true,

        message: `🛒 NYX CARD SELLING

🎴 Cards Selected: ${cards.length}

${cards.map((c, i) =>
    `${i + 1}. ${c.name} — T${c.tier}
💰 ${c.payout.toLocaleString()} Coins`
).join('\n\n')}

━━━━━━━━━━━━━━━━━━

💰 TOTAL PAYOUT:
${total.toLocaleString()} AGU Coins

⚠️ These cards will be permanently removed.

✅ .shop confirm
❌ .shop cancel

⏳ Confirmation expires in 5 minutes.`
    };
});

const confirmSale = withTransaction(gameId => {

    const row = db.prepare(`
        SELECT *
        FROM pending_card_sales
        WHERE game_id = ?
    `).get(gameId);

    if (!row) {
        return fail('❌ No pending card sale.');
    }

    if (Date.now() >= row.expires_at) {

        db.prepare(`
            DELETE FROM pending_card_sales
            WHERE game_id = ?
        `).run(gameId);

        return fail('❌ Your sale has expired.');
    }

    const sale = JSON.parse(row.payload);

    const owned = collection.getCollection(gameId);

    // Verify every card before removing anything.
    for (const item of sale.cards) {

        const card = owned[sale.source].find(
            c => c.instanceId === item.instanceId
        );

        if (!card || card.isEvent) {
            return fail(
                '❌ Your cards changed. Start a new sale.'
            );
        }

        if (cardIsLocked(card.instanceId)) {
            return fail(
                '❌ One of these cards is now committed to a trade.'
            );
        }

        if (buyback(card) !== item.payout) {
            return fail(
                '❌ Card pricing changed. Start a new sale.'
            );
        }
    }

    const p = player(gameId);

    if (
        !Number.isSafeInteger(p.coins) ||
        p.coins < 0 ||
        p.coins > Number.MAX_SAFE_INTEGER - sale.total
    ) {
        return fail(
            '❌ Wallet cannot receive this payment.'
        );
    }

    for (const item of sale.cards) {

        const removed = collection.removeCard(
            gameId,
            item.instanceId
        );

        if (!removed) {
            throw Error(
                'Card removal failed. Sale rolled back.'
            );
        }
    }

    p.coins += sale.total;

    savePlayer(p);

    db.prepare(`
        DELETE FROM pending_card_sales
        WHERE game_id = ?
    `).run(gameId);

    return {
        success: true,

        message: `✅ NYX CARD SALE COMPLETED!

🎴 Cards Sold: ${sale.cards.length}

💰 Coins Received:
+${sale.total.toLocaleString()} AGU Coins

🏦 New Balance:
${p.coins.toLocaleString()} AGU Coins

✅ Cards permanently removed.

🏆 Your card leaderboard statistics have been updated.`
    };
});

const cancelSale = withTransaction(gameId => {

    const result = db.prepare(`
        DELETE FROM pending_card_sales
        WHERE game_id = ?
    `).run(gameId);

    if (!result.changes) {
        return fail('❌ No pending sale.');
    }

    return {
        success: true,
        message: '✅ Card sale cancelled.'
    };
});

module.exports = {
    prepareSale,
    confirmSale,
    cancelSale
};
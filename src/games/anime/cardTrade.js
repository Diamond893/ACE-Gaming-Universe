'use strict';

const crypto = require('crypto');

const {
    db,
    withTransaction
} = require('../../database/connection');

const { savePlayer } = require('../../database/aguStore');
const collection = require('./collection');
const inventory = require('../../inventory/inventory');

const TRADE_DURATION = 5 * 60 * 1000;
const MAX_DECK_SIZE = 12;

db.exec(`
    CREATE TABLE IF NOT EXISTS card_trade_offers (
        trade_id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        recipient_id TEXT NOT NULL,

        trade_type TEXT NOT NULL,

        sender_card_id TEXT NOT NULL,
        recipient_card_id TEXT,

        coin_amount INTEGER NOT NULL DEFAULT 0,

        status TEXT NOT NULL DEFAULT 'pending',

        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_card_trade_status
    ON card_trade_offers(status, expires_at);
`);

function fail(message) {
    return {
        success: false,
        message
    };
}

function getDeckCard(gameId, slot) {
    if (
        !Number.isSafeInteger(slot) ||
        slot < 1 ||
        slot > MAX_DECK_SIZE
    ) {
        return null;
    }

    const owned = collection.getCollection(gameId);

    return owned.deck[slot - 1] || null;
}

function normalizeTier(tier) {
    return String(tier ?? '')
        .trim()
        .toUpperCase()
        .replace(/^TIER\s*/, '')
        .replace(/^T/, '');
}

function getPendingTradeForPlayer(gameId) {
    return db.prepare(`
        SELECT *
        FROM card_trade_offers
        WHERE status = 'pending'
        AND expires_at > ?
        AND (
            sender_id = ?
            OR recipient_id = ?
        )
        LIMIT 1
    `).get(Date.now(), gameId, gameId);
}

function createTrade({
    senderGameId,
    recipientGameId,
    senderSlot,
    requested
}) {
    return withTransaction(() => {

        if (!senderGameId || !recipientGameId) {
            return fail('❌ Both players must be registered.');
        }

        if (senderGameId === recipientGameId) {
            return fail('❌ You cannot trade with yourself.');
        }

        if (
            !Number.isSafeInteger(senderSlot) ||
            senderSlot < 1 ||
            senderSlot > MAX_DECK_SIZE
        ) {
            return fail('❌ Invalid deck slot.');
        }

        if (
            !Number.isSafeInteger(requested) ||
            requested < 1
        ) {
            return fail('❌ Invalid requested card or coin amount.');
        }

        // Prevent competing pending trade offers.
        if (
            getPendingTradeForPlayer(senderGameId) ||
            getPendingTradeForPlayer(recipientGameId)
        ) {
            return fail(
                '❌ One of these players already has a pending trade.'
            );
        }

        const senderCard = getDeckCard(
            senderGameId,
            senderSlot
        );

        if (!senderCard?.instanceId) {
            return fail(
                '❌ You do not own a card in that deck slot.'
            );
        }

        if (senderCard.isEvent) {
    return fail(
        '❌ Event Card trading is temporarily unavailable.'
    );
}

        const tradeType =
            requested <= MAX_DECK_SIZE
                ? 'card'
                : 'coins';

        let recipientCard = null;

        if (tradeType === 'card') {

            recipientCard = getDeckCard(
                recipientGameId,
                requested
            );

            if (!recipientCard?.instanceId) {
                return fail(
                    '❌ The recipient does not have a card in that deck slot.'
                );
            }

            if (
                normalizeTier(senderCard.tier) !==
                normalizeTier(recipientCard.tier)
            ) {
                return fail(
                    '❌ Card trades must involve cards of the same tier.'
                );
            }

            if (recipientCard.isEvent) {
                return fail(
                    '❌ Event Card trading is temporarily unavailable.'
                );
            }
        }

        const now = Date.now();

        const tradeId =
            'TR-' +
            crypto.randomBytes(4)
                .toString('hex')
                .toUpperCase();

        db.prepare(`
            INSERT INTO card_trade_offers (
                trade_id,
                sender_id,
                recipient_id,
                trade_type,
                sender_card_id,
                recipient_card_id,
                coin_amount,
                status,
                created_at,
                expires_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        `).run(
            tradeId,
            senderGameId,
            recipientGameId,
            tradeType,
            senderCard.instanceId,
            recipientCard?.instanceId || null,
            tradeType === 'coins' ? requested : 0,
            now,
            now + TRADE_DURATION
        );

        const requestedText =
            tradeType === 'card'
                ? `🎴 Requested: ${recipientCard.name} (${recipientCard.tier})`
                : `💰 Requested: ${requested.toLocaleString()} AGU Coins`;

        return {
            success: true,
            tradeId,

            message: `🌌 NYX TRADE REQUEST

🆔 Trade ID: ${tradeId}

🎴 Offered: ${senderCard.name} (${senderCard.tier})

${requestedText}

👤 Recipient: Tagged player only

⏳ Expires in 5 minutes.

✅ .trade accept ${tradeId}
❌ .trade decline ${tradeId}`

        };
    })();
}

function getTrade(tradeId) {
    return db.prepare(`
        SELECT *
        FROM card_trade_offers
        WHERE trade_id = ?
    `).get(String(tradeId).toUpperCase());
}

const closeTrade = withTransaction((
    tradeId,
    gameId,
    action
) => {

    const trade = getTrade(tradeId);

    if (!trade) {
        return fail('❌ Trade not found.');
    }

    if (trade.status !== 'pending') {
        return fail('❌ This trade is no longer pending.');
    }

    if (Date.now() >= trade.expires_at) {
        db.prepare(`
            UPDATE card_trade_offers
            SET status = 'expired'
            WHERE trade_id = ?
        `).run(trade.trade_id);

        return fail('❌ This trade has expired.');
    }

    if (
        action === 'cancel' &&
        gameId !== trade.sender_id
    ) {
        return fail(
            '❌ Only the sender can cancel this trade.'
        );
    }

    if (
        action === 'decline' &&
        gameId !== trade.recipient_id
    ) {
        return fail(
            '❌ Only the targeted recipient can decline this trade.'
        );
    }

    if (!['cancel', 'decline'].includes(action)) {
        return fail('❌ Invalid trade action.');
    }

    db.prepare(`
        UPDATE card_trade_offers
        SET status = ?
        WHERE trade_id = ?
        AND status = 'pending'
    `).run(
        action === 'cancel' ? 'cancelled' : 'declined',
        trade.trade_id
    );

    return {
        success: true,
        message:
            action === 'cancel'
                ? `✅ Trade ${trade.trade_id} cancelled.`
                : `❌ Trade ${trade.trade_id} declined.`
    };
});

function cancelTrade(tradeId, gameId) {
    return closeTrade(tradeId, gameId, 'cancel');
}

function declineTrade(tradeId, gameId) {
    return closeTrade(tradeId, gameId, 'decline');
}

const acceptTrade = withTransaction((tradeId, gameId) => {

    const trade = getTrade(tradeId);

    if (!trade) {
        return fail('❌ Trade not found.');
    }

    if (trade.status !== 'pending') {
        return fail('❌ This trade is no longer pending.');
    }

    if (trade.recipient_id !== gameId) {
        return fail(
            '❌ Only the targeted player can accept this trade.'
        );
    }

    if (Date.now() >= trade.expires_at) {
        db.prepare(`
            UPDATE card_trade_offers
            SET status = 'expired'
            WHERE trade_id = ?
        `).run(trade.trade_id);

        return fail('❌ This trade has expired.');
    }

    // Load permanent AGU accounts.
    const senderRow = db.prepare(`
        SELECT id, payload
        FROM players
        WHERE game_id = ?
    `).get(trade.sender_id);

    const recipientRow = db.prepare(`
        SELECT id, payload
        FROM players
        WHERE game_id = ?
    `).get(trade.recipient_id);

    if (!senderRow || !recipientRow) {
        return fail('❌ One of the players is no longer registered.');
    }

    const sender = JSON.parse(senderRow.payload);
    const recipient = JSON.parse(recipientRow.payload);

    // Load cards from the shared collection system.
    const senderOwned = collection.getCollection(trade.sender_id);
    const recipientOwned = collection.getCollection(trade.recipient_id);

    const senderCard = senderOwned.deck.find(
        card => card.instanceId === trade.sender_card_id
    );

    if (!senderCard) {
        return fail(
            '❌ The offered card is no longer in the sender’s deck.'
        );
    }

    // Unique Event Card transfers require their ownership ledger.
    // Keep them unavailable until that ledger is verified.
    if (senderCard.isEvent) {
        return fail(
            '❌ Event Card trading is temporarily unavailable.'
        );
    }

    let recipientCard = null;

    if (trade.trade_type === 'card') {

        recipientCard = recipientOwned.deck.find(
            card => card.instanceId === trade.recipient_card_id
        );

        if (!recipientCard) {
            return fail(
                '❌ The requested card is no longer in the recipient’s deck.'
            );
        }

        if (recipientCard.isEvent) {
            return fail(
                '❌ Event Card trading is temporarily unavailable.'
            );
        }

        if (
            normalizeTier(senderCard.tier) !==
            normalizeTier(recipientCard.tier)
        ) {
            return fail(
                '❌ Both cards must belong to the same tier.'
            );
        }

    } else if (trade.trade_type === 'coins') {

        const amount = trade.coin_amount;

        if (
            !Number.isSafeInteger(amount) ||
            amount <= 0
        ) {
            return fail('❌ Invalid trade amount.');
        }

        if (
            !Number.isSafeInteger(recipient.coins) ||
            recipient.coins < amount
        ) {
            return fail(
                '❌ The buyer does not have enough AGU Coins.'
            );
        }

        if (
            !Number.isSafeInteger(sender.coins) ||
            sender.coins < 0 ||
            sender.coins > Number.MAX_SAFE_INTEGER - amount
        ) {
            return fail(
                '❌ The seller cannot receive that amount.'
            );
        }

    } else {
        return fail('❌ Invalid trade type.');
    }

    // Claim the pending trade exactly once.
    const claimed = db.prepare(`
        UPDATE card_trade_offers
        SET status = 'completed'
        WHERE trade_id = ?
          AND status = 'pending'
          AND expires_at > ?
    `).run(trade.trade_id, Date.now());

    if (claimed.changes !== 1) {
        return fail(
            '❌ This trade has already been processed or expired.'
        );
    }

    // Transfer seller's card.
    const removedSenderCard = collection.removeCard(
        trade.sender_id,
        senderCard.instanceId
    );

    if (!removedSenderCard) {
        throw new Error('Could not remove the offered card.');
    }

    let exchangeMessage = '';

    if (trade.trade_type === 'card') {

        // Transfer requested card.
        const removedRecipientCard = collection.removeCard(
            trade.recipient_id,
            recipientCard.instanceId
        );

        if (!removedRecipientCard) {
            throw new Error('Could not remove the requested card.');
        }

        // Cards enter each player's collection.
        collection.restoreCard(
            trade.recipient_id,
            removedSenderCard
        );

        collection.restoreCard(
            trade.sender_id,
            removedRecipientCard
        );

        exchangeMessage = `🎴 CARD-FOR-CARD EXCHANGE

${sender.name} received:
🎴 ${removedRecipientCard.name} — T${removedRecipientCard.tier}

${recipient.name} received:
🎴 ${removedSenderCard.name} — T${removedSenderCard.tier}`;

    } else {

        const amount = trade.coin_amount;

        // Transfer offered card.
        collection.restoreCard(
            trade.recipient_id,
            removedSenderCard
        );

        // Transfer AGU Coins.
        recipient.coins -= amount;
        sender.coins += amount;

        const ledgerTransactionId = crypto.randomUUID();
        savePlayer(recipient, {
            category: 'card_trade',
            description: `Paid coins in card trade ${trade.trade_id}`,
            referenceId: trade.trade_id,
            transactionId: ledgerTransactionId
        });
        savePlayer(sender, {
            category: 'card_trade',
            description: `Received coins in card trade ${trade.trade_id}`,
            referenceId: trade.trade_id,
            transactionId: ledgerTransactionId
        });

        exchangeMessage = `💰 CARD-FOR-COINS EXCHANGE

${recipient.name} received:
🎴 ${removedSenderCard.name} — T${removedSenderCard.tier}

${sender.name} received:
💰 ${amount.toLocaleString()} AGU Coins`;
    }

    // 30% chance to award ONE Card Fragment.
    // Only one participant can receive it per completed trade.
    const fragmentWon = crypto.randomInt(100) < 30;

    let fragmentMessage = '';

    if (fragmentWon) {

        const winnerGameId = crypto.randomInt(2) === 0
            ? trade.sender_id
            : trade.recipient_id;

        const winnerName = winnerGameId === trade.sender_id
            ? sender.name
            : recipient.name;

        const reward = inventory.add(
            winnerGameId,
            'card_fragment',
            1,
            { pendingIfFull: true }
        );

        fragmentMessage = `

🎁 TRADE BONUS!

✨ ${winnerName} received 1 Card Fragment!

${reward.pending
    ? '📨 Reward saved as pending inventory.'
    : '🎒 Check your inventory.'}`;

    }

    return {
        success: true,
        tradeId: trade.trade_id,
        fragmentWon,

        message: `✅ NYX TRADE COMPLETED!

🆔 ${trade.trade_id}

${exchangeMessage}

━━━━━━━━━━━━━━━━━━━━

✅ Assets transferred successfully.
📦 Received cards are in your collections.${fragmentMessage}

🌌 Thank you for trading with NYX!`
    };
});

module.exports = {
    createTrade,
    getTrade,
    acceptTrade,
    cancelTrade,
    declineTrade,
    getPendingTradeForPlayer
};
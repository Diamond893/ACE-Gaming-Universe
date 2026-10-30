'use strict';

const { db, withTransaction } = require('../../database/connection');

const collection = require('./collection');

const MAX_GIFT_CARDS = 9;

const giveCards = withTransaction(({
    senderGameId,
    recipientGameId,
    source,
    slots
}) => {

    // Validate sender and recipient
    if (!senderGameId || !recipientGameId) {
        return {
            success: false,
            message: '❌ Sender or recipient is missing.'
        };
    }

    if (senderGameId === recipientGameId) {
        return {
            success: false,
            message: '❌ You cannot gift cards to yourself.'
        };
    }

    // Both players must exist
    const sender = db.prepare(
        'SELECT game_id FROM players WHERE game_id = ?'
    ).get(senderGameId);

    const recipient = db.prepare(
        'SELECT game_id FROM players WHERE game_id = ?'
    ).get(recipientGameId);

    if (!sender || !recipient) {
        return {
            success: false,
            message: '❌ Both players must have registered AGU accounts.'
        };
    }

    // Determine where the cards come from
    if (!['deck', 'collection'].includes(source)) {
        return {
            success: false,
            message: '❌ Invalid gifting source.'
        };
    }

    // Validate quantity
    if (
        !Array.isArray(slots) ||
        slots.length < 1 ||
        slots.length > MAX_GIFT_CARDS
    ) {
        return {
            success: false,
            message: '❌ You can gift between 1 and 9 cards at once.'
        };
    }

    // Validate slot numbers
    if (
        slots.some(slot =>
            !Number.isSafeInteger(slot) || slot < 1
        )
    ) {
        return {
            success: false,
            message: '❌ Invalid card slot number.'
        };
    }

    // Reject duplicate slots
    if (new Set(slots).size !== slots.length) {
        return {
            success: false,
            message: '❌ Duplicate card slots are not allowed.'
        };
    }

    // Load sender's collection once
    const owned = collection.getCollection(senderGameId);

    const available = source === 'deck'
        ? owned.deck
        : collection.orderedCollection(owned.collection);

    // Resolve ALL cards before removing anything.
    // This prevents shifting slot numbers.
    const selected = slots.map(slot => ({
        slot,
        card: available[slot - 1]
    }));

    if (selected.some(item => !item.card)) {
        return {
            success: false,
            message: '❌ One or more selected card slots do not exist.'
        };
    }

    // Validate unique card identities
    const instanceIds = selected.map(item =>
        item.card.instanceId
    );

    if (
        instanceIds.some(id => !id) ||
        new Set(instanceIds).size !== instanceIds.length
    ) {
        return {
            success: false,
            message: '❌ Invalid card ownership data.'
        };
    }

    // Transfer cards within one database transaction.
    // Any thrown error rolls back the complete transfer.
    const transferred = [];

    for (const item of selected) {

        const removed = collection.removeCard(
            senderGameId,
            item.card.instanceId
        );

        if (!removed) {
            throw new Error(
                `Card in slot ${item.slot} could not be removed.`
            );
        }

        // Recipient receives cards in COLLECTION, not deck.
        collection.restoreCard(
            recipientGameId,
            removed
        );

        // Preserve ownership of unique Event Cards.
        if (removed.isEvent) {

            if (!removed.eventId) {
                throw new Error(
                    'Event Card is missing its event ID.'
                );
            }

            const update = db.prepare(`
                UPDATE event_card_issued
                SET game_id = ?
                WHERE event_id = ?
                  AND instance_id = ?
                  AND game_id = ?
            `).run(
                recipientGameId,
                String(removed.eventId),
                String(removed.instanceId),
                senderGameId
            );

            if (update.changes !== 1) {
                throw new Error(
                    'Event Card ownership record could not be updated.'
                );
            }
        }

        transferred.push({
            slot: item.slot,
            name: removed.name,
            tier: removed.tier,
            instanceId: removed.instanceId
        });
    }

    // Return the transaction result
    return {
        success: true,
        transferred,

        message: `🎁 NYX CARD GIFT SUCCESSFUL!

🎴 Cards Transferred: ${transferred.length}

${transferred.map((card, index) =>
    `${index + 1}. ${card.name} — ${card.tier}`
).join('\n')}

━━━━━━━━━━━━━━━━━━━━

✅ All ${transferred.length} card(s) transferred successfully!

📦 The recipient can find them in their collection.`
    };
});

module.exports = {
    giveCards
};
// AGU MONTHLY PASS
// Cosmetic entitlement foundation.
// Subscription purchases, expiration tracking,
// database storage, and customization commands

const DEFAULT_DECK_COSMETICS = Object.freeze({
    background: "default",
    animatedDeck: false
});

function hasMonthlyPass(gameId) {
    // No active subscription system yet.
    // Never grant premium access by default.
    return false;
}

function getDeckCosmetics(gameId) {
    const premium = hasMonthlyPass(gameId);

    if (!premium) {
        return {
            background: DEFAULT_DECK_COSMETICS.background,
            animatedDeck: false
        };
    }

    // Future: load saved cosmetic preferences.
    return {
        background: "default",
        animatedDeck: true
    };
}

module.exports = {
    hasMonthlyPass,
    getDeckCosmetics
};
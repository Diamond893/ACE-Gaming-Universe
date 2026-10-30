const cooldowns = new Map();

const COOLDOWN_DURATION = 30 * 1000;

function canEarnExp(playerId, command) {
    const key = `${playerId}:${command}`;
    const now = Date.now();

    const lastUsed = cooldowns.get(key);

    if (lastUsed !== undefined) {
        const timePassed = now - lastUsed;

        if (timePassed < COOLDOWN_DURATION) {
            return false;
        }
    }

    cooldowns.set(key, now);

    return true;
}

module.exports = {
    canEarnExp
};
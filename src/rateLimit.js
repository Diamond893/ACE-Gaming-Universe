const lastCommandTime = new Map();

const COMMAND_COOLDOWN = 5000; // 5 seconds

function checkRateLimit(playerId) {
    const now = Date.now();
    const lastUsed = lastCommandTime.get(playerId);

    if (lastUsed !== undefined) {
        const remaining = COMMAND_COOLDOWN - (now - lastUsed);

        if (remaining > 0) {
            return {
                allowed: false,
                remainingSeconds: Math.ceil(remaining / 1000)
            };
        }
    }

    lastCommandTime.set(playerId, now);

    return {
        allowed: true,
        remainingSeconds: 0
    };
}

module.exports = {
    checkRateLimit
};
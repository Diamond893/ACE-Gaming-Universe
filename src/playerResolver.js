const { getPlayer, getPlayerByGameId } = require("./players");

const { getLinkedGameId } = require("./identity");

function resolvePlayer(platform, platformUserId) {

    // First, check whether the platform identity is linked
    const gameId = getLinkedGameId(platform, platformUserId);

    if (gameId) {
        return getPlayerByGameId(gameId);
    }

    // Support existing accounts during migration
    if (platform === "terminal") {
    return getPlayer(platformUserId);
}

const legacyId = `${platform}:${platformUserId}`;

return getPlayer(legacyId);

}

module.exports = {
    resolvePlayer
};
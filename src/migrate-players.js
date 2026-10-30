const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const filePath = path.join(__dirname, "../data/players.json");

if (!fs.existsSync(filePath)) {
    console.error("❌ Player database not found.");
    process.exit(1);
}

const players = JSON.parse(fs.readFileSync(filePath, "utf8"));

// Back up player data before making changes
const backupPath = path.join(
    __dirname,
    "../data/players.backup.json"
);

fs.copyFileSync(filePath, backupPath);

const usedIds = new Set(
    Object.values(players)
        .map(player => player.gameId)
        .filter(Boolean)
);

let updated = 0;

for (const player of Object.values(players)) {
    if (player.gameId) continue;

    let gameId;

    do {
        gameId = "AGU-" +
            crypto.randomBytes(6).toString("hex").toUpperCase();
    } while (usedIds.has(gameId));

    player.gameId = gameId;
    usedIds.add(gameId);

    updated++;

    console.log(`✅ ${player.name}: ${gameId}`);
}

if (updated > 0) {
    fs.writeFileSync(
        filePath,
        JSON.stringify(players, null, 2)
    );
}

console.log(`\n🌌 Migration complete!`);
console.log(`👤 Accounts updated: ${updated}`);
console.log("💾 Backup saved: data/players.backup.json");
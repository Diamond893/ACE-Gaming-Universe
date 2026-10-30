const { db, withTransaction } = require('./database/connection');
const { calculateLevel } = require('./experience');
const readAll = db.prepare('SELECT id, payload FROM players');
const upsert = db.prepare('INSERT INTO players (id, game_id, payload) VALUES (@id, @game_id, @payload) ON CONFLICT(id) DO UPDATE SET game_id=excluded.game_id, payload=excluded.payload');
const coinLedger = require('./economy/coinLedger');
const crypto = require('crypto');
function loadPlayers() {
    const players = {};
    for(const row of readAll.all()) players[row.id] = JSON.parse(row.payload);
    return players;
}
function savePlayers(players, ledgerMeta = {}) {
    const operation = db.transaction(() => {
        const transactionId = ledgerMeta.transactionId || crypto.randomUUID();
        const meta = { ...ledgerMeta, transactionId };
        const stack = new Error().stack;
        for (const [id, p] of Object.entries(players)) {
            const oldRow = db.prepare('SELECT payload FROM players WHERE id = ?').get(id);
            let oldBalance = null;
            if (oldRow) {
                try { oldBalance = JSON.parse(oldRow.payload).coins; } catch { oldBalance = null; }
            }
            upsert.run({ id, game_id: p.gameId, payload: JSON.stringify(p) });
            coinLedger.recordBalanceChange({
                playerId: id, gameId: p.gameId, oldBalance,
                newBalance: p.coins, meta, stack
            });
        }
    });
    return operation.immediate();
}
function generateGameId() {
    const crypto = require("crypto");

    return "AGU-" + crypto.randomBytes(6)
        .toString("hex")
        .toUpperCase();
}

function registerPlayer(playerId, username) {
    const players = loadPlayers();

    if (players[playerId]) {
        return "❌ You are already registered!";
    }

   const player = {
    id: playerId,
    gameId: generateGameId(),
    name: username,
    level: 1,
    exp: 0,
    coins: 1000,
    joined: new Date().toISOString(),
    lastDaily: null
};

    players[playerId] = player;

    savePlayers(players);

    return `✅ Welcome to AGU, ${username}! 
🎮 Your gaming adventure begins!

⭐ Level: 1
✨ EXP: 0
💰 AGU Coins: 1000

🆔 Your AGU ID: ${player.gameId}

🚀 START HERE
1️⃣ .daily - claim your free coins
2️⃣ .missions - see today's tasks for bonus rewards
3️⃣ .profile - check your stats anytime

📖 Lost? Type .help or .guide for the full command list.`;
}

// Rename only the account belonging to this player; permanent AGU ID is unchanged.
function changeUsername(playerId, rawName) {
    const name = String(rawName || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 30 || /[\r\n\t]/.test(name)) {
        return { success: false, message: '❌ Username must be 2–30 characters on one line.' };
    }
    const players = loadPlayers();
    const player = players[playerId];
    if (!player) return { success: false, message: '❌ Register first.' };
    if (player.name === name) return { success: false, message: '❌ That is already your username.' };
    const now = Date.now();
    const wait = 24 * 60 * 60 * 1000;
    if (now - (player.lastUsernameChangeAt || 0) < wait) {
        const hours = Math.ceil((wait - (now - player.lastUsernameChangeAt)) / 3600000);
        return { success: false, message: `⏳ Change your username again in ${hours} hour(s).` };
    }
    const previous = player.name;
    player.name = name;
    player.lastUsernameChangeAt = now;
    savePlayers(players);
    return { success: true, message: `✅ USERNAME UPDATED!\n👤 Old Name: ${previous}\n✨ New Name: ${name}` };
}

// AFK state is stored on the permanent player record shared by both platforms.
function setAfk(playerId, reason = '') {
    const players = loadPlayers();
    const player = players[playerId];
    if (!player) return { success: false, message: '❌ Register first.' };
    const safeReason = String(reason || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 100);
    if (player.afk?.since) return { success: false, message: '💤 You are already AFK. Use .back when you return.' };
    player.afk = { since: new Date().toISOString(), reason: safeReason };
    savePlayers(players);
    return { success: true, message: `💤 ${player.name} is now AFK.${safeReason ? `\n📝 ${safeReason}` : ''}\nUse .back when you return.` };
}

function clearAfk(playerId) {
    const players = loadPlayers();
    const player = players[playerId];
    if (!player) return { success: false, message: '❌ Register first.' };
    if (!player.afk?.since) return { success: false, message: '✅ You are not AFK.' };
    delete player.afk;
    savePlayers(players);
    return { success: true, message: `🌟 Welcome back, ${player.name}! AFK protection is off.` };
}

function afkBlockMessage(player) {
    if (!player?.afk?.since) return null;
    const reason = player.afk.reason ? `\n📝 ${player.afk.reason}` : '';
    return `💤 ${player.name} is AFK and cannot be targeted right now.${reason}`;
}

// A shop purchase changes a single persistent account in one saved operation.
function buyShopItem(playerId, item) {
    const players = loadPlayers();
    const player = players[playerId];
    if (!player) return { success:false, message:'❌ Register first.' };
    if (!item || item.effect !== 'robbery_shield') return {success:false,message:'❌ This item is not available for purchase yet.'};
    const now = Date.now();
    if (Number(player.robShieldUntil || 0) > now) {
        const hours = Math.ceil((player.robShieldUntil - now) / 3600000);
        return {success:false,message:`🛡️ You already have a robbery shield. ${hours} hour(s) remaining.`};
    }
    if (!Number.isSafeInteger(player.coins) || player.coins < item.price) {
        return {success:false,message:`❌ You need ${item.price.toLocaleString()} Coins to buy ${item.name}.`};
    }
    player.coins -= item.price;
    player.robShieldUntil = now + item.hours * 3600000;
    savePlayers(players);
    return {success:true,message:`✅ PURCHASE SUCCESSFUL!\n🛡️ ${item.name} activated for ${item.hours} hours.\n💸 Cost: ${item.price.toLocaleString()} Coins\n🏦 Balance: ${player.coins.toLocaleString()} Coins`};
}

function getPlayer(playerId) {
    const players = loadPlayers();

    return players[playerId] || null;
}

const LEVEL_REWARDS = {
    5: 50,
    10: 200,
    20: 400,
    30: 500,
    50: 1500,
    100: 2000
};

function addExp(playerId, amount) {
    const players = loadPlayers();
    const player = players[playerId];

    if (!player) {
        return null;
    }

    if (!Number.isInteger(amount) || amount <= 0) {
        return null;
    }

    // Save the player's previous level
    const previousLevel = player.level;

    // Award EXP
    player.exp += amount;

    // Calculate new level
    const progress = calculateLevel(player.exp);

    const leveledUp = progress.level > previousLevel;

    player.level = progress.level;

    // Track milestones already rewarded
    if (!Array.isArray(player.claimedLevelRewards)) {
        player.claimedLevelRewards = [];
    }

    let coinsEarned = 0;
    const milestonesReached = [];

    // Check every milestone crossed during this EXP gain
    for (const [levelText, reward] of Object.entries(LEVEL_REWARDS)) {
        const milestone = Number(levelText);

        if (
            previousLevel < milestone &&
            player.level >= milestone &&
            !player.claimedLevelRewards.includes(milestone)
        ) {
            player.coins += reward;

            coinsEarned += reward;

            player.claimedLevelRewards.push(milestone);

            milestonesReached.push(milestone);
        }
    }

    // Save EXP, level and rewards together
    savePlayers(players);

    return {
        totalExp: player.exp,
        level: player.level,
        leveledUp,
        currentExp: progress.currentExp,
        requiredExp: progress.requiredExp,

        coinsEarned,
        milestonesReached
    };
}

function claimDaily(playerId) {
    const players = loadPlayers();
    const player = players[playerId];

    if (!player) {
        return "❌ Register first using .register <name>";
    }

    const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Lagos",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());

    const lastClaim = player.lastDaily;

    // Accept both old timestamp-based claims and new date strings
    let lastClaimDate = null;

    if (lastClaim) {
        const parsed = new Date(lastClaim);

        if (!Number.isNaN(parsed.getTime())) {
            lastClaimDate = new Intl.DateTimeFormat("en-CA", {
                timeZone: "Africa/Lagos",
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }).format(parsed);
        }
    }

   if (lastClaimDate === today || lastClaim === today) {

    // Calculate time remaining until midnight in Nigeria (WAT = UTC+1)
    const now = Date.now();

    const watOffset = 60 * 60 * 1000;

    const currentWAT = new Date(now + watOffset);

    const nextMidnight = Date.UTC(
        currentWAT.getUTCFullYear(),
        currentWAT.getUTCMonth(),
        currentWAT.getUTCDate() + 1
    ) - watOffset;

    const remaining = nextMidnight - now;

    const totalMinutes = Math.ceil(remaining / 60000);

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const countdown = hours > 0
        ? `${hours}h ${minutes}m`
        : `${minutes}m`;

    return `⏳ You've already claimed today's reward!

🌙 Come back in ${countdown}.`;
}

    const reward = 150;

    player.coins += reward;

    // Save the claim timestamp
    player.lastDaily = new Date().toISOString();

    savePlayers(players);

    return `🎁 DAILY REWARD

💰 AGU Coins received: ${reward}
🏦 Current balance: ${player.coins}

✅ Daily reward claimed!`;
}

function claimWeekly(playerId) {
    const players = loadPlayers();
    const player = players[playerId];

    if (!player) {
        return "❌ Register first using .register <name>";
    }

    const WAT_OFFSET = 60 * 60 * 1000;
    const now = Date.now();
    const watNow = new Date(now + WAT_OFFSET);

    // Find the start of the current week (Monday)
    const day = watNow.getUTCDay();
    const daysSinceMonday = (day + 6) % 7;

    const weekStart = Date.UTC(
        watNow.getUTCFullYear(),
        watNow.getUTCMonth(),
        watNow.getUTCDate() - daysSinceMonday
    ) - WAT_OFFSET;

    const nextWeekStart = weekStart + 7 * 24 * 60 * 60 * 1000;

    if (player.lastWeekly && player.lastWeekly >= weekStart) {
        const remaining = nextWeekStart - now;

        const totalMinutes = Math.ceil(remaining / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        return `⏳ Weekly reward already claimed!

🌙 Come back in ${hours}h ${minutes}m.`;
    }

    const reward = 1000;

    player.coins += reward;
    player.lastWeekly = now;

    savePlayers(players);

    return `🎁 WEEKLY REWARD

💰 AGU Coins received: ${reward}
🏦 Current balance: ${player.coins}

✅ Weekly reward claimed!`;
}

function claimMonthly(playerId) {
    const players = loadPlayers();
    const player = players[playerId];

    if (!player) {
        return "❌ Register first using .register <name>";
    }

    const WAT_OFFSET = 60 * 60 * 1000;
    const now = Date.now();
    const watNow = new Date(now + WAT_OFFSET);

    // Beginning of the current month in Nigerian time
    const monthStart = Date.UTC(
        watNow.getUTCFullYear(),
        watNow.getUTCMonth(),
        1
    ) - WAT_OFFSET;

    // Beginning of the next month in Nigerian time
    const nextMonthStart = Date.UTC(
        watNow.getUTCFullYear(),
        watNow.getUTCMonth() + 1,
        1
    ) - WAT_OFFSET;

    // Check whether the player has already claimed this month
    if (player.lastMonthly && player.lastMonthly >= monthStart) {
        const remaining = nextMonthStart - now;

        const totalMinutes = Math.ceil(remaining / 60000);
        const days = Math.floor(totalMinutes / 1440);
        const hours = Math.floor((totalMinutes % 1440) / 60);
        const minutes = totalMinutes % 60;

        return `⏳ Monthly reward already claimed!

🌙 Come back in ${days}d ${hours}h ${minutes}m.`;
    }

    const reward = 3500;

    player.coins += reward;
    player.lastMonthly = now;

    savePlayers(players);

    return `🎁 MONTHLY REWARD

💰 AGU Coins received: ${reward}
🏦 Current balance: ${player.coins}

✅ Monthly reward claimed!`;
}

// Transfer coins by permanent AGU ID, independent of platform.
// One synchronous read-modify-write updates both balances together.
function transferCoins(senderId, recipientGameId, amount) {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
        return { success: false, message: "❌ Amount must be a positive whole number." };
    }

    const players = loadPlayers();
    const sender = players[senderId];
    if (!sender) {
        return { success: false, message: "❌ Register first." };
    }

    const normalizedId = String(recipientGameId || "").trim().toUpperCase();
    const recipient = Object.values(players).find(p => p.gameId === normalizedId);
    if (!recipient) {
        return { success: false, message: "❌ Recipient AGU ID not found." };
    }
    if (afkBlockMessage(recipient)) return { success: false, message: afkBlockMessage(recipient) };
    if (recipient.id === sender.id || recipient.gameId === sender.gameId) {
        return { success: false, message: "❌ You cannot send coins to yourself." };
    }
    if (!Number.isSafeInteger(sender.coins) || sender.coins < amount) {
        return { success: false, message: "❌ Insufficient coins." };
    }
    if (!Number.isSafeInteger(recipient.coins) || recipient.coins > Number.MAX_SAFE_INTEGER - amount) {
        return { success: false, message: "❌ Transfer exceeds wallet limits." };
    }

    sender.coins -= amount;
    recipient.coins += amount;
    savePlayers(players);
    return {
        success: true,
        message: `✅ Sent ${amount.toLocaleString()} coins to ${recipient.name} (${recipient.gameId}).\n💰 Your balance: ${sender.coins.toLocaleString()} coins`
    };
}


// Group-only game mechanic. A failed robbery compensates the target; no coins are created.
function attemptRobbery(senderId, victimGameId) {
    const crypto = require("crypto");
    const players = loadPlayers();
    const robber = players[senderId];
    const victim = Object.values(players).find(p => p.gameId === String(victimGameId).toUpperCase());
    if (!robber || !victim) return { success: false, message: "❌ Both players must be registered." };
    if (afkBlockMessage(victim)) return { success: false, message: afkBlockMessage(victim) };
    if (Number(victim.robShieldUntil || 0) > Date.now()) {
        const remaining = Math.ceil((victim.robShieldUntil - Date.now()) / 3600000);
        return { success:false, message:`🛡️ ${victim.name} has an active Robbery Shield (${remaining}h remaining). Your cooldown was not used.` };
    }
    if (robber.gameId === victim.gameId) return { success: false, message: "❌ You cannot rob yourself." };
    const now = Date.now();
    const cooldown = 0 * 60 * 60 * 1000;
    if (now - (robber.lastRobAt || 0) < cooldown) {
        const minutes = Math.ceil((cooldown - (now - robber.lastRobAt)) / 60000);
        return { success: false, message: `⏳ You can attempt another robbery in ${minutes} minute(s).` };
    }
    // Victims get half an hour of protection against repeated attacks.
    if (now - (victim.lastRobTargetAt || 0) < 0.5 * 60 * 60 * 1000)
        return { success: false, message: "🛡️ That player is temporarily protected from robberies." };
    if (robber.coins < 200) return { success: false, message: "❌ You need at least 200 AGU Coins to risk a robbery." };
    if (victim.coins < 50) return { success: false, message: "❌ That player does not have enough AGU Coins to rob." };
    const amount = Math.min(crypto.randomInt(50, 201), victim.coins, robber.coins);
    const won = crypto.randomInt(100) < 45; // 45% chance of success
    if (won) { victim.coins -= amount; robber.coins += amount; }
    else { robber.coins -= amount; victim.coins += amount; }
    robber.lastRobAt = now;
    victim.lastRobTargetAt = now;
    savePlayers(players);
    return {
        success: true,
        message: won
    ? `🥷 ROBBERY SUCCESSFUL!\n💰 You stole ${amount} AGU Coins from ${victim.name}!`
    : `🚨 BUSTED!\n🛡️ ${victim.name}'s anti-robbery protection caught you red-handed!\n💸 You had to pay ${amount} AGU Coins as compensation.`
    };
}

// NYX COIN FLIP
// Minimum stake: 100 coins
// Maximum stake: 500 coins

function coinFlip(playerId, rawAmount) {
    const crypto = require('crypto');

    const MIN_BET = 100;
    const MAX_BET = 500;
    const STARTING_CHANCE = 50; // 50% chance to win on the first flip
    const HOUSE_RETURN = 0.95;
    const MIN_WIN_CHANCE = 1;

    // Validate amount strictly.
    const amountText = String(rawAmount ?? '').trim();

    if (!/^\d+$/.test(amountText)) {
        return {
            success: false,
            message: '❌ Usage: .coinflip <100-500>\nExample: .coinflip 200'
        };
    }

    const amount = Number(amountText);

    if (
        !Number.isSafeInteger(amount) ||
        amount < MIN_BET ||
        amount > MAX_BET
    ) {
        return {
            success: false,
            message: '❌ Coin Flip stakes must be between 100 and 500 AGU Coins.'
        };
    }

    const players = loadPlayers();
    const player = players[playerId];

    if (!player) {
        return {
            success: false,
            message: '❌ Register first using .register <name>.'
        };
    }

    if (
        !Number.isSafeInteger(player.coins) ||
        player.coins < amount
    ) {
        return {
            success: false,
            message: `❌ Insufficient coins!\n\n🪙 Stake: ${amount}\n🏦 Your balance: ${player.coins}`
        };
    }

    // Nigeria calendar date
    const today = getWATDay();

    // Reset daily probability
    if (player.coinFlipDay !== today) {
        player.coinFlipDay = today;
        player.coinFlipCount = 0;
    }

    const attempts = Math.max(
        0,
        Number(player.coinFlipCount) || 0
    );

    // Winning probability decreases by 1% per flip
    const winChance = Math.max(
    MIN_WIN_CHANCE,
    STARTING_CHANCE - attempts
    );

    // Secure random result
    const won = crypto.randomInt(100) < winChance;

    const profit = Math.floor(
    amount * (
        HOUSE_RETURN / (winChance / 100) - 1
     )
    );

    // Update wallet
    if (won) {
        player.coins += profit;
    } else {
        player.coins -= amount;
    }

    // Count completed flip
    player.coinFlipCount = attempts + 1;

    // Save player balance and flip progress together
    savePlayers(players);

    const nextChance = Math.max(
    MIN_WIN_CHANCE,
    STARTING_CHANCE - player.coinFlipCount
    );
    
    return {
        success: true,
        won,
        amount,
        profit: won ? profit : -amount,
        balance: player.coins,
        winChance,
        nextChance,
        attempts: player.coinFlipCount,

        message: won
            ? `🪙 NYX COIN FLIP

🎉 YOU WON!

💰 Stake: ${amount} AGU Coins
💚 Profit: +${profit} AGU Coins

🏦 New balance: ${player.coins} AGU Coins
📉 Next flip chance: ${nextChance}%`

            : `🪙 NYX COIN FLIP

💀 YOU LOST!

💰 Stake: ${amount} AGU Coins
💸 Lost: ${amount} AGU Coins

🏦 Remaining balance: ${player.coins} AGU Coins
📉 Next flip chance: ${nextChance}%`
    };
}

function getPlayerByGameId(gameId) {
    const players = loadPlayers();

    const normalizedId = String(gameId).trim().toUpperCase();

    for (const player of Object.values(players)) {
        if (player.gameId === normalizedId) {
            return player;
        }
    }

    return null;
}

const STREAK_REWARDS = {
    3: 100,
    7: 250,
    14: 500,
    30: 1000
};

function getWATDay() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Lagos",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());

    const get = (type) =>
        parts.find(part => part.type === type).value;

    return `${get("year")}-${get("month")}-${get("day")}`;
}

function dayNumber(dateString) {
    return Math.floor(
        Date.parse(`${dateString}T00:00:00Z`) / 86400000
    );
}

function updateActivityStreak(playerId) {
    const players = loadPlayers();
    const player = players[playerId];

    if (!player) return null;

    const today = getWATDay();

    if (player.lastActivityDay === today) {
        return {
            streak: player.activityStreak || 0,
            reward: 0,
            updated: false
        };
    }

    const previousDay = player.lastActivityDay;

    const consecutive =
        previousDay &&
        dayNumber(today) - dayNumber(previousDay) === 1;

    player.activityStreak = consecutive
        ? (player.activityStreak || 0) + 1
        : 1;

    player.lastActivityDay = today;

    const reward =
        STREAK_REWARDS[player.activityStreak] || 0;

    if (reward > 0) {
        player.coins += reward;
    }

    savePlayers(players);

    return {
        streak: player.activityStreak,
        reward,
        updated: true
    };
}

function getActivityStreak(playerId) {
    const player = getPlayer(playerId);

    if (!player) return null;

    const today = getWATDay();
    const lastDay = player.lastActivityDay;

    const gap = lastDay
        ? dayNumber(today) - dayNumber(lastDay)
        : null;

    // If yesterday was the last active day,
    // the player can still continue their streak today.
    const activeStreak =
        gap !== null && gap <= 1
            ? (player.activityStreak || 0)
            : 0;

    return {
        streak: activeStreak,
        lastActivityDay: lastDay || null
    };
}


// Shared achievement and mission progress; stored with the player's existing record.
// Event names must be emitted by actual gameplay code.
function recordGameEvent(playerId, event, detail = null) {
    const { applyAchievementEvent } = require('./core/achievements');
    const { applyMissionEvent } = require('./core/missions');
    const players = loadPlayers();
    const player = players[playerId];
    if (!player) return null;

    const achievements = applyAchievementEvent(player, event, detail);
    const missions = applyMissionEvent(player, event, detail);
    savePlayers(players);

// Referral activity uses genuine card acquisition.
// The underlying player account is shared across platforms.
if (event === 'card_collected') {

    const referrals = require('./core/referrals');

    referrals.recordActivity(
        player.gameId,
        event
    );
}

return { achievements, missions };
}

// Called after a command has changed coins / EXP / levels / streaks.
// Rewards and completion IDs are saved together in the existing players.json.
function checkPlayerStatAchievements(playerId) {
    const { checkStatAchievements } = require('./core/achievements');
    const players = loadPlayers();
    const player = players[playerId];
    if (!player) return [];
    const awards = checkStatAchievements(player);
    if (awards.length) savePlayers(players);
    return awards;
}

function getAchievementSummary(playerId) {
    const { getCompletedAchievements } = require('./core/achievements');
    const player = getPlayer(playerId);
    return player ? getCompletedAchievements(player) : null;
}

function getMissionSummary(playerId) {
    const { getDailyMissionStatus } = require('./core/missions');
    const player = getPlayer(playerId);
    return player ? getDailyMissionStatus(player) : null;
}


// Global cross-platform leaderboard: one entry per permanent AGU account.
// Read-only: standings never grant EXP, coins or streak activity.
function getLeaderboard(category = "exp", viewerGameId = "") {
    const kind = String(category || "exp").trim().toLowerCase();
    if (!["exp", "coins", "streak"].includes(kind)) {
        return "❌ Usage: .lb [coins|streak]";
    }

    const players = loadPlayers();
    const byAccount = new Map();
    const today = dayNumber(getWATDay());

    for (const p of Object.values(players)) {
        if (!p || !p.gameId) continue;
        const id = String(p.gameId).toUpperCase();
        // The bot owner's operational account is excluded from every competitive ranking.
        if(id === require('./config/agu').ownerGameId) continue;
        if (byAccount.has(id)) continue; // Linked identities share one account.
        const last = p.lastActivityDay;
        const gap = last && /^\d{4}-\d{2}-\d{2}$/.test(last)
            ? today - dayNumber(last) : Infinity;
        const streak = gap >= 0 && gap <= 1
            ? Math.max(0, Number(p.activityStreak) || 0) : 0;
        byAccount.set(id, {
            id,
            name: String(p.name || "Unknown").replace(/[\r\n]/g, " ").slice(0, 30),
            level: Math.max(1, Number(p.level) || 1),
            exp: Math.max(0, Number(p.exp) || 0),
            coins: Math.max(0, Number(p.coins) || 0),
            streak
        });
    }

    const ordered = Array.from(byAccount.values());
    const metric = kind === "exp" ? "exp" : kind;
    ordered.sort((a, b) => b[metric] - a[metric] || b.exp - a.exp || a.id.localeCompare(b.id));
    const title = kind === "exp" ? "🏆 AGU GLOBAL LEADERBOARD"
        : kind === "coins" ? "💰 AGU COINS LEADERBOARD"
        : "🔥 AGU STREAK LEADERBOARD";
    if (!ordered.length) return `${title}\n\nNo registered players yet.`;

    const fmt = n => n.toLocaleString("en-US");
    const lines = ordered.slice(0, 20).map((p, i) => {
        const rank = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
        if (kind === "exp") return `${rank} ${p.name} - Level ${fmt(p.level)}\n   Total EXP - ${fmt(p.exp)}`;
        if (kind === "coins") return `${rank} ${p.name} - ${fmt(p.coins)} Coins`;
        return `${rank} ${p.name} - ${fmt(p.streak)} Day${p.streak === 1 ? "" : "s"}`;
    });
    const viewerId = String(viewerGameId || "").toUpperCase();
    const index = ordered.findIndex(p => p.id === viewerId);
    const personal = index < 0 ? "Unranked" : `#${index + 1}`;
    return `${title}\n\n${lines.join("\n\n")}\n\n━━━━━━━━━━━━━━━━━━\n👤 Your Rank: ${personal}`;
}

const exportsRaw = {
    coinFlip,
    buyShopItem,
    setAfk,
    clearAfk,
    afkBlockMessage,
    registerPlayer,
    changeUsername,
    getLeaderboard,
    getPlayer,
    getPlayerByGameId,
    transferCoins,
    attemptRobbery,
    addExp,
    claimDaily,
    claimWeekly,
    claimMonthly,
    updateActivityStreak,
    getActivityStreak,
    recordGameEvent,
    getAchievementSummary,
    getMissionSummary,
    checkPlayerStatAchievements
};
module.exports = Object.fromEntries(Object.entries(exportsRaw).map(([name,fn]) => [name,withTransaction(fn)]));

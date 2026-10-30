'use strict';

const crypto = require('crypto');
const { db } = require('../../database/connection');
const settings = require('./settings');
const lock=require('./activityLock');

const GAME_DURATION = 3 * 60 * 1000;

db.exec(`
    CREATE TABLE IF NOT EXISTS number_guess_games (
        platform TEXT NOT NULL,
        community_id TEXT NOT NULL,
        secret INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        PRIMARY KEY (platform, community_id)
    )
`);

// Remember which Discord channel started each game.
const columns = db.prepare(
    'PRAGMA table_info(number_guess_games)'
).all();

if (!columns.some(column => column.name === 'channel_id')) {
    db.exec(
        'ALTER TABLE number_guess_games ADD COLUMN channel_id TEXT'
    );
}

const findGame = db.prepare(`
    SELECT * FROM number_guess_games
    WHERE platform = ? AND community_id = ?
`);

const createGame = db.prepare(`
    INSERT INTO number_guess_games
    (platform, community_id, secret, started_at, expires_at, channel_id)
    VALUES (?, ?, ?, ?, ?, ?)
`);

const deleteGame = db.prepare(`
    DELETE FROM number_guess_games
    WHERE platform = ? AND community_id = ?
`);

function play(
    platform, 
    communityId, 
    action, 
    playerName = 'Unknown Player',
    channelId = null
) {
    if (!settings.isEnabled(platform, communityId, 'guess')) {
        return '🔒 Number Guessing is disabled in this community.';
    }

    const input = String(action || '').trim().toLowerCase();
    const now = Date.now();

    return db.transaction(() => {
        let game = findGame.get(platform, communityId);

        if (game && now >= game.expires_at) {
         return `⏰ TIME'S UP!

⌛ This Number Guessing round has expired.

🌌 NYX is revealing the answer.
Please wait for the timeout announcement.`;
       }

        if (input === 'start') {
            const busy=lock.otherGame(platform,communityId,'guess');
            if(busy) return `⛔ ${busy} is already active in this community. Finish it first.`;
            if (game) {
                return '⏳ A Number Guessing game is already running here!';
            }

            const secret = crypto.randomInt(1, 101);

            createGame.run(
                platform,
                communityId,
                secret,
                now,
                now + GAME_DURATION,
                channelId
            );

            return `🌌 NYX NUMBER CHALLENGE

🎯 I've selected a number between 1 and 100.

⏳ You have 3 minutes!
👥 Everyone can participate.

🔢 Use .guess <number> to guess.

🖤 NYX: "Let's see who cracks my code."`;
        }

        if (input === 'status') {
            if (!game) return '🎮 No Number Guessing game is currently running.';

            const seconds = Math.ceil((game.expires_at - now) / 1000);

            return `🔢 NUMBER GUESSING

⏳ Time remaining: ${seconds} seconds
👥 Anyone can guess!

Use .guess <number>.`;
        }

        if (!game) {
            return '❌ No active Number Guessing game. Use .guess start.';
        }

        if (!/^\d+$/.test(input)) {
            return '❌ Enter a number between 1 and 100.';
        }

        const guess = Number(input);

        if (guess < 1 || guess > 100) {
            return '❌ Your guess must be between 1 and 100.';
        }

        if (guess === game.secret) {
            deleteGame.run(platform, communityId);

            return `🏆 CORRECT ANSWER!

🎯 The secret number was ${game.secret}!

👑 We have a winner! ${playerName}

🖤 NYX: "Impressive. You cracked my code."`;
        }

        return guess < game.secret
            ? '⬆️ That is low! Try a higher number.'
            : '⬇️ That is high! Try a lower number.';
    }).immediate();
}

function getExpiredGames(platform) {
    return db.prepare(`
        SELECT community_id, secret, channel_id
        FROM number_guess_games
        WHERE platform = ? AND expires_at <= ?
    `).all(platform, Date.now());
}

function expireGame(platform, communityId) {
    return db.transaction(() => {
        const game = findGame.get(platform, communityId);

        if (!game || Date.now() < game.expires_at) return null;

        deleteGame.run(platform, communityId);

        return `⏰ TIME'S UP!

💀 Nobody guessed correctly.

🔢 The secret number was ${game.secret}.

🖤 NYX: "Better luck next time, humans."`;
    }).immediate();
}

module.exports = {
    play,
    getExpiredGames,
    expireGame
};
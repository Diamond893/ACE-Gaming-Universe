'use strict';

const crypto = require('crypto');

const {
    db,
    withTransaction
} = require('../database/connection');
const { savePlayer } = require('../database/aguStore');

const inventory = require('../inventory/inventory');

const REFERRAL_WINDOW = 24 * 60 * 60 * 1000;

const REQUIRED_ACTIVE_DAYS = 3;
const REFERRER_COINS = 500;
const REFERRER_FRAGMENTS = 2;
const NEW_PLAYER_COINS = 300;

db.exec(`
    CREATE TABLE IF NOT EXISTS referrals (
        referred_id TEXT PRIMARY KEY
            REFERENCES players(game_id),

        referrer_id TEXT NOT NULL
            REFERENCES players(game_id),

        created_at INTEGER NOT NULL,

        qualified_at INTEGER,

        rewarded_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS referral_active_days (
        referred_id TEXT NOT NULL
            REFERENCES players(game_id),

        activity_day TEXT NOT NULL,

        PRIMARY KEY(referred_id, activity_day)
    );

    CREATE INDEX IF NOT EXISTS referral_referrer_idx
    ON referrals(referrer_id);
`);

function fail(message) {
    return {
        success: false,
        message
    };
}

function getPlayer(gameId) {
    const row = db.prepare(`
        SELECT payload
        FROM players
        WHERE game_id = ?
    `).get(gameId);

    return row ? JSON.parse(row.payload) : null;
}


function watDay() {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Lagos',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());

    const get = key =>
        parts.find(p => p.type === key).value;

    return `${get('year')}-${get('month')}-${get('day')}`;
}

// Derive the referral code from the permanent AGU ID.
// Linking Discord or WhatsApp never changes the code.
function referralCode(gameId) {
    return String(gameId || '').trim().toUpperCase();
}

function findReferrer(rawCode) {
    const code = String(rawCode || '')
        .trim()
        .toUpperCase();

    if (!/^AGU-[A-F0-9]{12}$/.test(code)) {
        return null;
    }

    return getPlayer(code);
}

const useCode = withTransaction((
    referredGameId,
    rawCode
) => {

    const referred = getPlayer(referredGameId);
    const referrer = findReferrer(rawCode);

    if (!referred) {
        return fail('❌ Register with NYX first.');
    }

    if (!referrer) {
        return fail('❌ Invalid referral code.');
    }

    if (referred.gameId === referrer.gameId) {
        return fail('❌ You cannot refer yourself.');
    }

    const existing = db.prepare(`
        SELECT referred_id
        FROM referrals
        WHERE referred_id = ?
    `).get(referredGameId);

    if (existing) {
        return fail(
            '❌ Your account already has a referrer.'
        );
    }

    const joined = Date.parse(referred.joined);

    if (
        !Number.isFinite(joined) ||
        joined > Date.now() ||
        Date.now() - joined > REFERRAL_WINDOW
    ) {
        return fail(
            '❌ Referral codes must be used within 24 hours of registration.'
        );
    }

    db.prepare(`
        INSERT INTO referrals (
            referred_id,
            referrer_id,
            created_at
        )
        VALUES (?, ?, ?)
    `).run(
        referredGameId,
        referrer.gameId,
        Date.now()
    );

    return {
        success: true,

        message: `🤝 NYX REFERRAL REGISTERED!

👤 Invited by: ${referrer.name}

✅ Your referral has been recorded.

🎴 Collect cards on 3 separate days
to become an active referral.

🎁 Rewards unlock after qualification.

🌌 Welcome to the NYX community!`
    };
});

// Called only after a qualifying gameplay event.
const recordActivity = withTransaction((
    gameId,
    event
) => {

    if (event !== 'card_collected') {
        return null;
    }

    const referral = db.prepare(`
        SELECT *
        FROM referrals
        WHERE referred_id = ?
    `).get(gameId);

    if (!referral || referral.rewarded_at) {
        return null;
    }

    const day = watDay();

    db.prepare(`
        INSERT OR IGNORE INTO referral_active_days (
            referred_id,
            activity_day
        )
        VALUES (?, ?)
    `).run(gameId, day);

    const progress = db.prepare(`
        SELECT COUNT(*) AS total
        FROM referral_active_days
        WHERE referred_id = ?
    `).get(gameId).total;

    if (progress < REQUIRED_ACTIVE_DAYS) {
        return {
            qualified: false,
            progress
        };
    }

    const referrer = getPlayer(referral.referrer_id);
    const referred = getPlayer(gameId);

    if (!referrer || !referred) {
        throw Error('Referral account no longer exists.');
    }

    if (
        !Number.isSafeInteger(referrer.coins) ||
        !Number.isSafeInteger(referred.coins) ||
        referrer.coins < 0 ||
        referred.coins < 0 ||
        referrer.coins > Number.MAX_SAFE_INTEGER - REFERRER_COINS ||
        referred.coins > Number.MAX_SAFE_INTEGER - NEW_PLAYER_COINS
    ) {
        throw Error('Referral reward exceeds wallet limits.');
    }

    // Claim the reward once.
    const claim = db.prepare(`
        UPDATE referrals
        SET qualified_at = ?,
            rewarded_at = ?
        WHERE referred_id = ?
          AND rewarded_at IS NULL
    `).run(
        Date.now(),
        Date.now(),
        gameId
    );

    if (claim.changes !== 1) {
        return null;
    }

    referrer.coins += REFERRER_COINS;
    referred.coins += NEW_PLAYER_COINS;

    const ledgerTransactionId = crypto.randomUUID();
    savePlayer(referrer, {
        category: 'referral',
        description: 'Referral reward for inviter',
        transactionId: ledgerTransactionId
    });
    savePlayer(referred, {
        category: 'referral',
        description: 'Referral reward for new player',
        transactionId: ledgerTransactionId
    });

    // Inventory full? Keep the reward pending.
    inventory.add(
        referrer.gameId,
        'card_fragment',
        REFERRER_FRAGMENTS,
        { pendingIfFull: true }
    );

    return {
        qualified: true,
        progress: REQUIRED_ACTIVE_DAYS,
        referrerGameId: referrer.gameId
    };
});

function stats(gameId) {

    const p = getPlayer(gameId);

    if (!p) {
        return fail('❌ Register first.');
    }

    const totals = db.prepare(`
        SELECT
            COUNT(*) AS total,
            SUM(
                CASE
                    WHEN rewarded_at IS NOT NULL
                    THEN 1 ELSE 0
                END
            ) AS qualified
        FROM referrals
        WHERE referrer_id = ?
    `).get(gameId);

    const total = totals.total || 0;
    const qualified = totals.qualified || 0;

    const code = referralCode(gameId);

    return {
        success: true,

        message: `🤝 NYX REFERRAL PROGRAM

👤 Player: ${p.name}

🆔 Your Referral Code:
${code}

👥 Total Referrals: ${total}
✅ Active Referrals: ${qualified}
⏳ Pending Qualification: ${total - qualified}

🎁 Rewards Per Active Referral:
💰 500 AGU Coins
🧩 2 Card Fragments

🌌 Unlimited invitations!

Share your code with friends.

.referral use ${code}`
    };
}

function leaderboard(viewerGameId) {

    const ownerGameId =
        String(require('../config/agu').ownerGameId || '')
            .toUpperCase();

    const rows = db.prepare(`
        SELECT
            p.game_id,
            p.payload,

            COUNT(r.referred_id) AS total,

            COALESCE(
                SUM(
                    CASE
                        WHEN r.rewarded_at IS NOT NULL
                        THEN 1 ELSE 0
                    END
                ), 0
            ) AS qualified

        FROM players p

        LEFT JOIN referrals r
            ON r.referrer_id = p.game_id

        GROUP BY p.game_id

        ORDER BY total DESC,
                 qualified DESC,
                 p.game_id ASC
    `).all();

    const ranking = rows
        .filter(row =>
            String(row.game_id).toUpperCase() !==
            ownerGameId
        )
        .filter(row => row.total > 0);

    const lines = ranking.slice(0, 20).map((row, i) => {

        const p = JSON.parse(row.payload);

        const rank =
            i === 0 ? '🥇' :
            i === 1 ? '🥈' :
            i === 2 ? '🥉' :
            `${i + 1}.`;

        return `${rank} ${p.name}
👥 Total: ${row.total}
✅ Active: ${row.qualified}`;
    });

    const position = ranking.findIndex(
        row => row.game_id === viewerGameId
    );

    const ownerViewing =
        String(viewerGameId).toUpperCase() ===
        ownerGameId;

    const personalRank = ownerViewing
        ? '👑 Owner — Excluded'
        : position < 0
            ? 'Unranked'
            : `#${position + 1}`;

    return `🤝 NYX GLOBAL REFERRAL LEADERBOARD

${lines.join('\n\n') || 'No referrals yet.'}

━━━━━━━━━━━━━━━━━━
👤 Your Rank: ${personalRank}`;
}

module.exports = {
    useCode,
    recordActivity,
    stats,
    leaderboard
};
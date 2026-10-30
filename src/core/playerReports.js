'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
    db,
    withTransaction
} = require('../database/connection');

const REPORTS_DIR = path.resolve(
    __dirname,
    '../../data/reports'
);

const DAILY_FILE = path.join(
    REPORTS_DIR,
    'daily-reports.json'
);

const PAGE_SIZE = 5;
const MAX_REASON = 500;

db.exec(`
    CREATE TABLE IF NOT EXISTS player_reports (
        report_id TEXT PRIMARY KEY,

        reporter_id TEXT NOT NULL
            REFERENCES players(game_id),

        reported_id TEXT NOT NULL
            REFERENCES players(game_id),

        reason TEXT NOT NULL,

        platform TEXT NOT NULL,
        community_id TEXT NOT NULL,

        created_at INTEGER NOT NULL,
        report_day TEXT NOT NULL,

        status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE INDEX IF NOT EXISTS report_day_idx
    ON player_reports(report_day);

    CREATE INDEX IF NOT EXISTS report_community_idx
    ON player_reports(platform, community_id, report_day);
`);

function fail(message) {
    return {
        success: false,
        message
    };
}

function todayWAT() {
    const parts = new Intl.DateTimeFormat(
        'en-GB',
        {
            timeZone: 'Africa/Lagos',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }
    ).formatToParts(new Date());

    const get = type =>
        parts.find(p => p.type === type).value;

    return `${get('year')}-${get('month')}-${get('day')}`;
}

function getPlayer(gameId) {
    const row = db.prepare(`
        SELECT payload
        FROM players
        WHERE game_id = ?
    `).get(gameId);

    return row ? JSON.parse(row.payload) : null;
}

function dailyRows() {
    return db.prepare(`
        SELECT *
        FROM player_reports
        WHERE report_day = ?
        ORDER BY created_at DESC, report_id DESC
    `).all(todayWAT());
}

// Rebuild the single daily file.
// Yesterday's snapshot is replaced, not archived.
function refreshDailyFile() {
    fs.mkdirSync(REPORTS_DIR, {
        recursive: true
    });

    const data = {
        date: todayWAT(),
        total: 0,
        reports: []
    };

    data.reports = dailyRows();
    data.total = data.reports.length;

    const temporaryFile =
        DAILY_FILE + '.' + crypto.randomUUID() + '.tmp';

    try {
        fs.writeFileSync(
            temporaryFile,
            JSON.stringify(data, null, 2),
            'utf8'
        );

        fs.renameSync(
            temporaryFile,
            DAILY_FILE
        );
    } finally {
        if (fs.existsSync(temporaryFile)) {
            fs.unlinkSync(temporaryFile);
        }
    }

    return data;
}

function refreshSafely() {
    try {
        refreshDailyFile();
    } catch (error) {
        console.error(
            '[NYX Daily Reports]',
            error.message
        );
    }
}

const submitReport = withTransaction(({
    reporterGameId,
    targetGameId,
    reason,
    platform,
    communityId
}) => {

    const reporter = getPlayer(reporterGameId);

    if (!reporter) {
        return fail('❌ Register with NYX first.');
    }

    const targetId = String(
        targetGameId || ''
    ).trim().toUpperCase();

    const target = getPlayer(targetId);

    if (!target) {
        return fail('❌ Reported player not found.');
    }

    if (reporter.gameId === target.gameId) {
        return fail('❌ You cannot report yourself.');
    }

    const reportReason = String(reason || '').trim();

    if (
        reportReason.length < 5 ||
        reportReason.length > MAX_REASON
    ) {
        return fail(
            '❌ Report reason must contain 5–500 characters.'
        );
    }

    if (
        !['whatsapp', 'discord'].includes(platform) ||
        !communityId
    ) {
        return fail(
            '❌ Reports must be submitted inside an AGU community.'
        );
    }

    // Limit duplicate reports from one reporter
    // against the same target within 24 hours.
    const duplicate = db.prepare(`
        SELECT report_id
        FROM player_reports

        WHERE reporter_id = ?
          AND reported_id = ?
          AND created_at >= ?

        LIMIT 1
    `).get(
        reporterGameId,
        targetId,
        Date.now() - 86400000
    );

    if (duplicate) {
        return fail(
            '❌ You already reported this player within the last 24 hours.'
        );
    }

    const day = todayWAT();

    const reportId =
        `RPT-${day.replace(/-/g, '')}-` +
        crypto.randomBytes(5).toString('hex').toUpperCase();

    db.prepare(`
        INSERT INTO player_reports (
            report_id,
            reporter_id,
            reported_id,
            reason,
            platform,
            community_id,
            created_at,
            report_day
        )

        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        reportId,
        reporterGameId,
        targetId,
        reportReason,
        platform,
        communityId,
        Date.now(),
        day
    );

    return {
        success: true,

        message: `🚨 NYX PLAYER REPORT

✅ Report Submitted!

📋 Report ID:
${reportId}

👤 Reported Player: ${target.name}
🆔 ${target.gameId}

📝 Reason:
${reportReason}

📅 Date: ${day}

Your report has been recorded for administrator review.`
    };
});

function submit(options) {
    const result = submitReport(options);

    if (result.success) {
        refreshSafely();
    }

    return result;
}

function list({
    platform,
    communityId,
    isAdmin = false,
    isOwner = false,
    page = 1
}) {

    if (!isAdmin && !isOwner) {
        return fail(
            '❌ Only administrators can view player reports.'
        );
    }

    if (
        !Number.isSafeInteger(page) ||
        page < 1
    ) {
        return fail('❌ Invalid report page.');
    }

    // Keep the replaceable daily file synchronized.
    refreshSafely();

    const day = todayWAT();

    const rows = isOwner
        ? db.prepare(`
            SELECT *
            FROM player_reports
            WHERE report_day = ?
            ORDER BY created_at DESC, report_id DESC
        `).all(day)

        : db.prepare(`
            SELECT *
            FROM player_reports
            WHERE report_day = ?
              AND platform = ?
              AND community_id = ?
            ORDER BY created_at DESC, report_id DESC
        `).all(
            day,
            platform,
            communityId
        );

    const totalPages = Math.max(
        1,
        Math.ceil(rows.length / PAGE_SIZE)
    );

    if (page > totalPages) {
        return fail(
            `❌ Only ${totalPages} report page(s) available.`
        );
    }

    const selected = rows.slice(
        (page - 1) * PAGE_SIZE,
        page * PAGE_SIZE
    );

    const lines = selected.map((report, index) => {

        const reporter = getPlayer(report.reporter_id);
        const target = getPlayer(report.reported_id);

        return `📋 ${(page - 1) * PAGE_SIZE + index + 1}. ${report.report_id}

👤 Reported: ${target?.name || 'Unknown'}
🆔 ${report.reported_id}

👮 Reporter: ${reporter?.name || 'Unknown'}
🆔 ${report.reporter_id}

📝 Reason:
${report.reason}

🌍 Platform: ${report.platform}
🏠 Community: ${report.community_id}

📌 Status: ${report.status}`;
    });

    return {
        success: true,

        message: `🚨 NYX DAILY PLAYER REPORTS

📅 ${day}
📊 Reports: ${rows.length}
📄 Page: ${page}/${totalPages}

━━━━━━━━━━━━━━━━━━

${lines.join('\n\n━━━━━━━━━━━━━━━━━━\n\n') || '✅ No reports today.'}

━━━━━━━━━━━━━━━━━━

Use .report list <page> to view more.`
    };
}

module.exports = {
    submit,
    list,
    refreshDailyFile
};
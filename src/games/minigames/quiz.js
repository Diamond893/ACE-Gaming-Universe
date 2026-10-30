'use strict';

const crypto = require('crypto');
const { db } = require('../../database/connection');
const settings = require('./settings');
const { selectQuestions } = require('./quizQuestions');

const TOTAL_QUESTIONS = 10;
const QUESTION_TIME = 45 * 1000;
const BREAK_TIME = 30 * 1000;
const RETRY_COOLDOWN = 5 * 1000;
const lock = require('./activityLock');

db.exec(`
    CREATE TABLE IF NOT EXISTS quiz_matches (
        platform TEXT NOT NULL,
        community_id TEXT NOT NULL,
        channel_id TEXT,
        match_id TEXT NOT NULL,
        questions TEXT NOT NULL,
        question_index INTEGER NOT NULL DEFAULT 0,
        phase TEXT NOT NULL DEFAULT 'question',
        phase_ends_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (platform, community_id)
    );

    CREATE TABLE IF NOT EXISTS quiz_pauses (platform TEXT NOT NULL, community_id TEXT NOT NULL, paused_at INTEGER NOT NULL, PRIMARY KEY(platform,community_id));
    CREATE TABLE IF NOT EXISTS quiz_participants (
        match_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (match_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS quiz_answers (
        match_id TEXT NOT NULL,
        question_index INTEGER NOT NULL,
        player_id TEXT NOT NULL,
        answer TEXT NOT NULL,
        PRIMARY KEY (match_id, question_index, player_id)
    );
`);

// Store when each player last submitted an answer.
// Migration preserves existing quiz data.
const answerColumns = db.prepare(
    'PRAGMA table_info(quiz_answers)'
).all();

if (!answerColumns.some(column => column.name === 'last_attempt_at')) {
    db.exec(`
        ALTER TABLE quiz_answers
        ADD COLUMN last_attempt_at INTEGER NOT NULL DEFAULT 0
    `);
}

const findAttempt = db.prepare(`
    SELECT last_attempt_at
    FROM quiz_answers
    WHERE match_id = ?
      AND question_index = ?
      AND player_id = ?
`);

const saveAttempt = db.prepare(`
    INSERT INTO quiz_answers (
        match_id, question_index, player_id,
        answer, last_attempt_at
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(match_id, question_index, player_id)
    DO UPDATE SET
        answer = excluded.answer,
        last_attempt_at = excluded.last_attempt_at
`);

const findMatch = db.prepare(`
    SELECT * FROM quiz_matches
    WHERE platform = ? AND community_id = ?
`);

const insertMatch = db.prepare(`
    INSERT INTO quiz_matches (
        platform, community_id, channel_id,
        match_id, questions, question_index,
        phase, phase_ends_at, created_at
    )
    VALUES (?, ?, ?, ?, ?, 0, 'pending', ?, ?)
`);

const updatePhase = db.prepare(`
    UPDATE quiz_matches
    SET phase = ?, phase_ends_at = ?, question_index = ?
    WHERE platform = ? AND community_id = ? AND match_id = ?
`);

const deleteMatch = db.prepare(`
    DELETE FROM quiz_matches
    WHERE platform = ? AND community_id = ? AND match_id = ?
`);

const insertParticipant = db.prepare(`
    INSERT INTO quiz_participants (
        match_id, player_id, player_name, score
    )
    VALUES (?, ?, ?, 0)
    ON CONFLICT(match_id, player_id)
    DO UPDATE SET player_name = excluded.player_name
`);

const insertAnswer = db.prepare(`
    INSERT OR IGNORE INTO quiz_answers (
        match_id, question_index, player_id, answer, last_attempt_at
    )
    VALUES (?, ?, ?, ?, ?)
`);

const awardPoint = db.prepare(`
    UPDATE quiz_participants
    SET score = score + 1
    WHERE match_id = ? AND player_id = ?
`);

const getParticipants = db.prepare(`
    SELECT player_id, player_name, score
    FROM quiz_participants
    WHERE match_id = ?
    ORDER BY score DESC, player_name ASC
`);

const getAnswers = db.prepare(`
    SELECT player_id, answer
    FROM quiz_answers
    WHERE match_id = ? AND question_index = ?
`);

const deleteAnswers = db.prepare(`
    DELETE FROM quiz_answers WHERE match_id = ?
`);

const deleteParticipants = db.prepare(`
    DELETE FROM quiz_participants WHERE match_id = ?
`);

function formatQuestion(match) {
    const questions = JSON.parse(match.questions);
    const q = questions[match.question_index];

    return `🧠 NYX QUIZ BATTLE

📚 Category: ${q.category}
❓ Question ${match.question_index + 1}/${TOTAL_QUESTIONS}

${q.question}

*A.* ${q.options[0]}
*B.* ${q.options[1]}
*C.* ${q.options[2]}
*D.* ${q.options[3]}

⏳ You have 45 seconds!

✍️ Answer: .quiz A / B / C / D`;
}

function formatStandings(matchId, final = false) {
    const ownerId=require('../../config/agu').ownerGameId;
    const players = getParticipants.all(matchId).filter(p=>{
        const record=db.prepare('SELECT payload FROM players WHERE id=?').get(p.player_id);
        if(!record)return true;
        try{return JSON.parse(record.payload).gameId!==ownerId;}catch{return true;}
    });

    if (!players.length) {
        return '👥 Nobody has participated yet.';
    }

    const rows = players.map((player, index) => {
        const medal = ['🥇', '🥈', '🥉'][index] || '▫️';

        return `${medal} ${player.score} — ${player.player_name}`;
    });

    let text = rows.join('\n');

    if (final) {
        const highest = players[0].score;

        const winners = players
            .filter(player => player.score === highest)
            .map(player => player.player_name);

        text += `\n\n👑 ${
            winners.length === 1
                ? `QUIZ CHAMPION: ${winners[0]}`
                : `JOINT CHAMPIONS: ${winners.join(', ')}`
        }`;
    }

    return text;
}

function start(platform, communityId, player, channelId = null) {
    if (!settings.isEnabled(platform, communityId, 'quiz')) {
        return '🔒 Quiz Battle is disabled in this community.';
    }

    return db.transaction(() => {
        if (findMatch.get(platform, communityId)) {
            return '⏳ A Quiz Battle is already running here!';
        }

        const now = Date.now();
        const matchId = crypto.randomUUID();
        const conflict = lock.otherGame(platform, communityId, 'quiz');
        if (conflict) return `⛔ ${conflict} is already active in this community. Finish it first.`;
        const questions = selectQuestions(TOTAL_QUESTIONS, platform, communityId);

        insertMatch.run(
            platform,
            communityId,
            channelId,
            matchId,
            JSON.stringify(questions),
            0,
            now
        );

        const match = findMatch.get(platform, communityId);

        return `🌌 NYX QUIZ BATTLE STARTED!

👤 Started by: ${player.name}
🎮 Questions: ${TOTAL_QUESTIONS}
⏳ Time per question: 45 seconds

👥 Everyone registered can participate.
🏆 Highest score wins!

${formatQuestion(match)}`;
    }).immediate();
}

function answer(platform, communityId, player, rawAnswer) {
    if (!settings.isEnabled(platform, communityId, 'quiz')) {
        return '🔒 Quiz Battle is disabled in this community.';
    }

    const choice = String(rawAnswer || '').trim().toUpperCase();

    if (!['A', 'B', 'C', 'D'].includes(choice)) {
        return '❌ Answer using A, B, C, or D.';
    }

    return db.transaction(() => {
        const match = findMatch.get(platform, communityId);

        if (!match) {
            return '❌ No active Quiz Battle. Use .quiz start';
        }

        if (match.phase === 'pending') return '📡 Question is not yet announced. Please wait.';
        if (db.prepare('SELECT 1 FROM quiz_pauses WHERE platform=? AND community_id=?').get(platform, communityId)) return '📡 Quiz is paused during connection recovery.';
        if (match.phase !== 'question') {
            return '⏳ Answers are closed. Wait for the next question';
        }

        const now = Date.now();

        if (now >= match.phase_ends_at) {
            return '⏰ Time is up! Wait for the results';
        }

        // Check this player's retry cooldown.
        const previous = findAttempt.get(
            match.match_id,
            match.question_index,
            player.id
        );

        if (previous) {
            const remaining =
                RETRY_COOLDOWN - (now - previous.last_attempt_at);

            if (remaining > 0) {
                return `⏳ Wait ${Math.ceil(remaining / 1000)} second(s) before trying again`;
            }
        }

        const questions = JSON.parse(match.questions);
        const question = questions[match.question_index];

        // Register everyone who attempts a question.
        insertParticipant.run(
            match.match_id,
            player.id,
            player.name
        );

        // Save this attempt and its timestamp.
        saveAttempt.run(
            match.match_id,
            match.question_index,
            player.id,
            choice,
            now
        );

        // Wrong answer: allow another attempt after cooldown.
        if (choice !== question.answer) {
            return `❌ Wrong answer, ${player.name}!

⏳ Try again`;
        }

        // Correct answer: immediately award one point.
        awardPoint.run(match.match_id, player.id);

        const correctIndex = ['A', 'B', 'C', 'D']
            .indexOf(question.answer);

        const correctText = question.options[correctIndex];

        const finalQuestion =
            match.question_index === TOTAL_QUESTIONS - 1;

        // Final question: announce champion immediately.
        if (finalQuestion) {
            const standings = formatStandings(
                match.match_id,
                true
            );

            deleteAnswers.run(match.match_id);
            deleteParticipants.run(match.match_id);

            deleteMatch.run(
                platform,
                communityId,
                match.match_id
            );

            return `🏆 NYX QUIZ BATTLE — FINAL RESULTS!

🎯 ${player.name} answered Question 10 correctly!

✅ Correct Answer: ${question.answer} — ${correctText}
⭐ ${player.name} earns +1 point!

📊 FINAL STANDINGS
${standings}

🖤 NYX: "Knowledge is power."`;
        }

        // Close the question and begin the 25 second break.
        updatePhase.run(
            'break',
            now + BREAK_TIME,
            match.question_index,
            platform,
            communityId,
            match.match_id
        );

        return `🎯 CORRECT ANSWER!

👑 ${player.name} got it right!

✅ Answer: ${question.answer} — ${correctText}
⭐ ${player.name} earns +1 point!

🏆 CURRENT STANDINGS
${formatStandings(match.match_id)}

🔥 NYX: "${player.name} is correct!\n\n⏳ Next question coming in hot!"`;

    }).immediate();
}

function status(platform, communityId) {
    const match = findMatch.get(platform, communityId);

    if (!match) {
        return '🎮 No active Quiz Battle. Use .quiz start.';
    }

    const seconds = Math.max(
        0,
        Math.ceil((match.phase_ends_at - Date.now()) / 1000)
    );

    return `🧠 QUIZ BATTLE STATUS

❓ Question: ${match.question_index + 1}/${TOTAL_QUESTIONS}
📍 Phase: ${match.phase}
⏳ Time remaining: ${seconds}s

🏆 CURRENT STANDINGS
${formatStandings(match.match_id)}`;
}

function getDueMatches(platform) {
    return db.prepare(`
        SELECT platform, community_id, channel_id, match_id
        FROM quiz_matches
        WHERE platform = ?
          AND (phase = 'pending' OR phase_ends_at <= ?)
          AND NOT EXISTS (SELECT 1 FROM quiz_pauses p WHERE p.platform=quiz_matches.platform AND p.community_id=quiz_matches.community_id)
    `).all(platform, Date.now());
}

function advance(platform, communityId) {
    return db.transaction(() => {
        const match = findMatch.get(platform, communityId);

        if (!match || (match.phase !== 'pending' && Date.now() < match.phase_ends_at)) {
            return null;
        }
        if (match.phase === 'pending') return formatQuestion(match);

        const questions = JSON.parse(match.questions);
        const question = questions[match.question_index];
        const now = Date.now();

        if (match.phase === 'question') {
    // Reaching this phase means nobody answered
    // correctly before the 40-second deadline.

    const correctIndex = ['A', 'B', 'C', 'D']
        .indexOf(question.answer);

    const correctText = question.options[correctIndex];

    const finalQuestion =
        match.question_index === TOTAL_QUESTIONS - 1;

    if (finalQuestion) {
        const standings = formatStandings(
            match.match_id,
            true
        );

        deleteAnswers.run(match.match_id);
        deleteParticipants.run(match.match_id);

        deleteMatch.run(
            platform,
            communityId,
            match.match_id
        );

        return `🏆 NYX QUIZ BATTLE — FINAL RESULTS!

⏰ Question 10 has expired!
💀 Nobody answered correctly.

✅ Correct Answer: ${question.answer} — ${correctText}

📊 FINAL STANDINGS
${standings}

🖤 NYX: "Knowledge is power."`;
    }

    updatePhase.run(
        'break',
        now + BREAK_TIME,
        match.question_index,
        platform,
        communityId,
        match.match_id
    );

    return `⏰ QUESTION ${match.question_index + 1} COMPLETE!

💀 Nobody answered correctly.

✅ Correct Answer: ${question.answer} — ${correctText}

🏆 CURRENT STANDINGS
${formatStandings(match.match_id)}

🔥 NYX: "Time's up!\n\n⏳ Next question coming in hot!"`;
}

        if (match.phase === 'break') {
            const nextIndex = match.question_index + 1;

            updatePhase.run(
                'pending',
                0,
                nextIndex,
                platform,
                communityId,
                match.match_id
            );

            const updated = findMatch.get(
                platform,
                communityId
            );

            return formatQuestion(updated);
        }

        return null;
    }).immediate();
}

function markQuestionSent(platform, communityId) {
    return db.prepare("UPDATE quiz_matches SET phase='question',phase_ends_at=? WHERE platform=? AND community_id=? AND phase='pending' AND NOT EXISTS (SELECT 1 FROM quiz_pauses WHERE platform=? AND community_id=?)")
      .run(Date.now()+QUESTION_TIME, platform, communityId, platform, communityId).changes > 0;
}
function pauseAll(platform) {
    db.prepare("INSERT OR IGNORE INTO quiz_pauses SELECT platform,community_id,? FROM quiz_matches WHERE platform=?").run(Date.now(), platform);
}
function resumeAll(platform) {
    const now=Date.now();
    db.transaction(()=>{
      for (const p of db.prepare('SELECT * FROM quiz_pauses WHERE platform=?').all(platform)) {
        const elapsed=Math.max(0,now-p.paused_at);
        // Retry interrupted questions without skipping them or erasing scores.
        db.prepare("UPDATE quiz_matches SET phase='pending',phase_ends_at=0 WHERE platform=? AND community_id=? AND phase='question'").run(platform,p.community_id);
        db.prepare("UPDATE quiz_matches SET phase_ends_at=phase_ends_at+? WHERE platform=? AND community_id=? AND phase='break'").run(elapsed,platform,p.community_id);
      }
      db.prepare('DELETE FROM quiz_pauses WHERE platform=?').run(platform);
    }).immediate();
}
module.exports = {
    start,
    answer,
    status,
    getDueMatches,
    advance, markQuestionSent, pauseAll, resumeAll
};
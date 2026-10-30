require('dotenv').config();

const path = require('path');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const {
    processCommand,
    awardSuccessfulCommandExp
} = require('./core/commandProcessor');
const { renderDeck } = require('./games/anime/deckRenderer');
const { resolvePlayer } = require('./playerResolver');
const fs = require('fs');
const communities = require('./communityRegistry');
require('./database/backup').startDailyBackups();
const broadcasts = require('./broadcastQueue');
const minigames = require('./games/minigames/settings');
const ttt = require('./games/minigames/tictactoe');
const rps = require('./games/minigames/rps');
const numberGuess = require('./games/minigames/numberGuess');
const quiz = require('./games/minigames/quiz');
const aguSpawns = require('./games/anime/spawns');
const aguAuctions = require('./auctions/auctions');
const reactionsMedia = require('./reactions');
const cardBattles = require('./games/anime/battles');
const { beginnerIntro, buildWhatsappWelcome } = require('./core/onboarding');

// Tier-6 event cards are stored as animated MP4s under data/event_media.
function eventAnimationFile(card) {
    if (!card || String(card.tier) !== '6') return null;
    const id = String(card.id || '');
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
    const file = path.resolve(__dirname, '..', 'data', 'event_media', `${id}.mp4`);
    return fs.existsSync(file) && fs.statSync(file).size > 0 ? file : null;
}

// .use of an Event Card Fragment and .cardinfo return only the original image URL.
// Locate the corresponding event ID without changing the card JSON or database.
function eventAnimationForImage(imageUrl) {
    if (!imageUrl) return null;
    try {
        const catalog = require('./games/anime/events').catalog();
        const card = catalog.find(c => c.image === imageUrl);
        return eventAnimationFile(card);
    } catch (error) {
        console.warn('Could not check local event animation:', error.message);
        return null;
    }
}
// Find converted animations for normal T6 and TS Shoob cards.
function normalCardAnimationForImage(imageUrl) {
    if (!imageUrl) return null;

    const match = String(imageUrl).match(
        /\/cardr\/([a-f0-9]{24})(?:[/?#]|$)/i
    );

    if (!match) return null;

    const cardId = match[1];

    const videoPath = path.join(
        __dirname,
        '..',
        'data',
        'card_media',
        `${cardId}.mp4`
    );

    return fs.existsSync(videoPath) ? videoPath : null;
}

const AUTH_DIR = path.join(__dirname, '..', '.agu-whatsapp-auth');
const PREFIX = '.';
const seen = new Set();
let whatsappConnected=false;
let reconnectTimer=null;
let currentSocket=null;
// Pause persisted quizzes until WhatsApp is available.
quiz.pauseAll('whatsapp');
const MAX_COMMAND_AGE_MS = 30_000;
const MAX_QUIZ_ANSWER_AGE_MS = 15_000;

function messageTimestampMs(msg) {
    const timestamp = msg.messageTimestamp;

    if (timestamp == null) return null;

    const seconds =
        typeof timestamp === 'object' &&
        typeof timestamp.toNumber === 'function'
            ? timestamp.toNumber()
            : Number(timestamp);

    if (!Number.isFinite(seconds)) return null;

    return seconds > 1e12
        ? seconds
        : seconds * 1000;
}

function isStaleCommand(msg, command, args) {
    const sentAt = messageTimestampMs(msg);

    // Missing/unusable timestamps must not authorize
    // a time-sensitive action.
    if (sentAt === null) return true;

    const age = Date.now() - sentAt;

    const limit =
        command === 'quiz' &&
        ['a', 'b', 'c', 'd'].includes(
            String(args[0] || '').toLowerCase()
        )
            ? MAX_QUIZ_ANSWER_AGE_MS
            : MAX_COMMAND_AGE_MS;

    return age > limit || age < -60_000;
}
const inactiveNoticeAt = new Map(); // Limit NYX activation reminders per group.

function normalizeAccountJid(jid) {
    return String(jid || '').trim().replace(/:\d+(?=@)/, '');
}
function isOwnerMessage(msg) {
    const owner = normalizeAccountJid(process.env.AGU_OWNER_WA_JID || (process.env.AGU_OWNER_WA ? `${String(process.env.AGU_OWNER_WA).replace(/\D/g, '')}@s.whatsapp.net` : ''));
    if (!owner || !/^\d{8,15}@s\.whatsapp\.net$/.test(owner)) return false;
    return [msg.key?.participant, msg.key?.participantAlt, msg.participant]
        .some(jid => normalizeAccountJid(jid) === owner);
}
function unwrapMessage(message) {
    let content = message;
    for (let i = 0; i < 4 && content; i++) {
        if (content.ephemeralMessage) content = content.ephemeralMessage.message;
        else if (content.viewOnceMessage) content = content.viewOnceMessage.message;
        else if (content.viewOnceMessageV2) content = content.viewOnceMessageV2.message;
        else if (content.documentWithCaptionMessage) content = content.documentWithCaptionMessage.message;
        else break;
    }
    return content;
}

function textFromMessage(message) {
    const content = unwrapMessage(message);
    return content?.conversation || content?.extendedTextMessage?.text ||
        content?.imageMessage?.caption || content?.videoMessage?.caption || '';
}

// Only trust the quoted sender when the WhatsApp message actually includes quoted content.
function targetFromMessage(message) {
    const content = unwrapMessage(message);
    const payload = content?.extendedTextMessage || content?.imageMessage || content?.videoMessage;
    const context = payload?.contextInfo || {};
    const mentioned = context.mentionedJid || [];
    const quoted = context.quotedMessage && context.participant ? context.participant : null;
    return { mentioned, quoted };
}
function gameResponseWithExp({
    sender,
    command,
    args,
    message,
    succeeded
}) {

    const response = awardSuccessfulCommandExp(
        {
            platform: 'whatsapp',
            userId: sender,
            command,
            args
        },
        {
            success: Boolean(succeeded),
            message: String(message || '')
        }
    );

    return response.message;
}

// A participant can be identified by PN or LID. Match WhatsApp's group metadata
// before resolving the AGU account, but NEVER synthesize a different person's JID.
async function resolveGroupMember(sock, groupJid, jid) {
    const normalized = normalizeAccountJid(jid);
    let account = resolvePlayer('whatsapp', normalized);
    let mentionJid = normalized;
    let resolutionId = normalized;
    if (account) return { account, mentionJid, resolutionId: normalized };
    try {
        const metadata = await sock.groupMetadata(groupJid);
        const member = (metadata.participants || []).find(p =>
            [p.id, p.lid, p.phoneNumber].filter(Boolean)
                .some(id => normalizeAccountJid(id) === normalized));
        if (member) {
            for (const possible of [member.id, member.lid, member.phoneNumber]) {
                if (!possible) continue;
                const found = resolvePlayer('whatsapp', normalizeAccountJid(possible));
                if (found) {
                    account = found;
                    resolutionId = normalizeAccountJid(possible);
                    mentionJid = normalized; // use identifier supplied by WhatsApp
                    break;
                }
            }
        }
    } catch (err) { console.warn('[NYX mention lookup]', err.message); }
    return { account, mentionJid, resolutionId };
}
function mentionLabel(jid) {
    return '@' + normalizeAccountJid(jid).split('@')[0];
}

async function start() {
    // Baileys versions with ESM exports can be loaded from CommonJS through import().
    const baileys = await import('@whiskeysockets/baileys');
    const makeWASocket = baileys.default?.default || baileys.default || baileys.makeWASocket;
    const useMultiFileAuthState = baileys.useMultiFileAuthState || baileys.default?.useMultiFileAuthState;
    const DisconnectReason = baileys.DisconnectReason || baileys.default?.DisconnectReason;

    if (typeof makeWASocket !== 'function' || !useMultiFileAuthState) {
        throw new Error('Unsupported Baileys version: cannot locate socket/auth exports.');
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        markOnlineOnConnect: false,
    });

    currentSocket=sock;
    sock.ev.on('creds.update', saveCreds);
    // Dispatch approved broadcasts only to groups that are still active.
    let processingBroadcast = false;
    async function dispatchBroadcasts() {
        if (processingBroadcast) return;
        processingBroadcast = true;
        try {
            for (const job of broadcasts.allJobs().filter(j => j.confirmed)) {
                for (const t of job.targets.filter(x => x.platform === 'whatsapp')) {
                    if (!communities.isActive('whatsapp', t.id)) continue;
                    if (!broadcasts.claim(job.id, 'whatsapp', t.id)) continue;
                    try {
                        const content = `📢 ACE GAMING UNIVERSE ANNOUNCEMENT\n\n${job.message}`;
                        if (job.tagAll) {
                            const metadata = await sock.groupMetadata(t.id);
                            const all = (metadata.participants || []).map(x => x.id).filter(Boolean);
                            // Mention all group members only on explicitly confirmed tag-all broadcasts.
                            await sock.sendMessage(t.id, {text: `${content}\n\n${all.map(x=>'@'+x.split('@')[0]).join(' ')}`,mentions:all});
                        } else await sock.sendMessage(t.id, {text:content});
                        broadcasts.complete(job.id, 'whatsapp', t.id, true);
                        await new Promise(r=>setTimeout(r,1500));
                    } catch(err) { broadcasts.complete(job.id,'whatsapp',t.id,false,err.message); console.error('WA broadcast error:',t.id,err.message); }
                }
            }
        } catch(err) { console.error('WA broadcast queue:',err.message); }
        finally { processingBroadcast = false; }
    }
    const broadcastTimer = setInterval(dispatchBroadcasts, 10000);
    if (typeof broadcastTimer.unref === 'function') broadcastTimer.unref();

// NUMBER GUESSING — AUTOMATIC EXPIRATION CHECK
let checkingGuessGames = false;

async function checkExpiredGuessGames() {
    if (checkingGuessGames) return;

    checkingGuessGames = true;

    try {
        const expired = numberGuess.getExpiredGames('whatsapp');

        for (const game of expired) {

            // Only announce in communities where AGU is active.
            if (!communities.isActive('whatsapp', game.community_id)) {
                numberGuess.expireGame('whatsapp', game.community_id);
                continue;
            }

            const announcement = numberGuess.expireGame(
                'whatsapp',
                game.community_id
            );

            if (announcement) {
                await sock.sendMessage(
                    game.community_id,
                    { text: announcement }
                );
            }
        }

    } catch (error) {
        console.error('Number Guess timeout error:', error);
    } finally {
        checkingGuessGames = false;
    }
}

const guessTimer = setInterval(checkExpiredGuessGames, 5000);

// NYX QUIZ BATTLE — AUTOMATIC TIMER
let checkingQuizMatches = false;

async function checkDueQuizMatches() {
    if (checkingQuizMatches || !whatsappConnected || sock !== currentSocket) return;

    checkingQuizMatches = true;

    try {
        const dueMatches = quiz.getDueMatches('whatsapp');

        for (const match of dueMatches) {
            try {
                // Only continue active AGU communities.
                if (!communities.isActive('whatsapp', match.community_id)) {
                    continue;
                }

                const announcement = quiz.advance(
                    'whatsapp',
                    match.community_id
                );

                if (!announcement) continue;

                await sock.sendMessage(
                    match.community_id,
                    { text: announcement }
                );
                if(whatsappConnected) quiz.markQuestionSent('whatsapp',match.community_id);

            } catch (err) {
                console.error(
                    '[WhatsApp Quiz Timer]',
                    match.community_id,
                    err
                );
            }
        }

    } catch (err) {
        console.error('[WhatsApp Quiz Timer]', err);

    } finally {
        checkingQuizMatches = false;
    }
}

const quizTimer = setInterval(checkDueQuizMatches, 1000);
// AGU auto card spawns & auction lot settlements, each community is checked independently.
let checkingAGUTimers=false;
async function checkAGUTimers(){
 if(checkingAGUTimers||!whatsappConnected||sock!==currentSocket)return;checkingAGUTimers=true;
 try{
  for(const id of aguSpawns.due('whatsapp')) aguSpawns.spawnIfDue('whatsapp',id);
  for(const spawn of aguSpawns.pendingDeliveries('whatsapp')) {
    const id=spawn.communityId;
    try {
      await sock.sendMessage(id,spawn.card.image&&/^https:\/\//.test(spawn.card.image)?{image:{url:spawn.card.image},caption:spawn.message}:{text:spawn.message});
      aguSpawns.markDelivered('whatsapp',id,spawn.code);
    } catch(err){console.error('WA card spawn delivery failed:',id,err.message);}
  }
  for(const id of aguAuctions.due('whatsapp')){
   const result=aguAuctions.finish(id);if(result)await sock.sendMessage(result.communityId,{text:result.message}).catch(console.error);
  }
 }catch(err){console.error('WA AGU timer:',err);}finally{checkingAGUTimers=false;}
}
const aguTimer=setInterval(checkAGUTimers,15000);
if(typeof aguTimer.unref==='function')aguTimer.unref();


if (typeof guessTimer.unref === 'function') {
    guessTimer.unref();
}

// Automatically expire abandoned card battles.
cardBattles.sweep();

const battleTimer = setInterval(() => {
    try {
        const expired = cardBattles.sweep();

        if (expired.pending || expired.active) {
            console.log(
                '[NYX Battle Timer]',
                expired
            );
        }
    } catch (error) {
        console.error(
            '[NYX Battle Timer]',
            error
        );
    }
}, 30_000);

battleTimer.unref?.();


    // Every currently joined group is known, but remains silent until approved.
    async function syncGroups() {
        if (typeof sock.groupFetchAllParticipating !== 'function') return;
        try {
            const groups = await sock.groupFetchAllParticipating();
            const joined = new Set(Object.keys(groups || {}));
            for (const [id, meta] of Object.entries(groups || {})) {
                communities.discover('whatsapp', id, meta.subject || id);
            }
            // A successful full fetch is authoritative: forget groups AGU left while offline.
            for (const id of Object.keys(communities.list().whatsapp)) {
                if (!joined.has(id)) communities.remove('whatsapp', id);
            }
        } catch (error) { console.error('WhatsApp community sync failed:', error.message); }
    }
    sock.ev.on('groups.upsert', groups => {
        for (const g of groups || []) {
            if (g.id?.endsWith('@g.us')) communities.discover('whatsapp', g.id, g.subject);
        }
    });
    sock.ev.on('groups.update', updates => {
        for (const g of updates || []) {
            if (g.id?.endsWith('@g.us') && communities.get('whatsapp', g.id))
                communities.discover('whatsapp', g.id, g.subject || '');
        }
    });
    // Only welcome fresh joins while connected and only where AGU is enabled.
    // Combine rapid join events into one message to avoid flooding the group.
    const pendingWelcome = new Map();
    const welcomedAt = new Map();
    const WELCOME_COOLDOWN_MS = 10 * 60 * 1000;

    function queueWelcome(event) {
        const groupJid = event?.id;
        if (!groupJid?.endsWith('@g.us') || !whatsappConnected || sock !== currentSocket ||
            !communities.isActive('whatsapp', groupJid)) return;
        const botIds = [sock.user?.id, sock.user?.lid];
        const payload = buildWhatsappWelcome(event.participants, botIds);
        if (!payload) return;

        let batch = pendingWelcome.get(groupJid);
        if (!batch) {
            batch = { participants: new Set(), timer: null };
            pendingWelcome.set(groupJid, batch);
            batch.timer = setTimeout(async () => {
                pendingWelcome.delete(groupJid);
                if (!whatsappConnected || sock !== currentSocket ||
                    !communities.isActive('whatsapp', groupJid)) return;
                const now = Date.now();
                const recent = [...batch.participants].filter(jid =>
                    now - (welcomedAt.get(`${groupJid}:${jid}`) || 0) >= WELCOME_COOLDOWN_MS);
                const welcome = buildWhatsappWelcome(recent, [sock.user?.id, sock.user?.lid]);
                if (!welcome) return;

                // Mark before sending: duplicate Baileys join events must not double-tag.
                for (const jid of welcome.mentions) welcomedAt.set(`${groupJid}:${jid}`, now);
                try {
                    await sock.sendMessage(groupJid, welcome);
                } catch (error) {
                    for (const jid of welcome.mentions) {
                        const key = `${groupJid}:${jid}`;
                        if (welcomedAt.get(key) === now) welcomedAt.delete(key);
                    }
                    console.error('[NYX onboarding welcome failed]', groupJid, error.message);
                }
                // Bounded cache so a long-running bot does not keep old join IDs forever.
                if (welcomedAt.size > 2000) {
                    for (const [key, time] of welcomedAt) {
                        if (now - time > WELCOME_COOLDOWN_MS) welcomedAt.delete(key);
                    }
                }
            }, 900);
        }
        for (const jid of payload.mentions) batch.participants.add(jid);
    }

    sock.ev.on('group-participants.update', event => {
        if (event.action === 'add') {
            queueWelcome(event);
            return;
        }
        if (event.action !== 'remove') return;
        const botIds = [sock.user?.id, sock.user?.lid].map(normalizeAccountJid).filter(Boolean);
        if (event.participants?.some(p => botIds.includes(normalizeAccountJid(typeof p === 'string' ? p : p.id)))) {
            communities.remove('whatsapp', event.id);
        }
    });

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            console.log('Scan this QR in WhatsApp Business → Linked devices:');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'open') {
            if(sock !== currentSocket) return;
            whatsappConnected=true;
            if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
            quiz.resumeAll('whatsapp');
            console.log('✅ AGU connected to WhatsApp'); syncGroups(); dispatchBroadcasts();
        }
        if (connection === 'close') {
            if(sock !== currentSocket) return;
            whatsappConnected=false;
            quiz.pauseAll('whatsapp');
            clearInterval(broadcastTimer);
            clearInterval(guessTimer);
            clearInterval(quizTimer);
            clearInterval(aguTimer);
            clearInterval(battleTimer);
            for (const batch of pendingWelcome.values()) clearTimeout(batch.timer);
            pendingWelcome.clear();
            const status = lastDisconnect?.error?.output?.statusCode;
            console.error('[NYX WhatsApp Disconnect]', {
                statusCode: status,
                errorMessage: lastDisconnect?.error?.message,
                errorName: lastDisconnect?.error?.name
    });
            const loggedOut = status === DisconnectReason?.loggedOut;
            console.log(loggedOut ? 'WhatsApp logged out. Re-link the device' : 'WhatsApp disconnected. Reconnecting...');
            if (!loggedOut && !reconnectTimer) reconnectTimer=setTimeout(()=>{
                reconnectTimer=null;
                start().catch(e=>{console.error('[NYX Reconnect]',e.message);
                    if(!reconnectTimer) reconnectTimer=setTimeout(()=>{reconnectTimer=null;start().catch(console.error);},5000);
                });
            },3000);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify' || !whatsappConnected || sock !== currentSocket) return;
        for (const msg of messages || []) {
            try {
                const groupJid = msg.key?.remoteJid;
                if (!groupJid?.endsWith('@g.us') || msg.key.fromMe) continue;
                if (!communities.get('whatsapp', groupJid)) communities.discover('whatsapp', groupJid);
                const text = textFromMessage(msg.message).trim();
                if (!text.startsWith(PREFIX)) continue;
                const uniqueId = `${groupJid}:${msg.key.id}`;
                if (seen.has(uniqueId)) continue;
                seen.add(uniqueId);
                if (seen.size > 1500) seen.delete(seen.values().next().value);

                const tokens = text.slice(PREFIX.length).trim().split(/\s+/);
                const command = tokens.shift().toLowerCase();
                if (isStaleCommand(msg, command, tokens)) {
    console.log(
        '[NYX] Ignored stale command:',
        command,
        msg.key?.id
    );

    continue;
}
                const sender = msg.key.participant || msg.participant;
                if (!sender) continue;
                const senderResolution = await resolveGroupMember(sock, groupJid, sender);
                const senderAccountId = senderResolution.account ? senderResolution.resolutionId : sender;
                // Owner commands are the only commands allowed in inactive groups.
                if (['activate', 'deactivate', 'status'].includes(command)) {
                    if (!isOwnerMessage(msg)) continue;
                    if (command !== 'status') communities.setActive('whatsapp', groupJid, command === 'activate');
                    const active = communities.isActive('whatsapp', groupJid);
                    const result = command === 'status'
                        ? `🌌 AGU STATUS\nGroup ID: ${groupJid}\nStatus: ${active ? '🟢 ACTIVE' : '🔴 INACTIVE'}`
                        : command === 'activate'
                          ? '🌌 ACE GAMING UNIVERSE ACTIVATED!\n🎮 Commands are now available.\n📢 Official AGU announcements will be sent here.\nType .help to begin'
                          : '💤 ACE GAMING UNIVERSE DEACTIVATED.\nAGU will now remain silent';
                    await sock.sendMessage(groupJid, { text: result }, { quoted: msg });
                    continue;
                }
                if (!communities.isActive('whatsapp', groupJid)) {
                    const now = Date.now();
                    if (now - (inactiveNoticeAt.get(groupJid) || 0) >= 3600000) { // 1 hour cooldown for repeated reminders
                        inactiveNoticeAt.set(groupJid, now);
                        const ownerJid = normalizeAccountJid(process.env.AGU_OWNER_WA_JID || (process.env.AGU_OWNER_WA ? `${String(process.env.AGU_OWNER_WA).replace(/\D/g, '')}@s.whatsapp.net` : ''));
                        const validOwner = /^\d{8,15}@s\.whatsapp\.net$/.test(ownerJid);
                        const ownerTag = validOwner ? `@${ownerJid.split('@')[0]}` : 'my owner';
                        await sock.sendMessage(groupJid, {
                            text: `🖤 Ahh! Nice try, but I'm not activated here yet. 🌌\n👑 Ask ${ownerTag} to activate 𝓝𝓨𝓧 in this group.`,
                            ...(validOwner ? { mentions: [ownerJid] } : {})
                        }, { quoted: msg });
                    }
                    continue;
                }

                // Introduce NYX to unregistered users before individual game handlers
                // can return terse registration errors. Keep public/owner/admin paths untouched.
                const onboardingExempt = new Set([
                    'help', 'ping', 'owner', 'register', 'link', 'verify',
                    'guide', // retired command should still report as unknown
                    'eventpreview', 'cardspawn',
                    'remove', 'kick', 'promote', 'demote', 'lock', 'unlock'
                ]);
                if (!senderResolution.account && !onboardingExempt.has(command)) {
                    await sock.sendMessage(groupJid, { text: beginnerIntro('whatsapp') }, { quoted: msg });
                    continue;
                }

                // 👑 OWNER-ONLY EVENT CARD PREVIEW
if (command === 'eventpreview') {

    if (!isOwnerMessage(msg)) {
        await sock.sendMessage(groupJid, {
            text: '❌ Only ACE can preview Event Cards'
        }, { quoted: msg });
        continue;
    }

    const events = require('./games/anime/events');
    const catalog = events.catalog();

    const requestedId = String(tokens[0] || '').trim();

    const card = requestedId
        ? catalog.find(c =>
            String(c.id).toLowerCase() === requestedId.toLowerCase()
        )
        : catalog[Math.floor(Math.random() * catalog.length)];

    if (!card) {
        await sock.sendMessage(groupJid, {
            text: '❌ Event Card not found. Check data/eventCards.json'
        }, { quoted: msg });
        continue;
    }

    const caption = `🧪 EVENT CARD PREVIEW — TEST ONLY

🌌✨ NYX: CONGRATULATIONS COLLECTOR! ✨

👑 A ONE-OF-ONE EVENT CARD HAS BEEN UNLOCKED!

🔥 HISTORY HAS JUST BEEN WRITTEN IN AGU!

━━━━━━━━━━━━━━━━━━
🎴 ${card.name}
📺 ${card.series || 'Unknown'}
💎 Tier ${card.tier} EXCLUSIVE EVENT
🌍 AGU Edition: 1/1
━━━━━━━━━━━━━━━━━━

✨ This design can never be issued again.

🌌 NYX: A LEGEND HAS BEEN BORN!

🧪 PREVIEW ONLY — No card has been issued.`;

    try {
        const videoFile = eventAnimationFile(card);
        if (videoFile) {
            await sock.sendMessage(groupJid, {
                video: { url: videoFile },
                gifPlayback: true,
                mimetype: 'video/mp4',
                caption
            }, { quoted: msg });
        } else if (card.image && /^https:\/\//i.test(card.image)) {
            await sock.sendMessage(groupJid, {
                image: { url: card.image },
                caption
            }, { quoted: msg });
        } else {
            await sock.sendMessage(groupJid, {
                text: caption
            }, { quoted: msg });
        }
    } catch (error) {
        console.error('Event preview image failed:', error);

        await sock.sendMessage(groupJid, {
            text: caption
        }, { quoted: msg });
    }

    continue;
}

                if (command === 'ttt' || command === 'tictactoe') {
                    const action = (tokens[0] || 'help').toLowerCase();
                    let target = null;
                    if (action === 'challenge') {
                        const { mentioned, quoted } = targetFromMessage(msg.message);
                        target = mentioned[0] || quoted || null;
                        if (target && !resolvePlayer('whatsapp', target)) {
                            await sock.sendMessage(groupJid, {text:'❌ That player must register with NYX first'},{quoted:msg});
                            continue;
                        }
                    }
                    if (!resolvePlayer('whatsapp', sender)) {
                        await sock.sendMessage(groupJid,{text:'❌ Register first using .register <name>'},{quoted:msg});
                        continue;
                    }
                    const response = ttt.reply(
    'whatsapp',
    groupJid,
    sender,
    action,
    tokens[1],
    target
);
const successfulTttAction =
    (
        action === 'challenge' &&
        response.includes('Challenge sent!')
    ) ||
    (
        action === 'accept' &&
        response.includes('Challenge accepted!')
    ) ||
    (
        action === 'move' &&
        response.startsWith('🎮 TIC-TAC-TOE\n')
    );

const tttResponseWithExp = gameResponseWithExp({
    sender,
    command: 'tictactoe',
    args: tokens,
    message: response,
    succeeded: successfulTttAction
});

// Extract real WhatsApp identifiers without inventing phone numbers.
const mentions = [];

const formattedResponse = tttResponseWithExp.replace(
    /@(\d{8,22}@(s\.whatsapp\.net|lid))/g,
    (fullMatch, jid) => {
        const normalizedJid = normalizeAccountJid(jid);

        mentions.push(normalizedJid);

        return '@' + normalizedJid.split('@')[0];
    }
);

// Send using the actual JIDs from the game response.
await sock.sendMessage(
    groupJid,
    {
        text: formattedResponse,
        ...(mentions.length > 0
            ? { mentions: [...new Set(mentions)] }
            : {})
    },
    { quoted: msg }
);
                    continue;
                }

// NYX QUIZ BATTLE
if (command === 'quiz') {
    const player = resolvePlayer('whatsapp', sender);

    if (!player) {
        await sock.sendMessage(
            groupJid,
            { text: '❌ Register first using .register <name>' },
            { quoted: msg }
        );
        continue;
    }

    const action = String(tokens[0] || '').trim().toLowerCase();

    let response;

    if (action === 'start') {
        response = quiz.start(
            'whatsapp',
            groupJid,
            player
        );
    } else if (action === 'status') {
        response = quiz.status(
            'whatsapp',
            groupJid
        );
    } else {
        response = quiz.answer(
            'whatsapp',
            groupJid,
            player,
            action
        );
    }

    const validChoice = ['a', 'b', 'c', 'd']
    .includes(action);

const acceptedAttempt =
    validChoice &&
    (
        response.startsWith('❌ Wrong answer,') ||
        response.startsWith('🎯 CORRECT ANSWER!') ||
        response.startsWith(
            '🏆 NYX QUIZ BATTLE — FINAL RESULTS!'
        )
    );

const quizResponseWithExp = gameResponseWithExp({
    sender,
    command: 'quiz',
    args: tokens,
    message: response,
    succeeded: acceptedAttempt
});

await sock.sendMessage(
    groupJid,
    {
        text: quizResponseWithExp
    },
    { quoted: msg }
);
    if(action==='start' && whatsappConnected && response.includes('NYX QUIZ BATTLE STARTED')) quiz.markQuestionSent('whatsapp',groupJid);

    continue;
}

// NUMBER GUESSING
if (command === 'guess') {

    const player = resolvePlayer('whatsapp', sender);

    if (!player) {
        await sock.sendMessage(
            groupJid,
            { text: '❌ Register first using .register <name>' },
            { quoted: msg }
        );
        continue;
    }

    const response = numberGuess.play(
        'whatsapp',
        groupJid,
        tokens[0],
        player.name
    );
    const validGuess =
    /^[1-9]\d*$/.test(String(tokens[0] || '')) &&
    Number(tokens[0]) >= 1 &&
    Number(tokens[0]) <= 100;

const guessSucceeded =
    validGuess &&
    (
        response.startsWith('🏆 CORRECT ANSWER!') ||
        response.startsWith('⬆️') ||
        response.startsWith('⬇️')
    );

const responseWithExp = gameResponseWithExp({
    sender,
    command: 'guess',
    args: tokens,
    message: response,
    succeeded: guessSucceeded
});

    await sock.sendMessage(
    groupJid,
    {
        text: responseWithExp
    },
    { quoted: msg }
);

    continue;
}                

// ROCK PAPER SCISSORS
if (command === 'rps') {

    if (!resolvePlayer('whatsapp', sender)) {
        await sock.sendMessage(
            groupJid,
            { text: '❌ Register first using .register <name>.' },
            { quoted: msg }
        );
        continue;
    }

    const response = rps.play(
        'whatsapp',
        groupJid,
        tokens[0]
    );
    const responseWithExp = gameResponseWithExp({
    sender,
    command: 'rps',
    args: tokens,
    message: response,

    // A completed round has this game heading.
    succeeded: response.includes(
        'ROCK PAPER SCISSORS ❱'
    )
});

    await sock.sendMessage(
        groupJid,
        { text: responseWithExp },
        { quoted: msg }
    );

    continue;
}

                if (command === 'minigames') {
                    const action = (tokens[0] || 'status').toLowerCase();
                    let admin = false;
                    if (action !== 'status') {
                        const meta = await sock.groupMetadata(groupJid);
                        const senderIds = [msg.key.participant, msg.key.participantAlt, msg.participant]
                            .filter(Boolean).map(normalizeAccountJid);
                        admin = (meta.participants || []).some(p =>
                            [p.id, p.lid].filter(Boolean).map(normalizeAccountJid)
                                .some(id => senderIds.includes(id)) &&
                            (p.admin === 'admin' || p.admin === 'superadmin'));
                    }
                    const reply = minigames.handle('whatsapp',groupJid,tokens,admin);
                    await sock.sendMessage(groupJid,{text:reply},{quoted:msg});
                    continue;
                }

                if (command === 'owner') {
                    const ownerJid = normalizeAccountJid(process.env.AGU_OWNER_WA_JID || (process.env.AGU_OWNER_WA ? `${String(process.env.AGU_OWNER_WA).replace(/\D/g, '')}@s.whatsapp.net` : ''));
                    const digits = ownerJid.split('@')[0];
                    if (!/^\d{8,15}@s\.whatsapp\.net$/.test(ownerJid)) {
                        await sock.sendMessage(groupJid, { text: '👑 ACE GAMING UNIVERSE\n🛡️ Owner: ᴀᴄᴇ †' }, { quoted: msg });
                    } else {
                        await sock.sendMessage(groupJid, {
                            text: `👑 ACE GAMING UNIVERSE\n🛡️ Owner: @${digits}`,
                            mentions: [ownerJid]
                        }, { quoted: msg });
                    }
                    continue;
                }

                if (['remove', 'kick', 'promote', 'demote', 'lock', 'unlock'].includes(command)) {
                    const metadata = await sock.groupMetadata(groupJid);
                    const participants = metadata.participants || [];
                    const senderJid = msg.key.participant || msg.participant;
                    const normalizeJid = jid =>
                       String(jid || "")
                         .replace(/:\d+(?=@)/, "");

                    const senderIds = [
                          senderJid,
                          msg.key.participantAlt
                        ].filter(Boolean).map(normalizeJid);

                    const botIds = [
                          sock.user?.id,
                          sock.user?.lid
                        ].filter(Boolean).map(normalizeJid);

                    const matches = (participant, ids) =>
                        [participant.id, participant.lid]
                          .filter(Boolean)
                          .map(normalizeJid)
                          .some(id => ids.includes(id));

                    const senderEntry = participants.find(p =>
                          matches(p, senderIds)
                        );

                    const botEntry = participants.find(p =>
                          matches(p, botIds)
                        );

                    const botJid = normalizeJid(sock.user?.id);
                    const isAdmin = p => !!p && (p.admin === 'admin' || p.admin === 'superadmin');
                    if (!isAdmin(senderEntry) || !isAdmin(botEntry)) {
                        await sock.sendMessage(groupJid, { text: '❌ Both you and AGU must be group admins.' }, { quoted: msg });
                        continue;
                    }
                    if (command === 'lock' || command === 'unlock') {
                        await sock.groupSettingUpdate(groupJid, command === 'lock' ? 'announcement' : 'not_announcement');
                        await sock.sendMessage(groupJid, { text: command === 'lock' ? '🔒 Group locked: admins only.' : '🔓 Group unlocked.' }, { quoted: msg });
                        continue;
                    }
                    const content = unwrapMessage(msg.message);
                    const { mentioned, quoted } = targetFromMessage(msg.message);
                    const mentions = mentioned.length ? mentioned : (quoted ? [quoted] : []);
                    if (mentions.length !== 1) {
                        await sock.sendMessage(groupJid, { text: `❌ Usage: .${command} @player` }, { quoted: msg });
                        continue;
                    }
                    const target = mentions[0];
                    const targetEntry = participants.find(p => matches(p, [normalizeJid(target)]));
                    if (!targetEntry || targetEntry.id === botJid || targetEntry.id === senderJid || targetEntry.admin === 'superadmin') {
                        await sock.sendMessage(groupJid, { text: '❌ Invalid or protected target.' }, { quoted: msg });
                        continue;
                    }
                    await sock.groupParticipantsUpdate(groupJid, [targetEntry.id], command === 'kick' ? 'remove' : command);
                    await sock.sendMessage(groupJid, { text: `✅ Group action: ${command} completed.` }, { quoted: msg });
                    continue;
                }

// NYX CARD GIFTING
// Supports .givecard/.gcard and .givecoll/.gcoll
if ([
    'givecard',
    'gcard',
    'givecoll',
    'gcoll'
].includes(command)) {

    const { mentioned, quoted } = targetFromMessage(msg.message);

    if (mentioned.length > 1) {
        await sock.sendMessage(
            groupJid,
            { text: '❌ Mention only one recipient.' },
            { quoted: msg }
        );
        continue;
    }

    // Explicit mention takes priority over quoted sender.
    const targetJid = mentioned[0] || quoted;

    if (!targetJid) {
        await sock.sendMessage(
            groupJid,
            {
                text: `❌ Specify who should receive the cards.

Examples:
.gcard 1 2 3 @player
.gcoll 1 2 3 @player

You can also reply to someone's message.`
            },
            { quoted: msg }
        );

        continue;
    }

    const recipient = resolvePlayer(
        'whatsapp',
        targetJid
    );

    if (!recipient) {
        await sock.sendMessage(
            groupJid,
            {
                text: '❌ Recipient must be registered with NYX.'
            },
            { quoted: msg }
        );

        continue;
    }

    // Remove mention tokens.
    // The actual recipient comes from WhatsApp metadata.
    const slotArgs = tokens.filter(
        token => !token.startsWith('@')
    );

    if (
        slotArgs.length < 1 ||
        slotArgs.length > 9 ||
        slotArgs.some(slot => !/^[1-9]\d*$/.test(slot))
    ) {
        await sock.sendMessage(
            groupJid,
            {
                text: `❌ Invalid card selection.

Maximum: 9 cards.

Examples:
.gcard 1 2 3 @player
.gcoll 1 2 3 @player`
            },
            { quoted: msg }
        );

        continue;
    }

    // Pass the verified permanent AGU ID
    // to the shared command processor.
    tokens.splice(
        0,
        tokens.length,
        ...slotArgs,
        recipient.gameId
    );
}

// NYX PLAYER REPORT TARGET RESOLUTION
// Supports tagging, replying, and permanent AGU IDs.
if (command === 'report') {

    const action = String(tokens[0] || '').toLowerCase();

    // Leave .report list and .report list 2 untouched.
    if (action !== 'list') {

        const { mentioned, quoted } = targetFromMessage(msg.message);

        if (mentioned.length > 1) {
            await sock.sendMessage(
                groupJid,
                { text: '❌ Mention only one player when submitting a report.' },
                { quoted: msg }
            );
            continue;
        }

        // Explicit mention takes priority over a quoted message.
        const targetJid = mentioned[0] || quoted;

        if (targetJid) {

            const target = resolvePlayer(
                'whatsapp',
                targetJid
            );

            if (!target?.gameId) {
                await sock.sendMessage(
                    groupJid,
                    {
                        text: '❌ The tagged player must have a registered AGU account.'
                    },
                    { quoted: msg }
                );
                continue;
            }

            // The actual target comes from trusted WhatsApp metadata.
            // Remove only the visible mention token.
            const reasonTokens = tokens.filter(
                token => !token.startsWith('@')
            );

            if (!reasonTokens.length) {
                await sock.sendMessage(
                    groupJid,
                    {
                        text: '❌ Provide a reason.\nExample: .report @player Scamming during trades'
                    },
                    { quoted: msg }
                );
                continue;
            }

            tokens.splice(
                0,
                tokens.length,
                target.gameId,
                ...reasonTokens
            );
        }
    }
}

// NYX TRADE RECIPIENT RESOLUTION
// Only offer creation requires a mention/reply.
// Acceptance, decline and cancellation use trade IDs.

if (command === 'trade') {

    const action = String(tokens[0] || '').toLowerCase();

    const isTradeAction = [
        'accept',
        'decline',
        'cancel'
    ].includes(action);

    if (!isTradeAction) {

        const { mentioned, quoted } =
            targetFromMessage(msg.message);

        if (mentioned.length > 1) {
            await sock.sendMessage(
                groupJid,
                {
                    text: '❌ Mention only one trade recipient.'
                },
                { quoted: msg }
            );
            continue;
        }

        const targetJid = mentioned[0] || quoted;

        if (!targetJid) {
            await sock.sendMessage(
                groupJid,
                {
                    text: `❌ Tag the player you want to trade with.

🎴 .trade 2 5 @player
💰 .trade 2 2000 @player`
                },
                { quoted: msg }
            );
            continue;
        }

        const recipient = resolvePlayer(
            'whatsapp',
            targetJid
        );

        if (!recipient?.gameId) {
            await sock.sendMessage(
                groupJid,
                {
                    text: '❌ The tagged player must register with NYX first.'
                },
                { quoted: msg }
            );
            continue;
        }

        // The first two arguments must be numbers.
        const numericArgs = tokens.filter(
            token => !token.startsWith('@')
        );

        if (
            numericArgs.length !== 2 ||
            numericArgs.some(
                value => !/^[1-9]\d*$/.test(value)
            )
        ) {
            await sock.sendMessage(
                groupJid,
                {
                    text: '❌ Usage: .trade <your deck slot> <their deck slot OR coin price> @player'
                },
                { quoted: msg }
            );
            continue;
        }

        // Pass the verified permanent AGU account ID.
        tokens.splice(
            0,
            tokens.length,
            numericArgs[0],
            numericArgs[1],
            recipient.gameId
        );
    }
}

                // For target commands, an explicit mention beats the quoted sender.
                // A reply must contain an actual quoted message, not a fabricated number.
                const reactions = new Set(Object.keys(reactionsMedia.CATEGORIES));
                let reactionTargetJid = null;
                if (['givecoin', 'rob'].includes(command) || reactions.has(command)) {
                    const { mentioned, quoted } = targetFromMessage(msg.message);
                    if (mentioned.length > 1) {
                        await sock.sendMessage(groupJid, { text: '❌ Mention only one player.' }, { quoted: msg });
                        continue;
                    }
                    const targetJid = mentioned[0] || quoted;
                    if (targetJid) {
                        const {account: recipient, mentionJid} = await resolveGroupMember(sock, groupJid, targetJid);
                        if (!recipient) {
                            await sock.sendMessage(groupJid, { text: '❌ Target must be a registered AGU player.' }, { quoted: msg });
                            continue;
                        }
                        if (command === 'givecoin') {
                            // .givecoin @player 100 or reply: .givecoin 100
                            const amount = tokens.filter(t => !t.startsWith('@'));
                            if (amount.length !== 1) {
                                await sock.sendMessage(groupJid, { text: '❌ Usage: reply with .givecoin 100 or .givecoin @player 100' }, { quoted: msg });
                                continue;
                            }
                            tokens.splice(0, tokens.length, recipient.gameId, amount[0]);
                        } else {
                            reactionTargetJid = reactions.has(command) ? mentionJid : null;
                            tokens.splice(0, tokens.length, recipient.gameId);
                        }
                    }
                }

                // Community admin permissions are checked on platform, never trusted from user text.
                let gameAdmin=false;
                if (
    command === 'cards' ||
    command === 'auction' ||
    (
        command === 'report' &&
        String(tokens[0] || '').toLowerCase() === 'list'
    )
) {
                    const meta=await sock.groupMetadata(groupJid);
                    const senderIds=[msg.key.participant,msg.key.participantAlt,msg.participant].filter(Boolean).map(normalizeAccountJid);
                    gameAdmin=(meta.participants||[]).some(p=>(p.admin==='admin'||p.admin==='superadmin')&&[p.id,p.lid].filter(Boolean).map(normalizeAccountJid).some(x=>senderIds.includes(x)));
                }
                let targetGameId=null;
                if(command==='profile') {
                    const t=targetFromMessage(msg.message);
                    if(t.mentioned.length>1){await sock.sendMessage(groupJid,{text:'❌ Mention only one player.'},{quoted:msg});continue;}
                    const jid=t.mentioned[0]||t.quoted;
                    if(jid){
                        const {account:target}=await resolveGroupMember(sock,groupJid,jid);
                        if(!target){await sock.sendMessage(groupJid,{text:'❌ That player is not registered.'},{quoted:msg});continue;}
                        targetGameId=target.gameId;
                    }
                }
                if(command==='cardbattle' && !['accept','decline','forfeit','surrender'].includes(String(tokens[0]||'').toLowerCase())){
                    const t=targetFromMessage(msg.message);
                    const jid=t.mentioned[0]||t.quoted;
                    targetGameId=jid?resolvePlayer('whatsapp',jid)?.gameId:null;
                }
                const result = processCommand({
                    platform: 'whatsapp',
                    userId: senderAccountId,
                    command,
                    args: tokens,
                    communityId: groupJid,
                    isAdmin: gameAdmin,
                    isOwner: isOwnerMessage(msg),
                    targetGameId
                });

                // NYX VISUAL DECK
// Render only full-deck requests.
if (result?.success && result.deckView) {
    try {
        const rendered = await renderDeck(result.deckView);

        await sock.sendMessage(
            groupJid,
            {
                image: rendered.buffer,
                caption: result.message
            },
            { quoted: msg }
        );

    } catch (error) {
        console.error(
            '[NYX Visual Deck]',
            error
        );

        // Rendering failures must never prevent players from viewing their deck.
        await sock.sendMessage(
            groupJid,
            {
                text: result.message
            },
            { quoted: msg }
        );
    }

    continue;
}

                // CINEMATIC NYX BATTLES: only completed battles carry this payload.
                // DB result and rewards are already committed by battles.select().
                // Do NOT call processCommand again to retry a failed message.
                if (result?.success && Array.isArray(result.battleNarration) && result.battleNarration.length === 6) {
                    for (let stage = 0; stage < result.battleNarration.length; stage++) {
                        if (stage > 0) await new Promise(resolve => setTimeout(resolve, 2500));
                        try {
                            await sock.sendMessage(groupJid,
                                { text: result.battleNarration[stage] },
                                stage === 0 ? { quoted: msg } : undefined
                            );
                        } catch (err) {
                            console.error(`[NYX cinematic battle ${result.battleId || ''}] message ${stage+1}/6 failed:`, err);
                            // No duplicate rewards, and no claiming missing sends as delivered.
                            break;
                        }
                    }
                    continue;
                }

                if (result?.message) {
                    const mentionOptions =
    result.success && result.tagAll
        ? { mentionAll: true }
        : {};

if (
    result.success &&
    Array.isArray(result.mentions)
) {
    const playerMentions = result.mentions
        .filter(m => typeof m === 'string' || m?.platform === 'whatsapp')
        .map(m => {
            const raw = normalizeAccountJid(typeof m === 'string' ? m : m.id);
            if (/^\d{5,25}@(s\.whatsapp\.net|lid)$/.test(raw)) {
                return raw;
            }
            if (/^\d{8,15}$/.test(raw)) {
                return `${raw}@s.whatsapp.net`;
            }
            return null;
        })
        .filter(Boolean);

    if (playerMentions.length) {
        mentionOptions.mentions = [...new Set(playerMentions)];
    }
}

                    if (result.success && result.reactionType) {
                        const senderMention = normalizeAccountJid(sender);
                        if (!reactionTargetJid) {
                            await sock.sendMessage(groupJid, { text: '❌ Mention a player or reply to their message.' }, { quoted: msg });
                            continue;
                        }
                        const reactionMentions = [...new Set([senderMention, reactionTargetJid])];
                        // Place real JIDs in the visible text and metadata. Plain names cannot tag.
                        const emoji = String(result.message).split(' ')[0];
                        // Reconstruct from verb mapping in the command processor to avoid escaping names.
                        const verbs = {hug:'hugged',kiss:'kissed',cuddle:'cuddled',handhold:'held hands with',blowkiss:'blew a kiss to',pat:'patted',poke:'poked',wave:'waved at',highfive:'high-fived',tickle:'tickled',wink:'winked at',laugh:'laughed with',slap:'slapped',bonk:'bonked',punch:'punched',kick:'kicked',bite:'bit',yeet:'yeeted',baka:'called baka',angry:'got angry with'};
                        const caption = `${emoji} ${mentionLabel(senderMention)} ${verbs[result.reactionType] || 'reacted to'} ${mentionLabel(reactionTargetJid)}!`;
                        try {
                            const video = await reactionsMedia.whatsappReaction(result.reactionType);
                            await sock.sendMessage(groupJid, {
                                video, gifPlayback: true, mimetype: 'video/mp4',
                                caption, mentions: reactionMentions
                            }, { quoted: msg });
                        } catch (err) {
                            console.warn('[NYX reaction API/media]', result.reactionType, err.message);
                            await sock.sendMessage(groupJid, { text: caption, mentions: reactionMentions }, { quoted: msg });
                        }
                    } else if (result.image && /^https:\/\//i.test(result.image)) {
                        const videoFile =
                             eventAnimationForImage(result.image) ||
                             normalCardAnimationForImage(result.image);
                        try {
                            if (videoFile) {
                                await sock.sendMessage(groupJid, {
                                    video: { url: videoFile },
                                    gifPlayback: true,
                                    mimetype: 'video/mp4',
                                    caption: result.message,
                                    ...mentionOptions
                                }, { quoted: msg });
                            } else {
                                await sock.sendMessage(groupJid, {
                                    image: { url: result.image },
                                    caption: result.message,
                                    ...mentionOptions
                                }, { quoted: msg });
                            }
                        } catch (error) {
                            console.error('Event/card media failed:', error);
                            await sock.sendMessage(groupJid, {
                                text: result.message + '\n' + result.image,
                                ...mentionOptions
                            }, { quoted: msg });
                        }
                    } else {
                        await sock.sendMessage(groupJid, { text: result.message, ...mentionOptions }, { quoted: msg });
                    }
                }
            } catch (error) {
                console.error('WhatsApp command error:', error);
            }
        }
    });
}

start().catch(error => {
    console.error('Could not start AGU WhatsApp:', error);
    process.exitCode = 1;
});

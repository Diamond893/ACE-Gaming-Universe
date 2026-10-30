'use strict';

// One onboarding source for both WhatsApp and Discord. No player/database side effects.
function beginnerIntro(platform = 'whatsapp') {
    const prefix = platform === 'discord' ? '/' : '.';

    return `🌌 WELCOME TO ACE GAMING UNIVERSE!
🌙 I'm NYX, your gaming companion.

🎮 NEW PLAYER? START HERE:
1️⃣ ${prefix}register YourName — create your AGU account.
2️⃣ ${prefix}help — see the games and commands.
3️⃣ ${prefix}daily — claim your daily reward.
4️⃣ ${prefix}wallet — check your AGU Coins.

🎴 Collect anime cards, build a deck, and challenge other players in card battles.
🏆 Earn achievements and climb the leaderboards.

🔗 Already have an AGU account on another platform? Use ${prefix}link <AGU-ID> instead of registering again.

🌌 NYX — The Universe Never Sleeps.`;
}

function normalizedWhatsappJid(value) {
    return String(value || '').trim().replace(/:\d+(?=@)/, '');
}

// Build proper Baileys mentions from actual group participant identifiers.
// Never turn a game ID, display name, or guessed phone number into a WhatsApp JID.
function buildWhatsappWelcome(participants, excluded = []) {
    const ignore = new Set(excluded.map(normalizedWhatsappJid));
    const mentions = [...new Set((participants || [])
        .map(participant => typeof participant === 'string'
            ? participant
            : (participant?.id || participant?.jid || participant?.lid || participant?.phoneNumber))
        .map(normalizedWhatsappJid)
        .filter(jid => /^\d{5,25}@(s\.whatsapp\.net|lid)$/.test(jid) && !ignore.has(jid)))];

    if (!mentions.length) return null;

    const tags = mentions.map(jid => `@${jid.split('@')[0]}`).join(' ');
    return {
        text: `🌙 NEW MEMBER${mentions.length > 1 ? 'S' : ''} IN AGU!\n${tags}\n\n${beginnerIntro('whatsapp')}`,
        mentions
    };
}

module.exports = { beginnerIntro, normalizedWhatsappJid, buildWhatsappWelcome };

require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Events,
    PermissionsBitField,
    MessageFlags
} = require("discord.js");

const {
    processCommand
} = require("./core/commandProcessor");

const { resolvePlayer } = require("./playerResolver");
const { beginnerIntro } = require('./core/onboarding');
const fs = require('fs');
const path = require('path');
const communities = require('./communityRegistry');
require('./database/backup').startDailyBackups();
const broadcasts = require('./broadcastQueue');
const minigames = require('./games/minigames/settings');
const ttt = require('./games/minigames/tictactoe');
const rps = require('./games/minigames/rps');
const numberGuess = require('./games/minigames/numberGuess');
const quiz = require('./games/minigames/quiz');
quiz.pauseAll('discord');
const aguSpawns = require('./games/anime/spawns');
const aguAuctions = require('./auctions/auctions');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
    partials: [require('discord.js').Partials.Channel]
});

client.once(Events.ClientReady, (readyClient) => {
    quiz.resumeAll('discord');
    // Initial guild cache is authoritative after Discord READY.
    for (const guild of readyClient.guilds.cache.values()) communities.discover('discord', guild.id, guild.name);
    for (const id of Object.keys(communities.list().discord)) {
        if (!readyClient.guilds.cache.has(id)) communities.remove('discord', id);
    }

    dispatchBroadcasts();
    console.log("🌌 ACE GAMING UNIVERSE");

    console.log(
        `✅ Connected as ${readyClient.user.tag}`
    );

    console.log(
        `🏠 Servers: ${readyClient.guilds.cache.size}`
    );
});

client.on('shardDisconnect', ()=>quiz.pauseAll('discord'));
client.on('shardResume', ()=>quiz.resumeAll('discord'));
// Owner-only DM workflow: !broadcast <message> [--tagall] then !broadcast-confirm <id>.
client.on(Events.MessageCreate, async msg => {
    if (msg.author.bot || msg.guildId) return;
    const owner = process.env.AGU_OWNER_DISCORD_ID || '798282571325767680';
    if (msg.author.id !== owner) return;
    const body = msg.content.trim();
    try {
        if (body.startsWith('!broadcast ')) {
            const raw = body.slice('!broadcast '.length);
            const tagAll = /(?:^|\s)--tagall(?:\s|$)/.test(raw);
            const job = broadcasts.preview(raw.replace(/(?:^|\s)--tagall(?:\s|$)/g,' ').trim(),tagAll);
            await msg.reply(`📢 PREVIEW (${job.targets.length} active communities, tagall ${tagAll?'ON':'OFF'})\n\n${job.message}\n\nReply: !broadcast-confirm ${job.id}\nExpires in 10 minutes.`);
        } else if (body.startsWith('!broadcast-confirm ')) {
            const id = body.slice('!broadcast-confirm '.length).trim();
            const job = broadcasts.confirm(id);
            await msg.reply(`✅ Broadcast queued for ${job.targets.length} communities. Check delivery with terminal broadcast-status ${job.id}.`);
        }
    } catch(e) { await msg.reply(`❌ ${e.message}`).catch(console.error); }
});

// Target one suitable announcement channel per active server, never every channel.
let broadcasting = false;
async function dispatchBroadcasts(){
    if(broadcasting) return;
    broadcasting = true;
    try {
        for(const job of broadcasts.allJobs().filter(j=>j.confirmed)) {
            for(const t of job.targets.filter(x=>x.platform==='discord')) {
                if(!communities.isActive('discord',t.id)) continue;
                const guild=client.guilds.cache.get(t.id);
                if(!guild) continue;
                const bot = guild.members.me || await guild.members.fetchMe();
                // A configured channel can be used for any guild that contains it; otherwise use system channel
                // or first text channel where the bot can send messages.
                const preferred = process.env.AGU_DISCORD_ANNOUNCEMENT_CHANNEL_ID;
                const channels = [preferred && guild.channels.cache.get(preferred),guild.systemChannel,
                    ...guild.channels.cache.filter(c=>c.isTextBased() && !c.isThread()).values()].filter(Boolean);
                const channel = channels.find(c=>c.send && c.permissionsFor(bot)?.has(PermissionsBitField.Flags.SendMessages));
                if(!channel) { console.error('No writable broadcast channel in:',t.id);continue; }
                if(!broadcasts.claim(job.id,'discord',t.id)) continue;
                try {
                    const mention = job.tagAll && channel.permissionsFor(bot)?.has(PermissionsBitField.Flags.MentionEveryone)
                        ? '@everyone\n' : '';
                    await channel.send({content:`${mention}📢 **ACE GAMING UNIVERSE ANNOUNCEMENT**\n\n${job.message}`,
                        allowedMentions: mention ? {parse:['everyone']} : {parse:[]}});
                    broadcasts.complete(job.id,'discord',t.id,true);
                    await new Promise(r=>setTimeout(r,1000));
                } catch(e) { broadcasts.complete(job.id,'discord',t.id,false,e.message);console.error('Discord broadcast error:',t.id,e.message); }
            }
        }
    } catch(e){console.error('Discord broadcast queue:',e.message);}
    finally {broadcasting=false;}
}
setInterval(dispatchBroadcasts,10000);

// NYX QUIZ BATTLE — DISCORD AUTO TIMER
let checkingQuizMatches = false;

async function checkDueQuizMatches() {
    if (checkingQuizMatches || !client.isReady()) return;

    checkingQuizMatches = true;

    try {
        const dueMatches = quiz.getDueMatches('discord');

        for (const match of dueMatches) {
            try {
                // Only process active AGU servers.
                if (!communities.isActive('discord', match.community_id)) {
                    continue;
                }

                const guild = client.guilds.cache.get(
                    match.community_id
                );

                if (!guild || !match.channel_id) {
                    continue;
                }

                const channel = await guild.channels
                    .fetch(match.channel_id)
                    .catch(() => null);

                if (!channel || !channel.isTextBased()) {
                    continue;
                }

                // Advance the quiz and generate announcement.
                const announcement = quiz.advance(
                    'discord',
                    match.community_id
                );

                if (!announcement) continue;

                await channel.send({
                    content: announcement,
                    allowedMentions: { parse: [] }
                });
                quiz.markQuestionSent('discord',match.community_id);

            } catch (err) {
                console.error(
                    '[Discord Quiz Timer]',
                    match.community_id,
                    err
                );
            }
        }

    } catch (err) {
        console.error('[Discord Quiz Timer]', err);

    } finally {
        checkingQuizMatches = false;
    }
}

const quizTimer = setInterval(checkDueQuizMatches, 1000);

// Every eligible Discord guild gets its own 10-minute card cycle.
let aguTimersRunning=false;
async function tickAGU(){
 if(aguTimersRunning||!client.isReady())return;aguTimersRunning=true;
 try{
  for(const id of aguSpawns.due('discord')) aguSpawns.spawnIfDue('discord',id);
  for(const spawn of aguSpawns.pendingDeliveries('discord')) {
   const id=spawn.communityId;
   const guild=client.guilds.cache.get(id);if(!guild)continue;
   const bot=guild.members.me||await guild.members.fetchMe().catch(()=>null);if(!bot)continue;
   const channel=[guild.systemChannel,...guild.channels.cache.filter(c=>c.isTextBased()&&!c.isThread()).values()]
    .find(c=>c?.send&&c.permissionsFor(bot)?.has(PermissionsBitField.Flags.SendMessages));
   if(!channel)continue;
   try {
    await channel.send({content:spawn.message+(spawn.card.image?'\n'+spawn.card.image:''),allowedMentions:{parse:[]}});
    aguSpawns.markDelivered('discord',id,spawn.code);
   } catch(e){console.error('Discord card spawn delivery failed:',id,e.message);}
  }
  for(const lotId of aguAuctions.due('discord')){
   const lot=aguAuctions.finish(lotId);if(!lot)continue;
   const guild=client.guilds.cache.get(lot.communityId);if(!guild)continue;
   const bot=guild.members.me||await guild.members.fetchMe().catch(()=>null);
   const channel=[guild.systemChannel,...guild.channels.cache.filter(c=>c.isTextBased()&&!c.isThread()).values()]
    .find(c=>c?.send&&bot&&c.permissionsFor(bot)?.has(PermissionsBitField.Flags.SendMessages));
   if(channel)await channel.send({content:lot.message,allowedMentions:{parse:[]}}).catch(console.error);
  }
 }catch(e){console.error('Discord AGU timers:',e);}finally{aguTimersRunning=false;}
}
const aguTimer=setInterval(tickAGU,15000);aguTimer.unref?.();

quizTimer.unref();

// NUMBER GUESSING — AUTOMATIC EXPIRATION
let checkingGuessGames = false;

async function checkExpiredGuessGames() {
    if (checkingGuessGames || !client.isReady()) return;

    checkingGuessGames = true;

    try {
        const expired = numberGuess.getExpiredGames('discord');

        for (const game of expired) {
            const announcement = numberGuess.expireGame(
                'discord',
                game.community_id
            );

            if (!announcement) continue;

            if (!communities.isActive('discord', game.community_id)) {
                continue;
            }

            const guild = client.guilds.cache.get(game.community_id);
if (!guild) continue;

const bot = guild.members.me || await guild.members.fetchMe();

// Announce only in the channel where the game started.
const channel = game.channel_id
    ? await guild.channels.fetch(game.channel_id).catch(() => null)
    : null;

if (
    channel?.send &&
    channel.permissionsFor(bot)?.has(
        PermissionsBitField.Flags.SendMessages
    )
) {
    await channel.send({
        content: announcement,
        allowedMentions: { parse: [] }
    });
}
        }
    } catch (error) {
        console.error('Discord Number Guess timeout error:', error);
    } finally {
        checkingGuessGames = false;
    }
}

const guessTimer = setInterval(checkExpiredGuessGames, 5000);
if (typeof guessTimer.unref === 'function') guessTimer.unref();

client.on(Events.GuildCreate, guild => communities.discover('discord', guild.id, guild.name));
client.on(Events.GuildDelete, guild => communities.remove('discord', guild.id));

client.on(
    Events.InteractionCreate,
    async (interaction) => {

        if (!interaction.isChatInputCommand()) {
            return;
        }

        try {

            // Disable private-chat gameplay
            if (!interaction.inGuild()) {
                await interaction.reply({
                    content:
                        "❌ AGU commands are only available in servers.",
                    flags: MessageFlags.Ephemeral
                });

                return;
            }

            const command = interaction.commandName;
            if (!communities.get('discord', interaction.guildId)) {
                communities.discover('discord', interaction.guildId, interaction.guild.name);
            }
            if (['activate', 'deactivate', 'status'].includes(command)) {
                const ownerId = process.env.AGU_OWNER_DISCORD_ID || '798282571325767680';
                if (interaction.user.id !== ownerId) {
                    await interaction.reply({ content: '❌ Owner-only command.', flags: MessageFlags.Ephemeral });
                    return;
                }
                if (command !== 'status') communities.setActive('discord', interaction.guildId, command === 'activate');
                const active = communities.isActive('discord', interaction.guildId);
                await interaction.reply({
                    content: command === 'status'
                        ? `🌌 AGU STATUS\nServer ID: ${interaction.guildId}\nStatus: ${active ? '🟢 ACTIVE' : '🔴 INACTIVE'}`
                        : command === 'activate'
                          ? '🌌 ACE GAMING UNIVERSE ACTIVATED!\n🎮 Commands are now available.\n📢 Official AGU announcements will be sent here.'
                          : '💤 ACE GAMING UNIVERSE DEACTIVATED.\nAGU will now remain silent.'
                });
                return;
            }
            if (!communities.isActive('discord', interaction.guildId)) {
                const ownerId = String(process.env.AGU_OWNER_DISCORD_ID || '798282571325767680').trim();
                const ownerTag = /^\d{15,22}$/.test(ownerId) ? `<@${ownerId}>` : 'my owner';
                await interaction.reply({
                    content: `🖤 Ahh! Nice try, but I'm not activated here yet. 🌌\n👑 Ask ${ownerTag} to activate 𝓝𝓨𝓧 in this group.`,
                    flags: MessageFlags.Ephemeral,
                    allowedMentions: { parse: [] } // Clickable owner reference without pinging them.
                });
                return;
            }

            // Pre-handler minigames bypass processCommand, so onboard here too.
            // Public commands and trusted server-management commands keep their existing behavior.
            const onboardingExempt = new Set([
                'register', 'link', 'verify', 'help', 'owner', 'ping',
                'guide', // retired /guide, if still cached, must reach the unknown-command handler
                'cardspawn', 'remove', 'kick', 'promote', 'demote', 'lock', 'unlock'
            ]);
            if (!onboardingExempt.has(command) && !resolvePlayer('discord', interaction.user.id)) {
                await interaction.reply({
                    content: beginnerIntro('discord'),
                    flags: MessageFlags.Ephemeral,
                    allowedMentions: { parse: [] }
                });
                return;
            }

            if (command === 'ttt') {
                const action = interaction.options.getString('action') || 'help';
                const opponent = interaction.options.getUser('opponent');
                const player = resolvePlayer('discord', interaction.user.id);

                if (!player) {
                    await interaction.reply({content:'❌ Register first with /register.',flags:MessageFlags.Ephemeral});
                    return;
                }
                if (action === 'challenge' && opponent && !resolvePlayer('discord',opponent.id)) {
                    await interaction.reply({content:'❌ Your opponent must register with NYX first.',flags:MessageFlags.Ephemeral});
                    return;
                }
                const response=ttt.reply('discord',interaction.guildId,interaction.user.id,action,interaction.options.getInteger('cell'),opponent?.id);
                await interaction.reply({content:response,allowedMentions:{parse:[]}});
                return;
            }

// NYX QUIZ BATTLE
if (command === 'quiz') {
    const player = resolvePlayer('discord', interaction.user.id);

    if (!player) {
        await interaction.reply({
            content: '❌ Register first using /register.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const action = interaction.options.getString('action');
    const choice = interaction.options.getString('answer');

    let response;

    if (action === 'start') {
        response = quiz.start(
            'discord',
            interaction.guildId,
            player,
            interaction.channelId
        );
    } else if (action === 'status') {
        response = quiz.status(
            'discord',
            interaction.guildId
        );
    } else {
        response = quiz.answer(
            'discord',
            interaction.guildId,
            player,
            choice
        );
    }

    await interaction.reply({
        content: response.replace(
            /\.quiz/g,
            '/quiz'
        ),
        allowedMentions: { parse: [] }
    });
    if(action==='start' && response.includes('NYX QUIZ BATTLE STARTED')) quiz.markQuestionSent('discord',interaction.guildId);

    return;
}

// NUMBER GUESSING
if (command === 'guess') {

    const player = resolvePlayer('discord', interaction.user.id);

    if (!player) {
        await interaction.reply({
        content: '❌ Register first using /register.',
        flags: MessageFlags.Ephemeral
    });
        return;
    }

    const action = interaction.options.getString('action');
    const number = interaction.options.getInteger('number');

    const input = action || (number !== null ? String(number) : '');

    const response = numberGuess.play(
        'discord',
        interaction.guildId,
        input,
        player.name,
        interaction.channelId
    );

    await interaction.reply({
        content: response.replace(/\.guess/g, '/guess'),
        allowedMentions: { parse: [] }
    });

    return;
}

// ROCK PAPER SCISSORS — PLAYER VS NYX
if (command === 'rps') {

    if (!resolvePlayer('discord', interaction.user.id)) {
        await interaction.reply({
            content: '❌ Register first using /register.',
            flags: MessageFlags.Ephemeral
        });

        return;
    }

    const choice = interaction.options.getString('choice', true);

    const response = rps.play(
        'discord',
        interaction.guildId,
        choice
    );

    await interaction.reply({
        content: response,
        allowedMentions: { parse: [] }
    });

    return;
}

            if (command === 'minigames') {
                const action = interaction.options.getString('action') || 'status';
                const game = interaction.options.getString('game') || '';
                const admin = interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) || false;
                const reply = minigames.handle('discord',interaction.guildId,[action,game],admin);
                await interaction.reply({content:reply, flags:MessageFlags.Ephemeral});
                return;
            }

            // Discord moderation: explicit moderator permissions and bot permissions.
            if (['remove', 'kick', 'promote', 'demote', 'lock', 'unlock'].includes(command)) {
                const reply = async content => interaction.reply({ content, flags: MessageFlags.Ephemeral });
                const perms = interaction.memberPermissions;
                const channel = interaction.channel;
                const botMember = await interaction.guild.members.fetchMe();
                const required = ['remove', 'kick'].includes(command) ? PermissionsBitField.Flags.KickMembers
                    : ['promote', 'demote'].includes(command) ? PermissionsBitField.Flags.ManageRoles
                    : PermissionsBitField.Flags.ManageChannels;
                if (!perms?.has(required) || !botMember.permissions.has(required)) {
                    await reply('❌ You and AGU need the required server permissions.');
                    return;
                }
                if (command === 'lock' || command === 'unlock') {
                    if (!channel?.permissionOverwrites || !interaction.guild.roles.everyone) {
                        await reply('❌ This channel cannot be locked.'); return;
                    }
                    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                        SendMessages: command === 'lock' ? false : null
                    });
                    await interaction.reply(`✅ Channel ${command === 'lock' ? 'locked' : 'unlocked'}.`);
                    return;
                }
                const targetUser = interaction.options.getUser('target', true);
                const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                if (!target || target.id === interaction.user.id || target.id === client.user.id || target.id === interaction.guild.ownerId) {
                    await reply('❌ Invalid or protected target.'); return;
                }
                if (['remove', 'kick'].includes(command)) {
                    if (!target.kickable) { await reply('❌ Cannot remove that member due to role hierarchy.'); return; }
                    await target.kick(`AGU moderation by ${interaction.user.id}`);
                } else {
                    const roleId = process.env.AGU_DISCORD_MOD_ROLE_ID;
                    const role = roleId && interaction.guild.roles.cache.get(roleId);
                    if (!role || role.permissions.has(PermissionsBitField.Flags.Administrator) || role.position >= botMember.roles.highest.position || role.managed) {
                        await reply('❌ Set a manageable, non-Administrator AGU_DISCORD_MOD_ROLE_ID in .env first.'); return;
                    }
                    if (command === 'demote' && !target.roles.cache.has(role.id)) { await reply('❌ Target does not have the moderator role.'); return; }
                    if (command === 'promote') await target.roles.add(role);
                    else await target.roles.remove(role);
                }
                await interaction.reply(`✅ ${command} completed.`);
                return;
            }

            // Collect command arguments
            const args = [];

            // NYX PLAYER SEARCH
if (command === 'searchplayer' || command === 'scp') {
    args.push(
        interaction.options.getString('query', true)
    );
}

// NYX PLAYER REPORTING
// NYX PLAYER REPORTING
if (command === 'report') {

    const action = interaction.options.getString(
        'action',
        true
    );

    if (action === 'list') {

        const page = interaction.options.getInteger('page') || 1;

        args.push('list', String(page));

    } else {

        const selectedUser = interaction.options.getUser('player');

        const suppliedId = interaction.options.getString('id');

        const reason = interaction.options.getString('reason');

        // A report must identify exactly one target.
        if (
            (selectedUser && suppliedId) ||
            (!selectedUser && !suppliedId)
        ) {
            await interaction.reply({
                content: '❌ Select a player OR provide an AGU ID.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        if (!reason?.trim()) {
            await interaction.reply({
                content: '❌ Provide a reason for the report.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        let targetGameId;

        if (selectedUser) {

            const target = resolvePlayer(
                'discord',
                selectedUser.id
            );

            if (!target?.gameId) {
                await interaction.reply({
                    content: '❌ That player has not registered with NYX.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            targetGameId = target.gameId;

        } else {

            targetGameId = suppliedId.trim();
        }

        args.push(targetGameId, reason);
    }
}

            if (command === "help") {
                const category = interaction.options.getString("category");

            if (category) {
                 args.push(category);
                }
            }

            if (command === 'afk') {
                const reason = interaction.options.getString('reason');
                if (reason) args.push(reason);
            }

            if (command === 'setusername') {
                args.push(interaction.options.getString('name', true));
            }

            if (['slap', 'hug', 'pat', 'poke', 'kiss', 'bonk', 'wave', 'highfive'].includes(command)) {
                const target = interaction.options.getUser('target', true);
                const account = resolvePlayer('discord', target.id);
                if (!account) {
                    await interaction.reply({ content: '❌ Target must be a registered AGU player.', flags: MessageFlags.Ephemeral });
                    return;
                }
                args.push(account.gameId);
            }

            if (command === "register") {

                args.push(
                    interaction.options.getString("name")
                );
            }

            if (command === "link") {
                args.push(interaction.options.getString("id", true));
            }
            if (command === "verify") {
                args.push(interaction.options.getString("code", true));
            }

            if (command === "lb" || command === "leaderboard") {
                const category = interaction.options.getString("category");
                if (category) args.push(category);
            }

           // NYX COIN FLIP
            if (command === "coinflip") {
                const amount = interaction.options.getInteger("amount", true);

                args.push(String(amount));
            }

            if (command === "rob") {
                const recipient = interaction.options.getUser("target", true);
                const account = resolvePlayer("discord", recipient.id);
                if (!account) {
                    await interaction.reply({ content: "❌ Target must be a registered AGU player.", flags: MessageFlags.Ephemeral });
                    return;
                }
                args.push(account.gameId);
            }

            if (command === "givecoin") {
                const recipient = interaction.options.getUser("recipient", true);
                const account = resolvePlayer("discord", recipient.id);
                if (!account) {
                    await interaction.reply({
                        content: "❌ That Discord player has not registered an AGU account yet. They should use /register first.",
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                args.push(account.gameId);
                args.push(interaction.options.getString("amount", true));
            }

            if (command === "todeck" || command === "tocollection") {
                args.push(...interaction.options.getString("slots",true).trim().split(/\s+/));
            }
            if (command === 'fusion') {
                args.push(...interaction.options.getString('slots',true).trim().split(/\s+/));
            }
            if(command === 'profile') {
                const target=interaction.options.getUser('user');
                const aguId=interaction.options.getString('agu_id');
                if(target){
                    const account=resolvePlayer('discord',target.id);
                    if(!account){await interaction.reply({content:'❌ That player is not registered.',flags:MessageFlags.Ephemeral});return;}
                    args.push(account.gameId);
                } else if(aguId) args.push(aguId);
            }

            if (command === "swap") {
                args.push(String(interaction.options.getInteger("first")));
                args.push(String(interaction.options.getInteger("second")));
            }

            // Universal shop, inventory, anime collection, card battles and escrow.
            let battleTargetGameId=null;
            if (command === 'cards') {
                const action=interaction.options.getString('action');if(action)args.push(action);
            }
            if (command === 'inv') {
                const action=interaction.options.getString('action');if(action)args.push(action);
            }
            if (command === 'shop') {
                const action=interaction.options.getString('action')||'view';
                args.push(action);
                const raw=interaction.options.getString('items');if(raw)args.push(...raw.trim().split(/\s+/));
            }
            if (command === 'use') args.push(String(interaction.options.getInteger('slot',true)));
            if (command === 'cardspawn') args.push(interaction.options.getString('id') || 'random');
            if (command === 'claim') args.push(interaction.options.getString('code',true));
            if (command === 'cardinfo') {
                 args.push(
                     ...interaction.options
                     .getString('slot', true)
                     .trim()
                     .split(/\s+/)
                   );
           }
            if (command === 'cardbattle') {
                const action=interaction.options.getString('action',true);args.push(action);
                if(action==='challenge'){
                    const target=interaction.options.getUser('opponent');
                    battleTargetGameId=target?resolvePlayer('discord',target.id)?.gameId:null;
                }
            }
            if (command === 'cs')for(const name of ['first','second','third','fourth'])args.push(String(interaction.options.getInteger(name,true)));
            if (command === 'escrow') {
                args.push(interaction.options.getString('action',true));
                const type=interaction.options.getString('type');if(type)args.push(type);
                const id=interaction.options.getString('identifier');if(id)args.push(id);
            }
            if (command === 'auction') {
                args.push(interaction.options.getString('action',true));
                const value=interaction.options.getString('value');if(value)args.push(value);
            }
            // All other commands use one shared engine
            const result = processCommand({
                platform: "discord",
                userId: interaction.user.id,
                command,
                args,
                communityId: interaction.guildId,
                isAdmin: interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) || false,
                isOwner: interaction.user.id === String(process.env.AGU_OWNER_DISCORD_ID || '798282571325767680').trim(),
                targetGameId: battleTargetGameId
            });

            const privateCommands = new Set(['wallet', 'link', 'verify', 'inv', 'cs']);
            // Optional local GIF: src/assets/reactions/<command>.gif
            // Text still works when a GIF has not been provided.
            const gif = result.success && result.reactionType
                ? path.join(__dirname, 'assets', 'reactions', `${result.reactionType}.gif`)
                : null;
            const files = gif && fs.existsSync(gif) ? [gif] : [];
            await interaction.reply({
                content: result.message,

                ...(result.image && /^https:\/\//i.test(result.image)
                ? {
                 embeds: [
            {
                image: {
                    url: result.image
                }
            }
        ]
    }
    : {}),
                ...(files.length ? { files } : {}),
                ...(privateCommands.has(command) ? { flags: MessageFlags.Ephemeral } : {}),
                allowedMentions: command === 'owner'
    ? { users: ['798282571325767680'] }
    : ['searchplayer', 'scp'].includes(command)
        ? {
            users: [
                ...new Set(
                    (result.mentions || [])
                        .filter(m => m.platform === 'discord')
                        .map(m => String(m.id))
                        .filter(id => /^\d{15,22}$/.test(id))
                )
            ],
            parse: []
        }
        : { parse: [] }
            });

        } catch (error) {

            console.error(
                "❌ Discord command error:",
                error
            );

            if (!interaction.replied) {

                const errorMessage = {
                    content:
                        "❌ Something went wrong while processing your command.",
                    flags: MessageFlags.Ephemeral
                };

                if (interaction.deferred) {
                    await interaction.editReply({
                        content: errorMessage.content
                    }).catch(console.error);
                } else {
                    await interaction.reply(
                        errorMessage
                    ).catch(console.error);
                }
            }
        }
    }
);

if (!process.env.DISCORD_TOKEN) {

    console.error(
        "❌ DISCORD_TOKEN is missing."
    );

    process.exit(1);
}

client.login(process.env.DISCORD_TOKEN)
    .catch(error => {

        console.error(
            "❌ Discord connection failed:",
            error.message
        );
    });
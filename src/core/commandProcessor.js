const {
    registerPlayer,
    coinFlip,
    setAfk,
    clearAfk,
    afkBlockMessage,
    changeUsername,
    getLeaderboard,
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
} = require("../players");

const {
    getCollection,
    moveToDeck,
    moveToCollection,
    swapCards,
    orderedCollection, moveSlots
} = require("../games/anime/collection");

const {
    getCardLeaderboard
} = require('../games/anime/cardLeaderboard');
const { giveCards } = require("../games/anime/giveCard");
const { resolvePlayer } = require("../playerResolver");
const { getPlayerByGameId } = require("../players");
const { createLinkRequest, verifyLinkCode } = require("../accountLinking");
const { checkRateLimit } = require("../rateLimit");
const { canEarnExp } = require("../cooldown");
const agu = require("./aguCommands");
const { getAbility: getDeckAbility } = require("../games/anime/abilities");
const {ACHIEVEMENTS,allAchievements}=require("./achievements");
const shopCardSell = require('../games/anime/shopCardSell');
const referrals = require('./referrals');
const { findPlayers } = require('./playerSearch');
const fusion = require('../games/anime/fusion');
const playerReports = require('./playerReports');
const { beginnerIntro } = require('./onboarding');

// Commands that don't require registration
const publicCommands = [
    "help",
    "ping",
    "owner",
    "register",
    "link",
    "verify"
];

// All commands currently supported by our engine
const validCommands = [
    "help",
    "ping",
    "owner",
    "register",
    "link",
    "verify",
    "searchplayer", "scp",
    "profile",
    "wallet", "coinhistory", "coinlogs", "economy", "id", "myid",
    "givecoin",
    "givecard", "gcard", "givecoll", "gcoll",
    "coinflip",
    "rob",
    "shop", "inv", "inventory", "use", "claim", "cardbattle", "cs", "cardselect", "cardinfo", "escrow", "auction", "trade",
    "setusername",
    "afk",
    "back",
    "slap", "hug", "pat", "poke", "kiss", "bonk", "wave", "highfive",
    "cuddle", "handhold", "blowkiss", "tickle", "wink", "laugh", "punch", "kick", "bite", "yeet", "baka", "angry",
    "leaderboard", "lb",
    "exp",
    "daily",
    "weekly",
    "monthly",
    "streak",
    "achievements", "ach",
    "missions", "ms",
    "referral",
    "report",
    "pokemon",
    "cards", "cardspawn",
    "deck",
    "collection","coll",
    "todeck", "tdeck", "tocollection", "tcoll", "swap", "fusion", "fuse",
    "football",
    "rpg",
    "minigames",
    "tictactoe", "ttt",
    "rps",
    "guess",
    "quiz",
    "kick", "remove", "promote", "demote", "lock", "unlock"
];

function processCommand({
    platform,
    userId,
    command,
    args = [],
    communityId = null,
    isAdmin = false,
    targetGameId = null,
    isOwner = false
}) {

    const cmd = String(command)
        .trim()
        .toLowerCase()
        .replace(/^[./]/, "");

    const aliases = {
        scp: 'searchplayer',
        coll: 'collection',
        tdeck: 'todeck',
        tcoll: 'tocollection',
        gcard: 'givecard',
        gcoll: 'givecoll',
        ach: 'achievements',
        ms: 'missions',
        myid: 'id',
        lb: 'leaderboard',
        fuse: 'fusion'
    };
    const canonicalCommand = aliases[cmd] || cmd;

    const platformId = `${platform}:${userId}`;

    // Check whether the command exists
    if (!validCommands.includes(cmd)) {
        return {
            success: false,
            message: `❌ Unknown command. Use ${platform === "discord" ? "/" : "."}help.`
        };
    }

    // Find the player's existing account
    const player = resolvePlayer(platform, userId);

    // Verify owner privilege from the platform, never from a user-supplied ID.
    // Allow owner drops even if the bot's owner account is not registered for play.
    if (cmd === 'cardspawn') {
        return agu.cardSpawn({args,platform,communityId,isOwner});
    }

    // Prevent unregistered players from using gameplay commands
    if (!player && !publicCommands.includes(cmd)) {
        return {
            success: false,
            message: beginnerIntro(platform)
        };
    }

    // Use one identity for command cooldowns
    const cooldownId = player
        ? player.gameId
        : platformId;

    // Anti-spam protection
    const rateLimit = checkRateLimit(cooldownId);

    if (!rateLimit.allowed) {
        return {
            success: false,
            message:
                `⏳ Slow down! Try again in ` +
                `${rateLimit.remainingSeconds}s.`
        };
    }

    // Existing player storage ID
    const playerId = player
        ? player.id
        : platformId;

    // NYX new interconnected systems: platform, community and linked player identity.
    if (player && agu.ALL.has(cmd)) {
        if (!communityId) return {success:false,message:'❌ This command requires an AGU community.'};
        return agu.execute({cmd,args,player,platform,communityId,isAdmin,targetGameId});
    }
    if (player && cmd === 'cards' && communityId) {
        return agu.cardsFeature({args,platform,communityId,isAdmin});
    }

    let message = "";
    let success = true;
    let image = null;
    let deckView = null;

    switch (canonicalCommand) {

        case "owner":
            message = platform === "discord"
                ? "👑 ACE GAMING UNIVERSE\n🛡️ Owner: <@798282571325767680>"
                : "👑 ACE GAMING UNIVERSE\n🛡️ Owner: ᴀᴄᴇ †";
            break;

        case "ping":
            message =
                `🌌 𝓝𝓨𝓧  SYSTEM ONLINE\n\nAll systems operational.\nMissed me? 🖤`;
            break;

        case "help": {
    if (!player) {
        message = beginnerIntro(platform);
        break;
    }
    const category = (args[0] || "").trim().toLowerCase();

    const menus = {
        general: `🎮 AGU COMMANDS

🎮 HELP MENU

👤 profile
💰 economy
🃏 cards
⚔️ cardbattle
🛒 shop
🤝 referral
🎲 minigames
🏆 leaderboard
💞 social 
🔧 admin
🏛️ auction

📖 Use .help <category> to learn more about each command`,

        cards: `🃏 ANIME CARDS\n\n` +
              `Cards appear in active groups. Claim a spawn using its code, collect more cards to dominate the leaderboard. Show off your decks and collections. Fuse your low tier card to get a higher tier. The higher the tier, the higher your Card power.\n\n` +
              `.deck - View your active deck\n` +
              `.collection - View your card collection\n` +
              `.givecard <deck slot> - Give a card in your deck to another player\n` +
              `.givecoll <collection slot> - Give a card in your collection to another player\n` +
              `.trade <slot in your deck> <slot in player deck> - Trade your card for another card of same tier\n` +
              `.tdeck <slots...> - Move multiple collection cards to deck\n` +
              `.tcoll <slots...> - Move multiple deck cards to collection\n` +
              `.swap <slot1> <slot2> - Swap two cards in your deck\n` +
              `.fusion prices - Show fixed fusion fees\n` +
              `.fusion <collection slots...> - Fuse eligible cards\n` +
              `.claim <code> - Claim the current card\n` +
              `.cardinfo <name> <tier> - Search card designs and owners\n` +
              `.cardinfo <instanceId> - Inspect a unique card copy`,

        economy: `💰 ECONOMY\n\n` +
              `AGU Coins are shared across WhatsApp and Discord. You earn them by playing, and spend them on the shop, auctions and trades.\n\n` +
              `.wallet - Check your coins\n` +
              `.coinhistory [number] - View recent coin transactions (10 by default)\n` +
              `.givecoin <AGU-ID> <amount> - Send coins\n` +
              `.coinflip <amount> - Flip a coin\n` +
              `.rob @player - Attempt a robbery\n` +
              `.inv - Universal inventory\n` +
              `.use <slot> - Use an item\n` +
              `.streak - Check your activity streak\n` +
              `.daily - Claim your daily reward\n` +
              `.weekly - Claim your weekly reward\n` +
              `.monthly - Claim your monthly reward\n` +
              `.missions - View daily missions`,

        profile: `👤 PROFILE\n\n` +
              `Your AGU account has its own permanent AGU ID, separate from WhatsApp or Discord. Link both platforms and your coins, cards and progress follow you everywhere.\n\n` +
              `.register <name> - Register your AGU account\n` +
              `.profile - View player profile\n` +
              `.id - Show your AGU ID\n` +
              `.setusername <name> - Change your AGU username\n` +
              `.afk [reason] - Go AFK and block targeting\n` +
              `.back - Return from AFK\n` +
              `.exp - View your experience points\n` +
              `.achievements - View all achievements\n` +
              `.referral - refer your friends for reward\n` +
              `.scp <name or AGU ID> - Search players and inspect profiles`,

        cardbattle: `⚔️ CARD BATTLES\n\n` +
              `Choose 4 cards from your deck and battle another player. A card's power depends on its tier, so higher tiers hit harder, and the stronger team wins. Winners earn coins and card fragments.\n\n` +
              `.cardbattle @player - Challenge a player\n` +
              `.cardbattle accept / decline - Answer a challenge\n` +
              `.cs <deck slots...> - Pick your 4 fighters (example: .cs 1 3 5 8)\n` +
              `.deck - Check your deck before you fight\n\n` +
              `TIPS\n` +
              `🃏 Only deck cards can fight, so keep your strongest ones there\n` +
              `🔼 Fuse low-tier cards to get stronger ones (.help cards)\n` +
              `🧩 Collect fragments to redeem card bundles`,

        shop: `🛒 SHOP & INVENTORY\n\n` +
              `The shop sells items for coins. What you buy goes into your inventory, and you use it with .use\n\n` +
              `.shop - Browse the shop\n` +
              `.shop buy <item> <quantity> - Purchase items\n` +
              `shop sell card <slots...> - Prepare a sale from your deck\n` +
              `.shop sell coll <slots...> - Prepare a sale from your collection\n` +
              `.shop confirm / .shop cancel - Complete or cancel the sale\n` +
              `.inv - Open your inventory\n` +
              `.use <slot> - Use an item in inventory`,

        auction: `🏛️ AUCTIONS\n\n` +
              `🎴 Sellers lock a card or bundle in global escrow, and admins pick pending items to auction.\n` +
              `💰 Players bid on the active item. Your bid coins are reserved at once and returned automatically if someone outbids you.\n` +
              `🏆 When bidding ends, the highest bidder gets the item and the seller gets the coins minus a 10% auction fee.\n` +
              `⏳ Each lot runs for 10 minutes.\n` +
              `📌 You can withdraw a pending escrow item, but not an active one.\n\n` +
              `FOR BUYERS\n` +
              `.auction status - See what's up for bidding\n` +
              `.auction bid <amount> - Bid on the active item\n\n` +
              `FOR SELLERS\n` +
              `.cardinfo <slot> - Find your card's instance ID\n` +
              `.escrow add card <instanceId> - List a card in escrow\n` +
              `.escrow add bundle <itemId> - List a supported bundle\n` +
              `.escrow queue - View pending listings\n` +
              `.escrow withdraw <escrow ID> - Take back a pending item\n\n` +
              `FOR ADMINS\n` +
              `.auction start - Open an auction event\n` +
              `.auction queue - View pending items\n` +
              `.auction next <escrow ID> - Open one lot for bidding\n` +
              `.auction stop - End the event once no lot is active`,

        referral: `🤝 REFERRALS\n\n` +
              `Invite friends to AGU. Once they become real, active players, you both get rewarded.\n\n` +
              `STEPS\n` +
              ` 1️⃣ .referral - Get your personal code\n` +
              ` 2️⃣ Give your referral code to your friends or to a new player (24 hours window after registering)\n` +
              ` 3️⃣ They collect cards on 4 separate days\n` +
              ` 4️⃣ You both get paid automatically\n\n` +
              `REWARDS\n` +
              `🧑 You: 500 coins + 2 card fragments\n` +
              `🆕 New player: 300 coins`,
                      
        pokemon: `🐉 MONSTER GAME\n\n` +
                `Coming soon!`,

        football: `⚽ FOOTBALL GAME\n\n` +
              `Coming soon!`,

        rpg: `⚔️ RPG ADVENTURE\n\n` +
              `Coming soon!`,

        minigames: `🎲 MINIGAMES\n\n` +
              `Quick games to play with the group. Jump in anytime, no setup needed.\n\n` +
              `.tictactoe - Play Tic-Tac-Toe\n` +
              `.rps - Play Rock Paper Scissors\n` +
              `.guess - Play Number Guessing\n` +
              `.quiz - Play NYX Quiz Battle`,

        social: `💞 SOCIAL REACTIONS\n\n` +
              `💗 AFFECTIONATE: .hug .kiss .cuddle .handhold .blowkiss .pat\n` +
              `🎉 PLAYFUL: .poke .wave .highfive .tickle .wink .laugh\n` +
              `💥 AGGRESSIVE: .slap .bonk .punch .kick .bite .yeet\n` +
              `😤 CURSES: .baka .angry\n\n` +
              `Tag a player or reply.`,

        leaderboard: `🏆 LEADERBOARD\n\n` +
              `Rankings are global across WhatsApp and Discord. Each board shows the top 20 players and your own rank.\n\n` +
              `.leaderboard - Global EXP leaderboard\n` +
              `.lb coins - Coin rankings\n` +
              `.lb streak - Streak rankings\n` +
              `.lb cards - Card rankings\n` +
              `.lb power - Card power rankings\n` +
              `.lb referrals - Referral system rankings`,

        admin: `🔧 ADMIN COMMANDS\n\n` +
              `These commands are for group admins. Both you and NYX need admin permission in the group for them to work.\n\n` +
              `.remove @player - Remove a player\n` +
              `.kick @player - Kick a player\n` +
              `.promote @player - Promote a player to admin\n` +
              `.demote @player - Demote a player from admin\n` +
              `.lock - Lock the group\n` +
              `.unlock - Unlock the group\n` +
              `.minigames on/off - Admin toggle for minigames activation\n` +
              `.cards on/off - Admin toggle for auto-spawns\n` +
              `.coinlogs <AGU-ID> [amount] – View a player's coin history\n` +
              `.economy [stats/sources/sinks] – View economy statistics and coin sources/sinks`
    };

    if (!category) {
        message = menus.general;
    } else if (menus[category]) {
        message = menus[category];
    } else {
        message = `📖 Commands for ${category} are not available yet.`;
    }

    break;
}
        
        case "link": {
            if (player) {
                success = false;
                message = "❌ You already have an AGU account on this platform. Linking does not merge accounts.";
                break;
            }
            if (args.length !== 1) {
                success = false;
                message = "❌ Usage: .link <AGU-ID>";
                break;
            }
            const gameId = String(args[0]).trim().toUpperCase();
            const result = createLinkRequest(gameId, platform, userId);
            success = result.success;
            message = result.success
                ? `🔐 LINK REQUEST\nCode: ${result.code}\nExpires in 5 minutes.\nOn your EXISTING ${result.sourcePlatform} account, use ${result.sourcePlatform === 'discord' ? '/verify' : '.verify'} ${result.code}.\nDo not register again.`
                : result.message;
            break;
        }

        case "verify": {
            const result = verifyLinkCode(platform, userId, args[0]);
            success = result.success;
            message = result.message;
            break;
        }

        case "register": {
            if (player) {
                success = false;
                message =
                    "❌ You are already registered!";
                break;
            }

            const username = args.join(" ").trim();

            if (!username || username.length > 30) {
                success = false;
                message =
                    "❌ Enter a name between 1 and 30 characters.";
                break;
            }

            message = registerPlayer(
                platformId,
                username
            );

            break;
        }

        case "profile": {
            const targetId=targetGameId || (args.length===1 && /^AGU-[A-Z0-9]+$/i.test(args[0])?args[0].toUpperCase():null);
            const subject=targetId?getPlayerByGameId(targetId):player;
            if(!subject){message='❌ That player is not registered.';success=false;break;}
            message=`🎮 AGU PROFILE

👤 Name: ${subject.name}
🆔 ID: ${subject.gameId}

⭐ Level: ${subject.level}
✨ EXP: ${subject.exp}
💰 AGU Coins: ${Number(subject.coins||0).toLocaleString()}
🔥 Activity Streak: ${getActivityStreak(subject.id).streak} days

🏆 Achievements: ${getAchievementSummary(subject.id).length}
📅 Joined: ${new Date(subject.joined).toLocaleDateString()}`;
            break;
        }

            case "leaderboard": {

    const category = String(
        args[0] || 'exp'
    ).trim().toLowerCase();

    const supported = [
        'exp',
        'coins',
        'streak',
        'cards',
        'power',
        'referrals'
    ];

    if (
        args.length > 1 ||
        !supported.includes(category)
    ) {
        return {
            success: false,
            message:
                '❌ Usage: .lb [coins|streak|cards|power]'
        };
    }

    if (category === 'referrals') {
    return {
        success: true,
        message: referrals.leaderboard(player.gameId)
    };
}

    if (category === 'cards' || category === 'power') {

        return {
            success: true,
            message: getCardLeaderboard(
                category,
                player.gameId
            )
        };
    }

    return {
        success: true,
        message: getLeaderboard(
            category,
            player.gameId
        )
    };
}

case "searchplayer": {
    return findPlayers(args.join(' '), platform);
}

        case "afk":
            return setAfk(playerId, args.join(' '));

        case "back":
            return clearAfk(playerId);

        case "setusername": {
            const result = changeUsername(playerId, args.join(' '));
            // Cosmetic rename does not generate EXP, rewards or streak activity.
            return result;
        }

        case "slap":
        case "hug":
        case "pat":
        case "poke":
        case "kiss":
        case "bonk":
        case "wave":
        case "highfive":
        case "cuddle":
        case "handhold":
        case "blowkiss":
        case "tickle":
        case "wink":
        case "laugh":
        case "punch":
        case "kick":
        case "bite":
        case "yeet":
        case "baka":
        case "angry": {
            if (args.length !== 1) {
                return { success: false, message: `❌ Usage: .${canonicalCommand} @player` };
            }
            const target = getPlayerByGameId(args[0]);
            if (!target) return { success: false, message: '❌ Target must be a registered AGU player.' };
            if (target.gameId === player.gameId) return { success: false, message: '❌ Choose another player.' };
            const afkMessage = afkBlockMessage(target);
            if (afkMessage) return { success: false, message: afkMessage };
            const verbs = {
                slap: ['👋💥', 'slapped'], hug: ['🫂', 'hugged'],
                pat: ['🥹', 'patted'], poke: ['👉', 'poked'],
                kiss: ['💋', 'kissed'], bonk: ['🔨', 'bonked'],
                wave: ['👋', 'waved at'], highfive: ['🙌', 'high-fived'],
                cuddle: ['💞','cuddled'], handhold: ['🤝','held hands with'],
                blowkiss: ['😘','blew a kiss to'],tickle: ['🤣','tickled'],
                wink: ['😉','winked at'],laugh: ['😂','laughed with'],
                punch: ['🥊','punched'],kick: ['🦵','kicked'],bite: ['🦷','bit'],
                yeet: ['💨','yeeted'],baka: ['💢','called baka'],angry: ['😡','got angry with']
            };
            const [emoji, verb] = verbs[canonicalCommand];
            return {
                success: true,
                message: `${emoji} ${player.name} ${verb} ${target.name}!`,
                reactionType: canonicalCommand
            };
        }

case "shop": {

    const action = String(
        args[0] || ''
    ).toLowerCase();

    // Existing universal shop display
    if (!action || action === 'view') {
        return {
            success: true,
            message: agu.items.shop()
        };
    }

    // Existing purchasing system
    if (action === 'buy') {
        return agu.inv.purchase(
            player.gameId,
            args.slice(1)
        );
    }

    // Confirm card sale
    if (action === 'confirm') {
        return shopCardSell.confirmSale(
            player.gameId
        );
    }

    // Cancel card sale
    if (action === 'cancel') {
        return shopCardSell.cancelSale(
            player.gameId
        );
    }

    // Card selling
    if (action === 'sell') {

        const type = String(
            args[1] || ''
        ).toLowerCase();

        if (!['card', 'coll'].includes(type)) {

            return {
                success: false,
                message: `❌ NYX SHOP SELLING

🎴 Deck:
.shop sell card 1 2 3

📦 Collection:
.shop sell coll 1 2 3

Maximum: 9 cards.`
            };
        }

        const rawSlots = args.slice(2);

        if (
            rawSlots.length < 1 ||
            rawSlots.length > 9 ||
            rawSlots.some(x =>
                !/^[1-9]\d*$/.test(String(x))
            )
        ) {
            return {
                success: false,
                message:
                    '❌ Select between 1 and 9 valid card slots.'
            };
        }

        const source = type === 'card'
            ? 'deck'
            : 'collection';

        return shopCardSell.prepareSale(
            player.gameId,
            source,
            rawSlots.map(Number)
        );
    }

    return {
        success: false,
        message: `❌ NYX SHOP COMMANDS

🛒 .shop
💰 .shop buy <item> <quantity>

🎴 .shop sell card <slots>
📦 .shop sell coll <slots>

✅ .shop confirm
❌ .shop cancel`
    };
}

        case "id":
            message = `🆔 YOUR PERMANENT AGU ID\n${player.gameId}\n\nThis is the same account on linked WhatsApp and Discord.`;
            break;

        case "wallet":
            message =
                `💰 Your balance: ` +
                `${player.coins.toLocaleString()} AGU Coins`;
            break;

        case "coinhistory": {
            const rawLimit = args[0] == null ? '10' : String(args[0]);
            if (args.length > 1 || !/^[1-9]\d*$/.test(rawLimit) || Number(rawLimit) > 100) {
                success = false;
                message = '❌ Usage: .coinhistory [number]\nChoose a number from 1 to 100. Results are shown in one message.';
                break;
            }
            const coinLedger = require('../economy/coinLedger');
            message = coinLedger.formatHistory(player.gameId, Number(rawLimit));
            break;
        }

        case "coinlogs": {
            if (!isAdmin && !isOwner) {
                success = false;
                message = '❌ This command is restricted to AGU administrators.';
                break;
            }
            if (args.length < 1 || args.length > 2) {
                success = false;
                message = '❌ Usage: .coinlogs <AGU-ID> [number]';
                break;
            }
            const rawLimit = args[1] == null ? '10' : String(args[1]);
            if (!/^[1-9]\d*$/.test(rawLimit) || Number(rawLimit) > 100) {
                success = false;
                message = '❌ History limit must be between 1 and 100.';
                break;
            }
            const target = getPlayerByGameId(args[0]);
            if (!target) {
                success = false;
                message = '❌ No registered player found with that AGU ID.';
                break;
            }
            const coinLedger = require('../economy/coinLedger');
            message = `🛡️ ADMIN COIN LOGS · ${target.name} (${target.gameId})\n\n` +
                coinLedger.formatHistory(target.gameId, Number(rawLimit));
            break;
        }

        case "economy": {
            if (!isAdmin && !isOwner) {
                success = false;
                message = '❌ This command is restricted to AGU administrators.';
                break;
            }
            const coinLedger = require('../economy/coinLedger');
            const subcommand = String(args[0] || 'stats').toLowerCase();
            if (args.length > 1 || !['stats', 'sources', 'sinks'].includes(subcommand)) {
                success = false;
                message = '❌ Usage: .economy [stats|sources|sinks]';
                break;
            }
            message = subcommand === 'stats'
                ? coinLedger.formatStats()
                : coinLedger.formatCategories(subcommand);
            break;
        }

                case "coinflip": {
            if (args.length !== 1) {
                return {
                    success: false,
                    message: "❌ Usage: .coinflip <100-500>"
                };
            }

            const result = coinFlip(playerId, args[0]);
            // Coin Flip handles its own wallet changes
            return {
                success: result.success,
                message: result.message
            };
        }

        case "rob": {
            if (args.length !== 1) {
                success = false;
                message = "❌ Usage: .rob @player";
                break;
            }
            const result = attemptRobbery(playerId, args[0]);
            success = result.success;
            message = result.message;
            break;
        }

        case "givecard":
case "givecoll": {

    // The verified recipient game ID is supplied
    // by the WhatsApp mention/reply resolver.
    if (args.length < 2 || args.length > 10) {
        message = '❌ Usage: .gcard 1 2 3 @player (maximum 9 cards)';
        success = false;
        break;
    }

    const recipientGameId = String(args[args.length - 1]);

    const slotArgs = args.slice(0, -1);

    if (
        slotArgs.some(value =>
            !/^[1-9]\d*$/.test(String(value))
        )
    ) {
        message = '❌ Enter valid card slot numbers.';
        success = false;
        break;
    }

    const slots = slotArgs.map(Number);

    const source = canonicalCommand === 'givecard'
        ? 'deck'
        : 'collection';

    const result = giveCards({
        senderGameId: player.gameId,
        recipientGameId,
        source,
        slots
    });

    success = result.success;
    message = result.message;

    break;
}

        case "givecoin": {
            if (args.length !== 2 || !/^[1-9]\d*$/.test(String(args[1]))) {
                success = false;
                message = "❌ Usage: .givecoin <AGU-ID> <positive amount>";
                break;
            }
            const amount = Number(args[1]);
            const result = transferCoins(playerId, args[0], amount);
            success = result.success;
            message = result.message;
            break;
        }

        case "exp":
            message =
                `⭐ Level: ${player.level}\n` +
                `✨ Total EXP: ${player.exp}`;
            break;

        case "daily":
            message = claimDaily(playerId);
            break;

        case "weekly":
            message = claimWeekly(playerId);
            break;

        case "monthly":
            message = claimMonthly(playerId);
            break;

        case "streak": {
              const result = getActivityStreak(playerId);

               message = `🔥 ACTIVITY STREAK

📅 Current streak: ${result.streak} days
🕒 Last active: ${result.lastActivityDay || "Never"}`;

    break;
}

        case "achievements": {
            const visible=allAchievements().filter(a=>a.enabled);
            const completed=new Set(getAchievementSummary(playerId).map(a=>a.id));
            const counters=player.achievementCounters||{};
            const cardModule=require('./achievements');
            const cardProgress=cardModule.cardAchievementProgress(player.gameId);
            const byId=new Map(cardProgress.map(a=>[a.id,a]));
            // Claim already-earned card milestones if a player opens achievements.
            // Historical hidden claims are preserved, not rewarded twice.
            const newAwards=cardModule.checkCardMilestones(player.gameId);
            for(const row of cardModule.cardAchievementProgress(player.gameId))byId.set(row.id,row);
            const fresh=require('../players').getPlayerByGameId(player.gameId)||player;
            const readable={level_reached:fresh.level,coins_reached:fresh.coins,exp_reached:fresh.exp,activity_streak:fresh.activityStreak||0};
            const rows=visible.map(a=>{
                const special=byId.get(a.id);
                const count=special?.progress ?? (readable[a.event]??(a.event==='unique_command'?(fresh.uniqueCommands||[]).length:counters[a.event]||0));
                const done=special?.completed??completed.has(a.id);
                return {a,done,line:`${done?'✅':'⬜'} ${a.name}\n🎯 ${a.description}\n📊 ${Math.min(count,a.target)}/${a.target} • 🪙 ${a.reward}`};
            });
            const raw=String(args[0]||'1').toLowerCase();
            const secrets=agu.hidden.view(player.gameId);
            if(raw==='secrets'){
                message='🌌 DISCOVERED SECRET ACHIEVEMENTS\n\n'+(secrets.length?secrets.map(a=>`✅ ${a.name} • 🎟️ Event Card Fragment`).join('\n'):'🔒 No secrets discovered yet.');
                break;
            }
            if(raw==='completed'){
                const doneRows=rows.filter(r=>r.done);
                message=`🏆 COMPLETED ACHIEVEMENTS (${doneRows.length}/${rows.length})\n\n`+(doneRows.map(r=>r.line).join('\n\n')||'No achievements completed yet.');
                break;
            }
            if(!/^[1-9]\d*$/.test(raw)){
                success=false;message='❌ Usage: .ach [page|completed|secrets]';break;
            }
            const page=Number(raw),pageSize=12,pages=Math.max(1,Math.ceil(rows.length/pageSize));
            if(page>pages){success=false;message=`❌ Page ${page} not found. Available: 1-${pages}.`;break;}
            const subset=rows.slice((page-1)*pageSize,page*pageSize);
            const headers={general:'🧭 EXPLORATION',economy:'💰 ECONOMY',progression:'⭐ PROGRESSION',experience:'✨ EXPERIENCE',consistency:'🔥 CONSISTENCY',card_battles:'⚔️ CARD BATTLES',card_collection:'🎴 CARD COLLECTION',anime:'🎴 ANIME'};
            const groups=[];let group='';
            for(const row of subset){
                const category=Object.keys(cardModule.ACHIEVEMENTS).find(k=>cardModule.ACHIEVEMENTS[k].includes(row.a))||'other';
                if(category!==group){group=category;groups.push(`\n${headers[category]||category.toUpperCase()}`);}
                groups.push(row.line);
            }
            message=`🏆 NYX ACHIEVEMENTS\n✅ Unlocked: ${rows.filter(r=>r.done).length}/${rows.length}\n📄 Page ${page}/${pages}\n`+groups.join('\n\n')+(page<pages?`\n\n➡️ .ach ${page+1} for more`:'')+(newAwards.length?'\n\n'+newAwards.join('\n\n'):'');
            break;
        }

        case "missions": {
            const current = getMissionSummary(playerId);
            message = `📜 DAILY MISSIONS\n\n` +
                current.map(m =>
                    `${m.completed ? '✅' : '🎯'} ${m.name}\n` +
                    `Progress: ${m.progress}/${m.target} | Reward: ${m.reward}  AGU Coins`
                ).join('\n\n') +
                '\n\n🕛 Resets daily.';
            break;
        }

        case "referral": {

    const action = String(args[0] || '')
        .trim()
        .toLowerCase();

    if (!action || action === 'stats' || action === 'code') {
        return referrals.stats(player.gameId);
    }

    if (action === 'use') {

        if (args.length !== 2) {
            return {
                success: false,
                message:
                    '❌ Usage: .referral use <AGU referral code>'
            };
        }

        return referrals.useCode(
            player.gameId,
            args[1]
        );
    }

    return {
        success: false,
        message: `❌ REFERRAL COMMANDS

🤝 .referral
🆔 .referral code
📊 .referral stats
✅ .referral use <code>`
    };
}

case "report": {

    const action = String(
        args[0] || ''
    ).trim().toLowerCase();

    // Administrator daily report list
    if (action === 'list') {

        if (args.length > 2) {
            return {
                success: false,
                message: '❌ Usage: .report list [page]'
            };
        }

        const rawPage = String(args[1] || '1');

        if (!/^[1-9]\d*$/.test(rawPage)) {
            return {
                success: false,
                message: '❌ Invalid page number.'
            };
        }

        return playerReports.list({
            platform,
            communityId,
            isAdmin,
            isOwner,
            page: Number(rawPage)
        });
    }

    // Submit player report
    if (args.length < 2) {
        return {
            success: false,

            message: `🚨 NYX PLAYER REPORTING

📝 Report someone:
.report <AGU ID> <reason>

📋 Admin reports:
.report list

📄 Other pages:
.report list 2`
        };
    }

    return playerReports.submit({
        reporterGameId: player.gameId,
        targetGameId: args[0],
        reason: args.slice(1).join(' '),
        platform,
        communityId
    });
}

        case "deck": {
    const collection = getCollection(player.gameId);
    const deck = collection.deck || [];

    if (deck.length === 0) {
        message = "🃏 Your deck is empty. (0/12)";
        break;
    }

    // Inspect a specific equipped card.
    if (args[0] && /^\d+$/.test(String(args[0]))) {
        const slot = Number(args[0]);

        if (slot < 1 || slot > deck.length) {
            message = "❌ Invalid deck slot.";
            break;
        }

const card = deck[slot - 1];

message = `🌌 NYX DECK CARD

🎴 Deck Slot: ${slot}

🎴 ${card.name}
📺 Series: ${card.series || card.anime || "Unknown"}
💎 Tier: ${card.tier}
⚡ Power: ${card.power ?? "Unknown"}
✨ Ability: ${getDeckAbility(card).name}
📖 Description: ${getDeckAbility(card).description}
🆔 Instance ID: ${card.instanceId || "Unknown"}`;

image = card.image || null;

break;
    }

// Provide deck data to the cross-platform visual renderer.
// Individual inspection (.deck 1) does not use this.
deckView = {
    gameId: player.gameId,
    playerName: player.name || "AGU Collector",
    cards: deck.map((card, index) => ({
        ...card,
        slot: index + 1
    }))
};

    // Display the entire deck.
    const tierLabel = tier => {
        const value = String(tier || "").toUpperCase();

        if (value === "S" || value === "TS" || value === "TIER S") {
            return "TS";
        }

        return `T${value.replace(/^TIER\s*|^T/i, "")}`;
    };

    message = `🌌 NYX CARD COLLECTION 🎴

👤 Collector: ${player.name || "AGU Collector"}
🎴 Cards Equipped: ${deck.length}/12

✨ YOUR CARD VAULT ✨

${deck.map((card, i) => `
━━━━━━━━━━━━━━━━━━━━
🎴 #${i + 1} — ${card.name}
💎 Tier: ${String(card.tier).replace(/^T/i, "")}
📺 Series: ${card.series || card.anime || "Unknown"}
⚡ Power: ${card.power ?? "Unknown"}`).join("\n")}

━━━━━━━━━━━━━━━━━━━━
🔎 Inspect any card:
.deck <number>

🌌 Your collection. Your legacy`;

    break;
}

case "collection":
case "coll": {
    const collection = getCollection(player.gameId);
    const cards = orderedCollection(collection.collection || []);

    if (cards.length === 0) {
        message = "📚 Your collection is empty.";
        break;
    }

    // Inspect a collection card by slot
    if (args[0] && /^\d+$/.test(String(args[0]))) {
        const slot = Number(args[0]);

        if (slot < 1 || slot > cards.length) {
            message = "❌ Invalid collection slot.";
            break;
        }

        const card = cards[slot - 1];

        message = `🌌 NYX COLLECTION CARD

🎴 Collection Slot: ${slot}

🎴 ${card.name}
📺 Series: ${card.series || "Unknown"}
💎 Tier: ${card.tier}
⚡ Power: ${card.power ?? "Unknown"}
🆔 Instance ID: ${card.instanceId || "Unknown"}`;

        image = card.image || null;
        break;
    }

    let group = '';
    let rows = [];
    for (let i=0;i<cards.length;i++) {
        const tier=String(cards[i].tier).toUpperCase().replace(/^T/, '');
        if(tier!==group){ group=tier; rows.push(`\n💎 Tier ${group}`); }
        rows.push(`${i+1}. ${cards[i].name}`);
    }
    message=`📚 YOUR COLLECTION (${cards.length})\n${rows.join('\n')}\n\n🔎 .coll <slot> | 📥 .tdeck <slots>`;

    break;
}

        case "todeck":
        case "tocollection": {
            const slots=args.map(Number);
            if(!args.length || args.some(x=>!/^\d+$/.test(String(x)))) {
                message=`❌ Usage: .${canonicalCommand==='todeck'?'tdeck':'tcoll'} <slot1> <slot2> ...`;
                break;
            }
            const result=moveSlots(player.gameId,slots,canonicalCommand==='todeck'?'deck':'collection');
            message=result.message;
            break;
        }

        case "fusion": {
            if(String(args[0]||'').toLowerCase()==='prices' || !args.length){message=fusion.prices();break;}
            const slots=args.map(Number);
            if(args.some(x=>!/^\d+$/.test(String(x)))){message='❌ Usage: .fusion <collection slots...> | .fusion prices';break;}
            const result=fusion.fuse(player.gameId,slots);
            message=result.message;break;
        }

        case "swap": {
    const firstSlot = Number(args[0]);
    const secondSlot = Number(args[1]);

    if (
        args.length !== 2 ||
        !Number.isInteger(firstSlot) ||
        !Number.isInteger(secondSlot)
    ) {
        message = "❌ Usage: .swap <slot1> <slot2>";
        break;
    }

    const result = swapCards(
        player.gameId,
        firstSlot,
        secondSlot
    );

    message = result.message;
    break;
        }

        case "pokemon":
            message =
                "🐉 Monster Game: Coming soon!";
            break;

        case "football":
            message =
                "⚽ Football Game: Coming soon!";
            break;

        case "rpg":
            message =
                "⚔️ RPG Adventure: Coming soon!";
            break;
    }

    // Rejected reward claims do not earn EXP
    if (
        message.startsWith("❌") ||
        message.startsWith("⏳")
    ) {
        success = false;
    }

    // Record activity for successful commands only
    if (success && player && cmd !== "register" && cmd !== "owner" && cmd !== "link" && cmd !== "verify") {
      const streakResult = updateActivityStreak(playerId);

    if (streakResult?.updated) {
        message += `\n\n🔥 Daily streak: ${streakResult.streak} day(s)!`;
    }

    if (streakResult?.reward > 0) {
        message +=
            `\n🔥 ${streakResult.streak}-DAY STREAK!` +
            `\n🎁 Bonus: ${streakResult.reward}  AGU Coins!`;
        }
    }

    // Track only meaningful successful actions, not .wallet/.profile/.help spam.
    // Aliases count as the same command for progress and EXP.
    const meaningfulCommands = new Set([
        'deck', 'collection', 'streak', 'daily', 'weekly', 'monthly',
        'todeck', 'tocollection', 'swap'
    ]);
    if (success && player && meaningfulCommands.has(canonicalCommand)) {
        const notifications = [];
        const addAwards = result => {
            for (const a of result?.achievements || []) {
                notifications.push(`🏆 ACHIEVEMENT: ${a.name} (+${a.reward}  AGU Coins)`);
            }
            for (const m of result?.missions || []) {
                notifications.push(`🎯 MISSION COMPLETE: ${m.name} (+${m.reward}  AGU Coins)`);
            }
        };
        addAwards(recordGameEvent(playerId, 'unique_command', canonicalCommand));
        const eventNames = {
            deck: 'deck_viewed',
            collection: 'collection_viewed',
            streak: 'streak_viewed',
            daily: 'daily_claimed'
        };
        const event = eventNames[canonicalCommand];
        if (event && (event !== 'daily_claimed' || message.includes('✅ Daily reward claimed!'))) {
            addAwards(recordGameEvent(playerId, event));
        }
        if (notifications.length) message += '\n' + notifications.join('\n');
    }

    return {
        success,
        message,
        ...(image ? { image } : {}),
        ...(deckView ? { deckView } : {})
    };
}

// Centralized EXP accounting. This runs after the command handler finishes,
// including commands handled by agu.execute() and other early-return branches.
// The handler and EXP update share one SQLite transaction.
const EXP_PER_ACTION = 5;
const NO_EXP_COMMANDS = new Set([
    'register', 'link', 'verify', 'owner', 'help', 'ping', 'id', 'searchplayer', 'exp', 'wallet',
    'streak', 'referral', 'report', 'afk', 'back',
    'kick', 'remove', 'promote', 'demote', 'lock', 'unlock',
    'cardspawn', 'cards'
]);
const EXP_ALIASES = {
    scp: 'searchplayer', lb: 'leaderboard', myid: 'id',
    ach: 'achievements', ms: 'missions', coll: 'collection',
    tdeck: 'todeck', tcoll: 'tocollection', fuse: 'fusion',
    gcard: 'givecard', gcoll: 'givecoll',
    inventory: 'inv', cardselect: 'cs', ttt: 'tictactoe'
};

function actionQualifiesForExp(command, args) {
    if (NO_EXP_COMMANDS.has(command)) return false;
    const sub = String(args?.[0] || '').trim().toLowerCase();
    switch (command) {
        case 'shop': return ['buy', 'confirm'].includes(sub);
        case 'inv': return sub === 'upgrade';
        case 'auction': return sub === 'bid';
        case 'escrow': return ['add', 'withdraw'].includes(sub);
        case 'trade': return !['', 'status', 'list'].includes(sub);
        case 'quiz': return ['a', 'b', 'c', 'd'].includes(sub);
        case 'guess': return sub !== 'status' && sub !== 'start';
        case 'tictactoe': return ['challenge', 'accept', 'move'].includes(sub);
        case 'rps': return ['rock', 'paper', 'scissors'].includes(sub);
        default: return true;
    }
}

function awardSuccessfulCommandExp(context, response) {

    if (
        !response ||
        typeof response !== 'object' ||
        response.success !== true
    ) {
        return response;
    }

    const commandText = String(context.command || '')
        .trim()
        .toLowerCase()
        .replace(/^[./]/, '');

    const canonical =
        EXP_ALIASES[commandText] || commandText;

    // Respect your existing, manually adjusted
    // EXP exclusion and qualification rules.
    if (
        !actionQualifiesForExp(
            canonical,
            context.args || []
        )
    ) {
        return response;
    }

    const activePlayer = resolvePlayer(
        context.platform,
        context.userId
    );

    if (!activePlayer) return response;

    // Existing shared EXP cooldown.
    if (!canEarnExp(activePlayer.gameId, canonical)) {
        return response;
    }

    const awarded = addExp(
        activePlayer.id,
        EXP_PER_ACTION
    );

    if (!awarded) return response;

    let message = String(response.message || '');

    if (awarded.leveledUp) {
        message +=
            `\n🎉 LEVEL UP! You reached Level ${awarded.level}!`;
    }

    if (awarded.coinsEarned > 0) {
        message +=
            `\n🎁 LEVEL MILESTONE REWARD!` +
            `\n🪙 +${awarded.coinsEarned.toLocaleString()} AGU Coins`;
    }

    for (
        const item of
        checkPlayerStatAchievements(activePlayer.id) || []
    ) {
        message +=
            `\n🏆 ACHIEVEMENT: ${item.name}` +
            ` (+${item.reward} AGU Coins)`;
    }

    return {
        ...response,
        message
    };
}

function processCommandWithExp(context) {

    const response = processCommand(context);

    return awardSuccessfulCommandExp(
        context,
        response
    );
}

const { withTransaction } = require('../database/connection');

module.exports = {
    processCommand: withTransaction(processCommandWithExp),

    awardSuccessfulCommandExp: withTransaction(
        awardSuccessfulCommandExp
    )
};
require("dotenv").config();

const {
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const simpleCommands = [
    ["ping", "Check bot status"],
    ["owner", "Show AGU owner"],

    ["wallet", "Check your coins"],
    ["id", "Show your permanent AGU player ID"],
    ["exp", "View your experience"],
    ["daily", "Claim your daily reward"],
    ["weekly", "Claim your weekly reward"],
    ["monthly", "Claim your monthly reward"],
    ["streak", "View your activity streak"],
    ["achievements", "View completed achievements"],
    ["missions", "View daily missions"],
    ["deck", "View your active anime deck"],
    ["collection", "View your anime collection"],
    ["pokemon", "View monster game information"],
    ["cards", "View card collection information"],
    ["football", "View football game information"],
    ["rpg", "View RPG information"]
];

// Only the AGU owner can execute these (checked at runtime).
simpleCommands.push(
    ['activate', 'Activate AGU in this server'],
    ['deactivate', 'Deactivate AGU in this server'],
    ['status', 'Check AGU activation status']
);

const commands = simpleCommands.map(
    ([name, description]) => {

        return new SlashCommandBuilder()
            .setName(name)
            .setDescription(description)
            .toJSON();
    }
);

commands.push(
 new SlashCommandBuilder().setName('profile').setDescription('View your profile or another AGU player')
  .addUserOption(o=>o.setName('user').setDescription('Optional Discord player').setRequired(false))
  .addStringOption(o=>o.setName('agu_id').setDescription('Optional AGU ID').setRequired(false)).toJSON(),
 new SlashCommandBuilder().setName('fusion').setDescription('Fuse cards from your collection')
  .addStringOption(o=>o.setName('slots').setDescription('Collection slots (e.g. 1 2 3), or prices').setRequired(true)).toJSON()
);
// ACE GAMING UNIVERSE — UNIVERSAL SHOP / INVENTORY / CARDS / AUCTIONS
commands.push(
 new SlashCommandBuilder().setName('shop').setDescription('Browse or buy from the universal AGU shop')
  .addStringOption(o=>o.setName('action').setDescription('view or buy').setRequired(false).addChoices({name:'View',value:'view'},{name:'Buy',value:'buy'}))
  .addStringOption(o=>o.setName('items').setDescription('For buy: 2 3 or 1:2 3:1').setRequired(false)).toJSON(),
 new SlashCommandBuilder().setName('inv').setDescription('View or upgrade your universal inventory')
  .addStringOption(o=>o.setName('action').setDescription('Optional').setRequired(false).addChoices({name:'Upgrade (+10 slots)',value:'upgrade'})).toJSON(),
 new SlashCommandBuilder().setName('use').setDescription('Use an inventory item by slot')
  .addIntegerOption(o=>o.setName('slot').setDescription('Inventory slot').setMinValue(1).setRequired(true)).toJSON(),
 new SlashCommandBuilder().setName('cardspawn').setDescription('Owner only: spawn a Shoob anime card now in this server')
  .addStringOption(o=>o.setName('id').setDescription('Shoob source card ID, or random (default)').setRequired(false)).toJSON(),
 new SlashCommandBuilder().setName('claim').setDescription('Claim a spawned anime card')
  .addStringOption(o=>o.setName('code').setDescription('Four-character claim code').setMinLength(4).setMaxLength(4).setRequired(true)).toJSON(),
 new SlashCommandBuilder().setName('cardinfo').setDescription('Search name/tier or inspect an instance')
  .addStringOption(o=>o.setName('slot').setDescription('Character name + tier, instance UUID, or slot').setRequired(true)).toJSON(),
 new SlashCommandBuilder().setName('cardbattle').setDescription('Challenge, accept or decline a card battle')
  .addStringOption(o=>o.setName('action').setDescription('Action').setRequired(true).addChoices({name:'Challenge',value:'challenge'},{name:'Accept',value:'accept'},{name:'Decline',value:'decline'}))
  .addUserOption(o=>o.setName('opponent').setDescription('Required when challenging').setRequired(false)).toJSON(),
 new SlashCommandBuilder().setName('cs').setDescription('Select four cards for a battle (private until resolved)')
  .addIntegerOption(o=>o.setName('first').setDescription('Card slot').setMinValue(1).setRequired(true))
  .addIntegerOption(o=>o.setName('second').setDescription('Card slot').setMinValue(1).setRequired(true))
  .addIntegerOption(o=>o.setName('third').setDescription('Card slot').setMinValue(1).setRequired(true))
  .addIntegerOption(o=>o.setName('fourth').setDescription('Card slot').setMinValue(1).setRequired(true)).toJSON(),
 new SlashCommandBuilder().setName('escrow').setDescription('Global escrow: submit, withdraw or queue')
  .addStringOption(o=>o.setName('action').setDescription('Action').setRequired(true).addChoices({name:'Add',value:'add'},{name:'Withdraw',value:'withdraw'},{name:'Queue',value:'queue'}))
  .addStringOption(o=>o.setName('type').setDescription('card or bundle; use when adding').setRequired(false).addChoices({name:'Card',value:'card'},{name:'Bundle',value:'bundle'}))
  .addStringOption(o=>o.setName('identifier').setDescription('Card instance ID, bundle item ID or escrow ID').setRequired(false)).toJSON(),
 new SlashCommandBuilder().setName('auction').setDescription('Community auction event and bidding')
  .addStringOption(o=>o.setName('action').setDescription('Action').setRequired(true).addChoices(...['status','start','stop','queue','next','bid'].map(v=>({name:v,value:v}))))
  .addStringOption(o=>o.setName('value').setDescription('Escrow ID for next; coin amount for bid').setRequired(false)).toJSON()
);
// Existing /cards basic command above: replace definition with controllable toggle below.
const cardsIdx=commands.findIndex(c=>c.name==='cards');
if(cardsIdx>=0)commands[cardsIdx]=new SlashCommandBuilder().setName('cards').setDescription('Card auto-spawning: status or admin ON/OFF')
 .addStringOption(o=>o.setName('action').setDescription('Status or admin toggle').setRequired(false).addChoices({name:'Status',value:'status'},{name:'On',value:'on'},{name:'Off',value:'off'})).toJSON();

// NYX PLAYER SEARCH
commands.push(
    new SlashCommandBuilder()
        .setName('searchplayer')
        .setDescription('Search for an AGU player by exact username or ID')
        .addStringOption(option =>
            option
                .setName('query')
                .setDescription('Exact username or permanent AGU ID')
                .setRequired(true)
        )
        .toJSON(),

    new SlashCommandBuilder()
        .setName('scp')
        .setDescription('Quick player search')
        .addStringOption(option =>
            option
                .setName('query')
                .setDescription('Exact username or permanent AGU ID')
                .setRequired(true)
        )
        .toJSON()
);

// NYX PLAYER REPORTING
commands.push(
    new SlashCommandBuilder()
        .setName('report')
        .setDescription('Report a registered player or view daily reports')

        .addStringOption(option =>
            option
                .setName('action')
                .setDescription('Submit a report or view reports')
                .setRequired(true)
                .addChoices(
                    { name: 'Submit Report', value: 'submit' },
                    { name: 'List Reports', value: 'list' }
                )
        )

        .addUserOption(option =>
            option
                .setName('player')
                .setDescription('Select the Discord player to report')
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName('id')
                .setDescription('Alternatively, enter a permanent AGU ID')
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Why are you reporting this player?')
                .setMaxLength(500)
                .setRequired(false)
        )

        .addIntegerOption(option =>
            option
                .setName('page')
                .setDescription('Report list page number')
                .setMinValue(1)
                .setRequired(false)
        )

        .toJSON()
);

// NUMBER GUESSING
commands.push(
    new SlashCommandBuilder()
        .setName('guess')
        .setDescription('Play Number Guessing with everyone in this server')
        .addStringOption(option =>
            option
                .setName('action')
                .setDescription('Start a game or check its status')
                .setRequired(false)
                .addChoices(
                    { name: 'Start Game', value: 'start' },
                    { name: 'Check Status', value: 'status' }
                )
        )
        .addIntegerOption(option =>
            option
                .setName('number')
                .setDescription('Guess a number between 1 and 100')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(false)
        )
        .toJSON(),

    new SlashCommandBuilder()
    .setName('quiz')
    .setDescription('Play NYX Quiz Battle with your server')
    .addStringOption(option =>
        option
            .setName('action')
            .setDescription('Start a quiz or view its status')
            .setRequired(false)
            .addChoices(
                { name: 'Start', value: 'start' },
                { name: 'Status', value: 'status' }
            )
    )
    .addStringOption(option =>
        option
            .setName('answer')
            .setDescription('Submit your answer to the current question')
            .setRequired(false)
            .addChoices(
                { name: 'A', value: 'A' },
                { name: 'B', value: 'B' },
                { name: 'C', value: 'C' },
                { name: 'D', value: 'D' }
            )
    )
    .toJSON()
);



// ROCK PAPER SCISSORS
commands.push(
    new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Play Rock Paper Scissors against NYX')
        .addStringOption(option =>
            option
                .setName('choice')
                .setDescription('Choose rock, paper, or scissors')
                .setRequired(true)
                .addChoices(
                    { name: '🪨 Rock', value: 'rock' },
                    { name: '📄 Paper', value: 'paper' },
                    { name: '✂️ Scissors', value: 'scissors' }
                )
        )
        .toJSON()
);

// TIC-TAC-TOE
commands.push(new SlashCommandBuilder()
    .setName('ttt')
    .setDescription('Play Tic-Tac-Toe with someone in this server')
    .addStringOption(o => o.setName('action').setDescription('Choose a game action').setRequired(true)
        .addChoices(...['help','challenge','accept','decline','move','status','resign'].map(v=>({name:v,value:v}))))
    .addUserOption(o => o.setName('opponent').setDescription('Player to challenge').setRequired(false))
    .addIntegerOption(o => o.setName('cell').setDescription('Cell 1–9 for a move').setMinValue(1).setMaxValue(9).setRequired(false))
    .toJSON());

// MINIGAMES
commands.push(new SlashCommandBuilder()
    .setName('minigames')
    .setDescription('View or manage minigames in this server')
    .addStringOption(o => o.setName('action').setDescription('Action (admins only for changes)')
        .setRequired(false).addChoices(
            {name:'Status',value:'status'}, {name:'Enable all',value:'on'},
            {name:'Disable all',value:'off'}, {name:'Enable game',value:'enable'},
            {name:'Disable game',value:'disable'}))
    .addStringOption(o => o.setName('game').setDescription('Game name for enable/disable (e.g. tictactoe)').setRequired(false))
    .toJSON());

// HELP
commands.push(
    new SlashCommandBuilder()
        .setName("help")
        .setDescription("View AGU commands by category")
        .addStringOption(option =>
            option
                .setName("category")
                .setDescription("Choose a help category")
                .setRequired(false)
                .addChoices(
                    { name: "Profile", value: "profile" },
                    { name: "Economy", value: "economy" },
                    { name: "Anime Cards", value: "cards" },
                    { name: "Pokémon", value: "pokemon" },
                    { name: "Football", value: "football" },
                    { name: "RPG", value: "rpg" },
                    { name: "Mini-games", value: "minigames" },
                    { name: "Leaderboard", value: "leaderboard" }
                )
        )
        .toJSON()
);

// One Discord leaderboard command; WhatsApp keeps .lb as an alias
// NYX GLOBAL LEADERBOARDS
commands.push(
    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the global NYX leaderboards')
        .addStringOption(option =>
            option
                .setName('category')
                .setDescription('Choose a leaderboard (default: EXP)')
                .setRequired(false)
                .addChoices(
                    { name: 'EXP', value: 'exp' },
                    { name: 'Coins', value: 'coins' },
                    { name: 'Streak', value: 'streak' },
                    { name: 'Cards Owned', value: 'cards' },
                    { name: 'Card Power', value: 'power' },
                    { name: 'Referrals', value: 'referrals' }
                )
        )
        .toJSON()
);

// AFK / BACK
commands.push(
    new SlashCommandBuilder().setName('afk').setDescription('Set your player status to AFK')
        .addStringOption(o => o.setName('reason').setDescription('Optional AFK reason').setMaxLength(100).setRequired(false)).toJSON(),
    new SlashCommandBuilder().setName('back').setDescription('Return from AFK').toJSON()
);

// ADMIN COMMANDS
commands.push(new SlashCommandBuilder()
    .setName('setusername').setDescription('Change your AGU player name')
    .addStringOption(o => o.setName('name').setDescription('Your new AGU username')
        .setMinLength(2).setMaxLength(30).setRequired(true)).toJSON());
for (const name of ['slap', 'hug', 'pat', 'poke', 'kiss', 'bonk', 'wave', 'highfive']) {
    commands.push(new SlashCommandBuilder()
        .setName(name).setDescription(`${name} another AGU player`)
        .addUserOption(o => o.setName('target').setDescription('Player to react to').setRequired(true))
        .toJSON());
}

// Player-to-player coin transfers (amount is a string for exact integer validation)
commands.push(
    new SlashCommandBuilder()
        .setName("givecoin")
        .setDescription("Send coins to another AGU player")
        .addUserOption(option => option
            .setName("recipient")
            .setDescription("Tag the Discord player receiving coins")
            .setRequired(true))
        .addStringOption(option => option
            .setName("amount")
            .setDescription("Positive whole number of coins")
            .setRequired(true))
        .toJSON(),
    new SlashCommandBuilder()
        .setName("todeck")
        .setDescription("Move collection cards into your deck")
        .addStringOption(option => option
            .setName("slots").setDescription("One or more slots separated by spaces")
            .setRequired(true))
        .toJSON(),
    new SlashCommandBuilder()
        .setName("tocollection")
        .setDescription("Move deck cards into your collection")
        .addStringOption(option => option
            .setName("slots").setDescription("One or more slots separated by spaces")
            .setRequired(true))
        .toJSON(),
    new SlashCommandBuilder()
        .setName("swap")
        .setDescription("Swap two deck cards")
        .addIntegerOption(option => option
            .setName("first").setDescription("First deck slot")
            .setMinValue(1).setRequired(true))
        .addIntegerOption(option => option
            .setName("second").setDescription("Second deck slot")
            .setMinValue(1).setRequired(true))
        .toJSON()
);

// ROBBERY
commands.push(new SlashCommandBuilder().setName('rob').setDescription('Risk a robbery against another player')
    .addUserOption(o => o.setName('target').setDescription('Player to rob').setRequired(true)).toJSON());

// NYX COIN FLIP
commands.push(
    new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Flip a coin for a chance to win or lose AGU Coins')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Amount of AGU Coins to stake (100–500)')
                .setMinValue(100)
                .setMaxValue(500)
                .setRequired(true)
        )
        .toJSON()
);

for (const name of ['remove', 'promote', 'demote', 'kick']) {
    commands.push(new SlashCommandBuilder().setName(name).setDescription(`${name} a server member`)
        .addUserOption(o => o.setName('target').setDescription('Target member').setRequired(true)).toJSON());
}
for (const name of ['lock', 'unlock']) {
    commands.push(new SlashCommandBuilder().setName(name).setDescription(`${name} this channel`).toJSON());
}

// Registration command
commands.push(
    new SlashCommandBuilder()
        .setName("register")
        .setDescription("Register your AGU account")
        .addStringOption(option =>
            option
                .setName("name")
                .setDescription("Your player name")
                .setRequired(true)
                .setMaxLength(30)
        )
        .toJSON()
);

// Account linking
commands.push(
    new SlashCommandBuilder()
        .setName("link")
        .setDescription("Connect an existing AGU account")
        .addStringOption(option =>
            option
                .setName("id")
                .setDescription("Your AGU player ID")
                .setRequired(true)
        )
        .toJSON()
);

// Account verification
commands.push(
    new SlashCommandBuilder()
        .setName("verify")
        .setDescription("Verify account ownership")
        .addStringOption(option =>
            option
                .setName("code")
                .setDescription("Your verification code")
                .setRequired(true)
        )
        .toJSON()
);

const rest = new REST({
    version: "10"
}).setToken(process.env.DISCORD_TOKEN);

async function deployCommands() {

    try {

        console.log(
            `🔄 Registering ${commands.length} commands...`
        );

        await rest.put(
            Routes.applicationCommands(
                process.env.DISCORD_CLIENT_ID
            ),
            {
                body: commands
            }
        );

        console.log(
            "✅ All Discord commands registered!"
        );

    } catch (error) {

        console.error(
            "❌ Registration failed:",
            error
        );
    }
}

deployCommands();
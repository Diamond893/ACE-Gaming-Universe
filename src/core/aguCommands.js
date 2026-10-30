'use strict';
const inv=require('../inventory/inventory'),items=require('../shop/items'),use=require('../inventory/use');
const cards=require('../games/anime/cards'),
spawns=require('../games/anime/spawns'),
battles=require('../games/anime/battles'),
auctions=require('../auctions/auctions'),
hidden=require('./hiddenAchievements'),
cardTrade = require('../games/anime/cardTrade');
const { getAbility } = require('../games/anime/abilities');

function abilityText(card) {
    const ability = getAbility(card);

    return `\n\n✨ SIGNATURE ABILITY
⚔️ ${ability.name}
📖 ${ability.description}`;
}

const {getCollection}=require('../games/anime/collection');
const events = require('../games/anime/events');
const ALL=new Set(['inv','inventory','use','claim','cardbattle','cs','cardselect','escrow','auction','cardinfo', 'trade']);
// Synchronous command handlers use existing transaction-based player identity.
function execute({cmd,args,player,platform,communityId,isAdmin=false,targetGameId=null}){
 const gameId=player.gameId, sub=String(args[0]||'').toLowerCase();
 try{
 if(cmd==='inv'||cmd==='inventory')return sub==='upgrade'?inv.upgrade(gameId):{success:true,message:inv.display(gameId,player.name)};
 if(cmd==='use')return use.use(gameId,Number(args[0]));
 if(cmd==='claim')return spawns.claim(platform,communityId,args[0],gameId);
 if (cmd === 'cardinfo') {

        // EVENT CARD CATALOG
    const eventArg = String(args[0] || '').trim().toUpperCase();

    if (eventArg === 'EVENT') {
        const released = events.catalog().filter(c =>
            c.visibility === 'public'
        );

        if (!released.length) {
            return {
                success: true,
                message: '🎴 No public Event Cards are available yet.'
            };
        }

        return {
            success: true,
            message:
                '🌌 AGU EVENT CARD CATALOG\n\n' +
                released.map(c =>
                    `🎴 ${c.id}\n` +
                    `👑 ${c.name}\n` +
                    `💎 Tier: T${c.tier}`
                ).join('\n\n') +
                '\n\n🔎 Use .cardinfo EVENT-001 to inspect a card.'
        };
    }

    // LOOK UP A SPECIFIC EVENT CARD
    if (/^EVENT-\d+$/i.test(eventArg)) {

        const eventCard = events.catalog().find(c =>
            String(c.id).toUpperCase() === eventArg
        );

        if (!eventCard || eventCard.visibility !== 'public') {
            return {
                success: false,
                message: '❌ Event Card not found or not publicly released.'
            };
        }

        const issued = !events.remaining().some(c =>
            String(c.id).toUpperCase() === eventArg
        );

// FIND CURRENT EVENT CARD OWNER
const stats = cards.getOwnerStats({
    isEvent: true,
    eventId: eventArg,
    cardId: `EVENT:${eventArg}`
});

const holder = stats.holders[0];

const owner = holder
    ? cards.ownerContact(holder.gameId)
    : null;

const ownerJid = platform === 'whatsapp'
    ? owner?.whatsappJid
    : null;

const ownerName = owner
    ? ownerJid
        ? `${owner.name} (@${ownerJid.split('@')[0]})`
        : owner.name
    : 'None';

        return {
            mentions: ownerJid ? [ownerJid] : [],
            success: true,
            image: eventCard.image,
            message:
                `🌌 AGU EXCLUSIVE EVENT CARD\n\n` +
                `🎴 ${eventCard.name}\n` +
                `📺 ${eventCard.series}\n` +
                `💎 Tier: T${eventCard.tier}\n` +
                `👑 Edition: 1/1\n` +
                `🎨 Maker: ${eventCard.maker || 'Unknown'}\n\n` +
                `🆔 Event ID: ${eventCard.id}\n` +
                `📜 Status: ${issued ? 'Issued' : 'Not Yet Issued'}\n` +
                `👤 Current Owner: ${ownerName}`
        };
    }

    // Search a card design by character name and trailing tier, across all owners.
    const finalTier=String(args.at(-1)||'').toUpperCase().replace(/^T/,'');
    if(args.length>=2 && /^(?:[1-6]|S)$/.test(finalTier) && String(args[0]).toLowerCase()!=='user') {
        const name=args.slice(0,-1).join(' ').trim().toLocaleLowerCase();
        const {db}=require('../database/connection');
        const records=[];
        for(const row of db.prepare('SELECT game_id,payload FROM collections').all()){
            const p=JSON.parse(row.payload);
            for(const c of [...(p.deck||[]),...(p.collection||[])]){
                if(String(c.name||'').toLocaleLowerCase()===name && String(c.tier||'').toUpperCase().replace(/^T/,'')===finalTier)records.push({gameId:row.game_id,card:c});
            }
        }
        for(const row of db.prepare("SELECT seller_id,payload FROM global_escrow WHERE asset_type='card' AND state IN ('pending','active')").all()){
            const c=JSON.parse(row.payload);
            if(String(c.name||'').toLocaleLowerCase()===name && String(c.tier||'').toUpperCase().replace(/^T/,'')===finalTier && !records.some(x=>x.card.instanceId===c.instanceId))records.push({gameId:row.seller_id,card:c});
        }
        const catalog=cards.getCards().find(c=>String(c.name||'').toLocaleLowerCase()===name && String(c.tier||'').toUpperCase().replace(/^T/,'')===finalTier);
        const sample=records[0]?.card||catalog;
        if(!sample)return{success:false,message:'❌ No card design found with that name and tier.'};
        const owners=new Set(records.map(r=>r.gameId));
        const ownerMentions = [];

const rows = records.slice(0, 15).map((x, i) => {
    const owner = cards.ownerContact(x.gameId);

    const jid = platform === 'whatsapp'
        ? owner?.whatsappJid
        : null;

    if (jid) {
        ownerMentions.push(jid);
    }

    const tag = jid
        ? ` (@${jid.split('@')[0].replace(/:\d+$/, '')})`
        : '';

    return (
        `${i + 1}. 👤 ${owner?.name || 'Unknown'}${tag}\n` +
        `🆔 Instance: ${x.card.instanceId}\n` +
        `⚡ Power: ${x.card.power}`
    );
});
        return {
    success: true,
    mentions: [...new Set(ownerMentions)],
    image: sample.image || null,
    message:`🎴 NYX CARD DATABASE\n\n🎴 ${sample.name}\n📺 ${sample.anime||sample.series||'Unknown'}\n💎 Tier: ${finalTier}${abilityText(sample)}\n\n👥 Owners: ${owners.size} | Copies: ${records.length}\n\n${rows.join('\n\n')||'No copies currently owned.'}${records.length>15?`\n...${records.length-15} more copies.`:''}\n\n🔎 .cardinfo <instanceId>`};
    }
    // Instance ID lookup is global and read-only.
    if(args.length===1 && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(args[0])) {
        const id=args[0];const {db}=require('../database/connection');
        for(const row of db.prepare('SELECT game_id,payload FROM collections').all()){
            const p=JSON.parse(row.payload);
            for(const place of ['deck','collection']){
                const c=(p[place]||[]).find(x=>x.instanceId===id);
                if(c)return{success:true,image:c.image||null,message:`${cards.cardText(c)}${abilityText(c)}\n👤 Owner: ${cards.ownerContact(row.game_id).name}\n📦 Location: ${place}`};
            }
        }
        for(const row of db.prepare("SELECT seller_id,payload FROM global_escrow WHERE asset_type='card' AND state IN ('pending','active')").all()){
            const c=JSON.parse(row.payload);if(c.instanceId===id)return{success:true,image:c.image||null,message:`${cards.cardText(c)}${abilityText(c)}\n👤 Owner: ${cards.ownerContact(row.seller_id).name}\n📦 Location: Auction escrow`};
        }
        return{success:false,message:'❌ Card instance not found.'};
    }
    const first = String(args[0] || '').toLowerCase();

    const showUsers =
        first === 'user' ||
        String(args[1] || '').toLowerCase() === 'user';

    const identifier = String(
        first === 'user'
            ? (args[1] || '')
            : (args[0] || '')
    );

    if (!identifier) {
        return {
            success: false,
            message:
                '❌ Usage:\n' +
                '.cardinfo <slot, instanceId, or owned EVENT-ID>\n' +
                '.cardinfo user <slot, instanceId, or owned EVENT-ID>'
        };
    }

    const list = cards.owned(gameId);

    const slot = Number(identifier);

    // Slot and unique instance ID still work. Event catalog IDs can also
    // inspect cards already owned, without exposing unissued previews.
    const card = (
        Number.isInteger(slot) && slot >= 1
            ? list[slot - 1]
            : null
    ) || list.find(
        c => c.instanceId === identifier
    ) || list.find(
        c => c.isEvent && String(c.eventId || '').toLowerCase() === identifier.toLowerCase()
    );

    if (!card) {
        return {
            success: false,
            message: '❌ Card not found.'
        };
    }

    const stats = cards.getOwnerStats(card);

    // NORMAL CARDINFO
    if (!showUsers) {
        return {
            success: true,
            
            image: card.image,
            message: `${cards.cardText(card)}${abilityText(card)}

👥 Total Owners: ${stats.owners}
🎴 Total Copies: ${stats.copies}

🔎 See owners:
.cardinfo user ${identifier}`
        };
    }

    // CARDINFO USER
    const mentionJids = [];

const rows = stats.holders
    .slice(0, 10)
    .map((holder, i) => {

        const user = cards.ownerContact(holder.gameId);

        const jid = platform === 'whatsapp'
            ? user.whatsappJid
            : null;

        if (jid) {
            mentionJids.push(jid);
        }

        const displayName = jid
            ? `${user.name} (@${jid.split('@')[0]})`
            : user.name;

        return `${i + 1}. ${displayName}
🎴 Copies: ${holder.quantity}`;
    });

    const remaining = stats.holders.length - 10;

    return {
        success: true,
        mentions: [...new Set(mentionJids)],
        image: card.image,
        message: `👥 NYX CARD OWNERS

🎴 ${card.name}
💎 Tier: T${card.tier}

👥 Total Owners: ${stats.owners}
🎴 Total Copies: ${stats.copies}

${rows.join('\n\n') || 'No current owners.'}

${remaining > 0
    ? `...and ${remaining} more owners.`
    : ''}`
    };
}
 if (cmd === 'cardbattle') {

    if (sub === 'accept' || sub === 'decline') {
        return battles.reply(
            platform,
            communityId,
            gameId,
            sub === 'accept'
        );
    }

    if (sub === 'forfeit' || sub === 'surrender') {
        return battles.forfeit(
            platform,
            communityId,
            gameId
        );
    }

    if (!targetGameId) {
        return {
            success: false,
            message:
                '❌ Mention a registered opponent: .cardbattle @player'
        };
    }

    return battles.challenge(
        platform,
        communityId,
        gameId,
        targetGameId
    );
}
 if(cmd==='cs'||cmd==='cardselect')return battles.select(platform,communityId,gameId,args.map(Number));
 if(cmd==='escrow'){
   if(sub==='add')return auctions.submit(gameId,String(args[1]||'').toLowerCase(),String(args[2]||''));
   if(sub==='withdraw')return auctions.withdraw(gameId,String(args[1]||'').toUpperCase());
   if(sub==='queue')return auctions.queue();
   return{success:false,message:'❌ .escrow add card <instanceId> | .escrow add bundle <itemId> | .escrow withdraw <ID> | .escrow queue'};
 }

// NYX CROSS-PLATFORM TRADING
if (cmd === 'trade') {

    const action = String(args[0] || '').toLowerCase();

    // ACCEPT AN OFFER
    if (action === 'accept') {
        const tradeId = String(args[1] || '').toUpperCase();

        if (!tradeId) {
            return {
                success: false,
                message: '❌ Usage: .trade accept <trade ID>'
            };
        }

        return cardTrade.acceptTrade(tradeId, gameId);
    }

    // DECLINE AN OFFER
    if (action === 'decline') {
        const tradeId = String(args[1] || '').toUpperCase();

        if (!tradeId) {
            return {
                success: false,
                message: '❌ Usage: .trade decline <trade ID>'
            };
        }

        return cardTrade.declineTrade(tradeId, gameId);
    }

    // CANCEL YOUR OWN OFFER
    if (action === 'cancel') {
        const tradeId = String(args[1] || '').toUpperCase();

        if (!tradeId) {
            return {
                success: false,
                message: '❌ Usage: .trade cancel <trade ID>'
            };
        }

        return cardTrade.cancelTrade(tradeId, gameId);
    }

    // CREATE AN OFFER
    // Expected args:
    // [myDeckSlot, requestedSlotOrCoins, recipientGameId]

    if (args.length !== 3) {
        return {
            success: false,
            message: `❌ NYX TRADE USAGE

🎴 Card-for-card:
.trade 2 5 @player

💰 Card-for-AGU-Coins:
.trade 2 2000 @player

✅ .trade accept <trade ID>
❌ .trade decline <trade ID>
🚫 .trade cancel <trade ID>`
        };
    }

    const [mySlotText, requestedText, recipientGameId] = args;

    if (
        !/^[1-9]\d*$/.test(String(mySlotText)) ||
        !/^[1-9]\d*$/.test(String(requestedText))
    ) {
        return {
            success: false,
            message: '❌ Enter valid positive whole numbers.'
        };
    }

    return cardTrade.createTrade({
        senderGameId: gameId,
        recipientGameId: String(recipientGameId),
        senderSlot: Number(mySlotText),
        requested: Number(requestedText)
    });
}

if (cmd === 'auction') {

    // Anyone can check auction status.
    if (sub === 'status' || !sub) {
        return auctions.status(platform, communityId);
    }

    // Registered players can bid.
    if (sub === 'bid') {
        return auctions.bid(
            platform,
            communityId,
            gameId,
            Number(args[1])
        );
    }

    // Auction management requires community admin privileges.
    if (!isAdmin) {
        return {
            success: false,
            message: '❌ Only community admins may manage auctions.'
        };
    }

    if (sub === 'start') {
        return auctions.start(platform, communityId, gameId);
    }

    // Both commands close the auction event.
    if (sub === 'stop' || sub === 'end') {
        return auctions.stop(platform, communityId);
    }

    if (sub === 'queue') {
        return auctions.queue();
    }

    if (sub === 'next') {
        return auctions.next(
            platform,
            communityId,
            String(args[1] || '').toUpperCase()
        );
    }

    return {
        success: false,
        message: `❌ AUCTION COMMANDS

👑 Admin:
.auction start
.auction queue
.auction next <escrow ID>
.auction end

🎴 Players:
.auction status
.auction bid <amount>

💲 Sellers:
.escrow add card <Instanceid>`
    };
}
 return{success:false,message:'❌ Unknown command.'};
 }catch(e){return{success:false,message:`❌ ${e.message}`};}
}
function cardSpawn({args,platform,communityId,isOwner}){
 if(!isOwner)return{success:false,message:'❌ Only the AGU owner can use .cardspawn.'};
 if(!communityId)return{success:false,message:'❌ Use this command inside an AGU community.'};
 return spawns.forceSpawn(platform,communityId,args[0]||'random');
}
function cardsFeature({args,platform,communityId,isAdmin}){const sub=String(args[0]||'status').toLowerCase();if(['on','off','enable','disable'].includes(sub)){if(!isAdmin)return{success:false,message:'❌ Only mods can toggle cards.'};return spawns.toggle(platform,communityId,['on','enable'].includes(sub));}return spawns.status(platform,communityId);}
module.exports={ALL,execute,cardsFeature,cardSpawn,items,inv,hidden};

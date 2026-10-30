'use strict';
// Shop is universal. Prices are initial configurable defaults, not ACE-approved economic balancing.
const catalog = [
 {id:'robbery_shield',name:'Robbery Shield',category:'Protection',emoji:'🛡️',price:2000,description:'Use to block robberies for 24 hours.'},
 {id:'basic_card_bundle',name:'Basic Card Bundle',category:'Cards',emoji:'🎁',price:400,description:'Opens 2 ordinary cards.'},
 {id:'standard_card_bundle',name:'Standard Card Bundle',category:'Cards',emoji:'🎁',price:1100,description:'Opens 3 ordinary cards.'},
 {id:'premium_card_bundle',name:'Premium Card Bundle',category:'Cards',emoji:'🎁',price:2500,description:'Opens 5 ordinary cards.'}
];
const items=[...catalog,
 {id:'card_fragment',name:'Card Fragment',category:'Cards',emoji:'🧩',price:null},
 {id:'event_card_fragment',name:'Event Card Fragment',category:'Cards',emoji:'🎟️',price:null},
 {id:'fragment_card_bundle',name:'Card Package Bundle',category:'Cards',emoji:'📦',price:null,description:'3–4 cards; redeem for 100 Card Fragments.'}
];
const byId=id=>items.find(i=>i.id===id)||null;
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const find=q=>catalog.find(x=>norm(x.name)===norm(q)||x.id===q)||null;
const shop=()=>`🛒 NYX UNIVERSAL SHOP\n\n${catalog.map((i,n)=>`${n+1}. ${i.emoji} ${i.name} — ${i.price.toLocaleString()} Coins\n   ${i.description}`).join('\n')}\n\nBuy: .shop buy 2 3  (three copies of shop #2)\nOr: .shop buy 1:2 3:1  (multiple products)\nItems go to .inv; use with .use <slot>.`;
module.exports={catalog,items,byId,find,shop,norm};

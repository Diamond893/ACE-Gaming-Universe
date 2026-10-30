"use strict";
// Add new categories and uniquely named items here. Only supported effects may be purchased.
const categories = {
  protection: { label: "🛡️ PROTECTION", items: [
    { id: "robbery_shield", name: "Robbery Shield", price: 500, hours: 24,
      effect: "robbery_shield", description: "Blocks robberies for 24 hours.", aliases: ["shield"] }
  ] },
  boosters: { label: "⚡ BOOSTERS", items: [] },
  consumables: { label: "🎟️ CONSUMABLES", items: [] },
  cosmetics: { label: "🎨 COSMETICS", items: [] }
};
const allItems = Object.values(categories).flatMap(c => c.items);
const norm = s => String(s || "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function findItem(query) {
  const key = norm(query);
  if (!key) return { item: null, suggestions: [] };
  const exact = allItems.filter(item => [item.name, ...(item.aliases || [])].some(n => norm(n) === key));
  if (exact.length === 1) return { item: exact[0], suggestions: [] };
  // Incomplete/misspelled names only suggest; never charge coins without an exact name/alias.
  const distance = (a,b) => { const row = Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){let prior=row[0];row[0]=i;
      for(let j=1;j<=b.length;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prior+(a[i-1]===b[j-1]?0:1));prior=old;}}
    return row[b.length]; };
  const suggestions = allItems.map(item => ({item, score: Math.min(...[item.name, ...(item.aliases||[])].map(n => {
    const word=norm(n); if (word.includes(key)||key.includes(word)) return 0;
    const qwords=key.split(' '), iwords=word.split(' ');
    if (qwords.length <= iwords.length) {
      return qwords.reduce((sum,q,i) => sum + Math.min(...iwords.map(w =>
        w.startsWith(q) ? 0 : distance(q,w.slice(0,Math.max(q.length,w.length-2))))), 0);
    }
    return distance(key,word);
  }))})).filter(x=>x.score<=Math.max(2,Math.floor(key.length/3)))
    .sort((a,b)=>a.score-b.score).slice(0,5).map(x=>x.item);
  return { item: null, suggestions };
}
function shopText() {
    const lines = ["🛒 ACE GAMING UNIVERSE SHOP"];

    for (const category of Object.values(categories)) {

        // Hide categories without available items
        if (category.items.length === 0) continue;

        lines.push("", category.label);

        for (const item of category.items) {
            lines.push(
                `${item.name} — ${item.price.toLocaleString()} Coins\n  ${item.description}`
            );
        }
    }

    lines.push("", "🛍️ Buy: .shop buy <full item name>");

    return lines.join("\n");
}
module.exports={categories,allItems,findItem,shopText};

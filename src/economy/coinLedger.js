'use strict';

const crypto = require('crypto');
const { db } = require('../database/connection');

db.exec(`
  CREATE TABLE IF NOT EXISTS coin_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    reference_id TEXT,
    actor_id TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS coin_ledger_player_time_idx
    ON coin_ledger(player_id, created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS coin_ledger_transaction_idx
    ON coin_ledger(transaction_id);
  CREATE INDEX IF NOT EXISTS coin_ledger_category_time_idx
    ON coin_ledger(category, created_at DESC);
`);

const insertEntry = db.prepare(`
  INSERT INTO coin_ledger
    (transaction_id, player_id, amount, balance_after, category,
     description, reference_id, actor_id, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const CATEGORIES = {
  registerPlayer: ['registration', 'Starting balance granted at registration'],
  claimDaily: ['daily_reward', 'Daily reward claimed'],
  claimWeekly: ['weekly_reward', 'Weekly reward claimed'],
  claimMonthly: ['monthly_reward', 'Monthly reward claimed'],
  updateActivityStreak: ['activity_streak', 'Activity streak reward'],
  addExp: ['level_reward', 'Level milestone reward'],
  transferCoins: ['player_transfer', 'Player-to-player coin transfer'],
  attemptRobbery: ['robbery', 'Robbery result; coins moved between players'],
  coinFlip: ['coinflip', 'Coinflip result'],
  buyShopItem: ['shop_purchase', 'Shop item purchase'],
  upgrade: ['inventory_upgrade', 'Inventory capacity upgrade'],
  purchase: ['shop_purchase', 'Inventory shop purchase'],
  claim: ['card_claim', 'Card claim payment or refund'],
  fuse: ['fusion', 'Card fusion fee'],
  confirmSale: ['card_sale', 'Card sale proceeds'],
  acceptTrade: ['card_trade', 'Card-for-coins trade'],
  useCode: ['referral', 'Referral reward'],
  recordActivity: ['referral', 'Referral qualification reward'],
  checkCardMilestones: ['achievement', 'Card achievement reward'],
  applyMissionEvent: ['mission', 'Daily mission reward'],
  applyAchievementEvent: ['achievement', 'Achievement reward'],
  checkStatAchievements: ['achievement', 'Achievement reward'],
  recordGameEvent: ['game_event_reward', 'Combined mission and achievement rewards from a tracked event'],
  battleReward: ['battle_reward', 'Card battle reward'],
  awardSuccessfulCommandExp: ['level_reward', 'Level milestone reward'],
  processCommand: ['wallet_adjustment', 'Wallet balance changed during command'],
  bid: ['auction', 'Auction bid or escrow movement'],
  settle: ['auction', 'Auction settlement or refund'],
  cancel: ['auction', 'Auction cancellation or refund'],
  placeBid: ['auction', 'Auction bid or escrow movement']
};

function inferMeta(stack, supplied = {}) {
  if (supplied && supplied.category) {
    return {
      category: String(supplied.category).slice(0, 60),
      description: String(supplied.description || supplied.category).slice(0, 240),
      referenceId: supplied.referenceId == null ? null : String(supplied.referenceId).slice(0, 120),
      actorId: supplied.actorId == null ? null : String(supplied.actorId).slice(0, 120),
      transactionId: supplied.transactionId || crypto.randomUUID()
    };
  }
  const frames = String(stack || '').split('\n').slice(2);
  const pathCategories = [
    [/\\auctions\\auctions\.js|\/auctions\/auctions\.js/, 'auction', 'Auction bid, settlement or refund'],
    [/\\games\\anime\\battles\.js|\/games\/anime\/battles\.js/, 'battle_reward', 'Card battle coin reward'],
    [/\\games\\anime\\cardTrade\.js|\/games\/anime\/cardTrade\.js/, 'card_trade', 'Card-for-coins trade'],
    [/\\games\\anime\\shopCardSell\.js|\/games\/anime\/shopCardSell\.js/, 'card_sale', 'Card sale proceeds'],
    [/\\games\\anime\\spawns\.js|\/games\/anime\/spawns\.js/, 'card_claim', 'Card claim payment or refund'],
    [/\\games\\anime\\fusion\.js|\/games\/anime\/fusion\.js/, 'fusion', 'Card fusion fee'],
    [/\\inventory\\inventory\.js|\/inventory\/inventory\.js/, 'shop_purchase', 'Inventory purchase or upgrade'],
    [/\\core\\referrals\.js|\/core\/referrals\.js/, 'referral', 'Referral reward'],
    [/\\core\\missions\.js|\/core\/missions\.js/, 'mission', 'Daily mission reward'],
    [/\\core\\achievements\.js|\/core\/achievements\.js/, 'achievement', 'Achievement reward']
  ];
  for (const frame of frames) {
    for (const [pattern, category, description] of pathCategories) {
      if (pattern.test(frame)) {
        return { category, description, referenceId: null, actorId: null, transactionId: supplied.transactionId || crypto.randomUUID() };
      }
    }
    const m = frame.match(/\bat\s+(?:Object\.)?([A-Za-z_$][\w$]*)\s*\(/);
    if (m && CATEGORIES[m[1]]) {
      const [category, description] = CATEGORIES[m[1]];
      return { category, description, referenceId: null, actorId: null, transactionId: supplied.transactionId || crypto.randomUUID() };
    }
  }
  return {
    category: 'wallet_adjustment',
    description: 'Wallet balance changed',
    referenceId: null,
    actorId: null,
    transactionId: supplied.transactionId || crypto.randomUUID()
  };
}

function recordBalanceChange({ playerId, oldBalance, newBalance, gameId, meta, stack }) {
  const oldValue = oldBalance == null ? 0 : Number(oldBalance);
  const newValue = Number(newBalance);
  if (!Number.isSafeInteger(oldValue) || !Number.isSafeInteger(newValue) || oldValue === newValue) return null;
  const details = inferMeta(stack, meta);
  const amount = newValue - oldValue;
  const description = oldBalance == null
    ? 'Starting wallet balance granted at registration'
    : details.description;
  insertEntry.run(
    details.transactionId,
    String(gameId || playerId),
    amount,
    newValue,
    details.category,
    description,
    details.referenceId,
    details.actorId,
    Date.now()
  );
  return details.transactionId;
}

function history(gameId, limit = 10) {
  const safeLimit = Math.max(1, Math.min(100, Number.isSafeInteger(Number(limit)) ? Number(limit) : 10));
  return db.prepare(`
    SELECT id, transaction_id, player_id, amount, balance_after, category,
           description, reference_id, actor_id, created_at
    FROM coin_ledger
    WHERE player_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(String(gameId), safeLimit);
}

function totals() {
  const players = db.prepare('SELECT payload FROM players').all();
  let circulation = 0;
  for (const row of players) {
    try {
      const p = JSON.parse(row.payload);
      const coins = Number(p.coins);
      if (Number.isSafeInteger(coins)) circulation += coins;
    } catch {}
  }
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const today = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS gross_credits,
      COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0) AS gross_debits,
      COALESCE(SUM(amount), 0) AS net_change,
      COUNT(*) AS entries
    FROM coin_ledger WHERE created_at >= ?
  `).get(dayAgo);
  const allTime = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS net_change, COUNT(*) AS entries
    FROM coin_ledger
  `).get();
  return { circulation, last24h: today, allTime };
}

function categoryTotals(direction = 'all', since = Date.now() - 24 * 60 * 60 * 1000) {
  const condition = direction === 'sources' ? 'AND amount > 0'
    : direction === 'sinks' ? 'AND amount < 0' : '';
  return db.prepare(`
    SELECT category,
      SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS credits,
      SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS debits,
      SUM(amount) AS net,
      COUNT(*) AS transactions
    FROM coin_ledger
    WHERE created_at >= ? ${condition}
    GROUP BY category
    ORDER BY (credits + debits) DESC, category ASC
    LIMIT 20
  `).all(since);
}

function formatHistory(gameId, limit = 10) {
  const rows = history(gameId, limit);
  const fmt = n => Number(n).toLocaleString('en-US');
  if (!rows.length) return '💰 COIN HISTORY\n\nNo coin transactions recorded yet. History begins from the ledger deployment date.';
  const lines = rows.map(row => {
    const sign = row.amount > 0 ? '+' : '−';
    const amount = `${sign}${fmt(Math.abs(row.amount))}`;
    const date = new Date(row.created_at).toLocaleString('en-GB', {
      timeZone: 'Africa/Lagos', day: '2-digit', month: 'short',
      year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
    });
    return `${row.amount > 0 ? '📥' : '📤'} ${row.description}\n   ${amount} coins · ${date}\n   Balance: ${fmt(row.balance_after)}`;
  });
  return `💰 COIN HISTORY · LAST ${rows.length}\n\n${lines.join('\n\n')}`;
}

function formatStats() {
  const s = totals();
  const fmt = n => Number(n || 0).toLocaleString('en-US');
  return [
    '📊 AGU ECONOMY STATS',
    '',
    `💰 Coins in player wallets: ${fmt(s.circulation)}`,
    `📥 Gross credits (24h): ${fmt(s.last24h.gross_credits)}`,
    `📤 Gross debits (24h): ${fmt(s.last24h.gross_debits)}`,
    `⚖️ Net balance change (24h): ${fmt(s.last24h.net_change)}`,
    `🧾 Ledger entries (24h): ${fmt(s.last24h.entries)}`,
    `📚 Ledger entries (all time): ${fmt(s.allTime.entries)}`,
    '',
    'Credits/debits are gross wallet movements; player transfers and robberies are included in both sides.',
    'The ledger records transactions from deployment onward.'
  ].join('\n');
}

function formatCategories(direction) {
  const rows = categoryTotals(direction);
  const fmt = n => Number(n || 0).toLocaleString('en-US');
  const title = direction === 'sources' ? '📥 COIN CREDITS BY CATEGORY (24H)' : '📤 COIN DEBITS BY CATEGORY (24H)';
  if (!rows.length) return `${title}\n\nNo transactions recorded in this period.`;
  return `${title}\n\n${rows.map(r => `${r.category}\n  Credits: ${fmt(r.credits)} · Debits: ${fmt(r.debits)} · Net: ${fmt(r.net)} (${r.transactions} entries)`).join('\n\n')}`;
}

module.exports = { recordBalanceChange, history, totals, categoryTotals, formatHistory, formatStats, formatCategories };

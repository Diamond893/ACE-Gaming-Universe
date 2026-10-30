'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nyx-coin-ledger-'));
process.env.AGU_DATABASE_PATH = path.join(tempDir, 'agu.db');

const { db } = require('../src/database/connection');
const { savePlayer } = require('../src/database/aguStore');
const ledger = require('../src/economy/coinLedger');

const account = {
  id: 'whatsapp:tester',
  gameId: 'AGU-0123456789AB',
  name: 'Ledger Test',
  coins: 100
};

db.prepare('INSERT INTO players (id, game_id, payload) VALUES (?, ?, ?)').run(
  account.id, account.gameId, JSON.stringify(account)
);

test('records a wallet debit and resulting balance', () => {
  const updated = { ...account, coins: 75 };
  savePlayer(updated, {
    category: 'test',
    description: 'Test debit',
    transactionId: 'test-transaction-1'
  });

  const rows = ledger.history(account.gameId, 10);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, -25);
  assert.equal(rows[0].balance_after, 75);
  assert.equal(rows[0].category, 'test');
  assert.equal(rows[0].description, 'Test debit');
  assert.equal(rows[0].transaction_id, 'test-transaction-1');
});

test('does not record a ledger row when the balance is unchanged', () => {
  savePlayer({ ...account, coins: 75 });
  assert.equal(ledger.history(account.gameId, 10).length, 1);
});

test('rolls back a balance update if ledger insertion fails', () => {
  db.exec(`
    CREATE TRIGGER fail_coin_ledger_insert
    BEFORE INSERT ON coin_ledger
    BEGIN
      SELECT RAISE(ABORT, 'forced ledger failure');
    END;
  `);

  assert.throws(() => savePlayer({ ...account, coins: 60 }), /forced ledger failure/);
  const stored = JSON.parse(db.prepare('SELECT payload FROM players WHERE game_id = ?').get(account.gameId).payload);
  assert.equal(stored.coins, 75);
  assert.equal(ledger.history(account.gameId, 10).length, 1);
  db.exec('DROP TRIGGER fail_coin_ledger_insert');
});

test.after(() => {
  db.close();
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(path.join(tempDir, `agu.db${suffix}`)); } catch {}
  }
  try { fs.rmdirSync(tempDir); } catch {}
});

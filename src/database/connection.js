'use strict';
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const dbPath = process.env.AGU_DATABASE_PATH || path.resolve(__dirname, '../../data/agu.db');
fs.mkdirSync(path.dirname(dbPath), {recursive:true});
const db = new Database(dbPath, {timeout:10000});
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 10000');
db.pragma('foreign_keys = ON');
db.exec(`
 CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, game_id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS identities (identity_key TEXT PRIMARY KEY, game_id TEXT NOT NULL REFERENCES players(game_id));
 CREATE INDEX IF NOT EXISTS identity_account_idx ON identities(game_id);
 CREATE TABLE IF NOT EXISTS pending_links (destination_key TEXT PRIMARY KEY, game_id TEXT NOT NULL REFERENCES players(game_id), destination_platform TEXT NOT NULL, destination_id TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS pending_account_idx ON pending_links(game_id);
 CREATE TABLE IF NOT EXISTS communities (platform TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0, joined_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(platform,id));
 CREATE TABLE IF NOT EXISTS collections (game_id TEXT PRIMARY KEY REFERENCES players(game_id), payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS broadcasts (id TEXT PRIMARY KEY, message TEXT NOT NULL, tag_all INTEGER NOT NULL, created_at TEXT NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0, confirmed_at TEXT);
 CREATE TABLE IF NOT EXISTS broadcast_targets (job_id TEXT NOT NULL REFERENCES broadcasts(id), platform TEXT NOT NULL, id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', claimed_at INTEGER, completed_at TEXT, details TEXT NOT NULL DEFAULT '', PRIMARY KEY(job_id,platform,id));
 CREATE TABLE IF NOT EXISTS backup_claims (date TEXT PRIMARY KEY);
`);
// START an immediate write transaction to serialize read-modify-write across both bot processes.
function atomic(fn) { return db.transaction(fn).immediate(); }
function withTransaction(fn) { return function(...args) { return db.transaction(() => fn(...args)).immediate(); }; }
module.exports = { db, dbPath, atomic, withTransaction };

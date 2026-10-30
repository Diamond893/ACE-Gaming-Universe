'use strict';
const fs = require('fs');
const path = require('path');
const { db, dbPath } = require('./connection');
const backupDir = process.env.AGU_BACKUP_DIR || path.join(path.dirname(dbPath), 'backups');
const date = () => new Date().toISOString().slice(0,10);
async function backupNow() {
  fs.mkdirSync(backupDir,{recursive:true});
  const destination = path.join(backupDir, `agu-${new Date().toISOString().replace(/[:.]/g,'-')}-${process.pid}.db`);
  await db.backup(destination);
  const files = fs.readdirSync(backupDir).filter(n => /^agu-\d{4}-\d{2}-\d{2}.*\.db$/.test(n)).sort().reverse();
  for (const stale of files.slice(30)) fs.unlinkSync(path.join(backupDir, stale));
  return destination;
}
function startDailyBackups() {
  async function attempt() {
    const today = date();
    const result = db.prepare('INSERT OR IGNORE INTO backup_claims(date) VALUES (?)').run(today);
    if (!result.changes) return;
    try { console.log('✅ AGU SQLite backup:', await backupNow()); }
    catch (err) { db.prepare('DELETE FROM backup_claims WHERE date = ?').run(today); console.error('AGU database backup failed:', err); }
  }
  // Wait for startup to settle, then check once an hour while bots are online.
  const timer = setInterval(() => attempt().catch(console.error), 60*60*1000);
  timer.unref?.();
  setTimeout(() => attempt().catch(console.error), 5000).unref?.();
}
module.exports = {backupNow,startDailyBackups};

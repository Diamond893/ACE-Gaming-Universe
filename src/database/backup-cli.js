const { backupNow } = require('./backup');
backupNow().then(f => console.log('✅ Backup saved:',f)).catch(e => {console.error(e);process.exitCode=1;});

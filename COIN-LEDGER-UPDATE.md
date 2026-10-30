# NYX Coin Ledger source update

Based on the uploaded `Nyx.zip`.

Included:
- New `src/economy/coinLedger.js` module and documentation.
- Automatic coin-balance change recording in the existing `savePlayers` and `savePlayer` persistence paths.
- Atomic wallet-write + ledger-entry behaviour.
- `.coinhistory [1-100]` (10 by default, one message).
- Admin/owner-only `.coinlogs <AGU-ID> [1-100]`.
- Admin/owner-only `.economy [stats|sources|sinks]`.
- A focused `tests/coin-ledger.test.js` and `npm run test:coin-ledger`.
- Agreed corrections: referral qualification uses 3 active days; auction opening bid uses the configured 30% factor consistently.

Important:
- No historical backfill is performed. Existing balances remain as-is; recording begins after deployment.
- The ledger table is created automatically at startup/module load. No player-data migration is performed.
- The nested `data.zip` from the uploaded archive is intentionally omitted from this source update because it contains the database/private data. Keep your original data backup separately and do not publish it to GitHub.
- All JavaScript files passed `node --check`.
- The runtime test could not be executed in this environment because `better-sqlite3` is not installed here. After restoring the project on a PC, run `npm install` and `npm run test:coin-ledger`.

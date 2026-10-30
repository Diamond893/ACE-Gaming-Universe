# NYX Coin Ledger

This update adds a persistent coin transaction ledger to the existing AGU SQLite database.

## Commands
- `.coinhistory` — latest 10 transactions for the caller's AGU account.
- `.coinhistory <1-100>` — chosen number of recent transactions in one message.
- `.coinlogs <AGU-ID> [1-100]` — admin/owner-only player history.
- `.economy [stats|sources|sinks]` — admin/owner-only economy summary and gross wallet movement categories.

## Recording behaviour
- The ledger table is created automatically when the module is loaded. There is no historical backfill.
- Existing wallet balances are not changed.
- Existing player-save functions compare the stored balance with the new balance and append a ledger row only when the balance changes.
- Balance updates and ledger inserts happen in the same SQLite transaction. If recording fails, the wallet write rolls back.
- New registrations receive a ledger entry for their starting balance.
- Existing players start with no old history; records begin when the updated code is deployed.
- The ledger stores AGU game IDs, not platform-specific sender IDs, so linked WhatsApp/Discord identities share the same history.

## Verification
Run `npm install`, then `npm run test:coin-ledger`.
The test verifies debit recording, unchanged-balance handling, and rollback if the ledger insert fails.

The general project test script was not replaced because the archive contains pre-existing tests for other project areas.

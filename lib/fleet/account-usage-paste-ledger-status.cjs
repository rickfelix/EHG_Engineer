// QF-20260902-914: account_usage_pastes has been ABSENT since 2026-08-28 -- the chairman-gated
// migration database/migrations/20260828_account_usage_paste_ledger.sql was never applied. A
// PostgREST "table not found in schema cache" (PGRST205) error is textually indistinguishable
// from a transient cache miss, which is why the paste writer and the burn-projection CLI both
// rendered a generic "unavailable" for five days instead of naming the real cause. Same detector
// string already used by scripts/cron/chairman-held-sends-release-sweep.mjs for a different
// unapplied table -- reused here rather than re-derived.
'use strict';

const MIGRATION_PATH = 'database/migrations/20260828_account_usage_paste_ledger.sql';

/** @param {{message?:string}|string|null|undefined} error */
function isPasteLedgerMissingError(error) {
  const message = typeof error === 'string' ? error : (error && error.message) || '';
  return /schema cache|does not exist/i.test(message);
}

function pasteLedgerMissingMessage() {
  return `account_usage_pastes table is absent -- ${MIGRATION_PATH} has not been applied. ` +
    'This is a CHAIRMAN-ONLY ceremony apply (CLAUDE_ADAM.md 3b/3c), not a worker fix.';
}

module.exports = { isPasteLedgerMissingError, pasteLedgerMissingMessage, MIGRATION_PATH };

-- SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-A / Finding 2 — rollback companion.
-- Reverses 20260614_role_handoff_atomic_coordinator_flag.sql by dropping the two atomic
-- coordinator-flag RPCs. Additive migration → clean reversal, no data to restore. After this
-- DOWN runs, lib/coordinator/resolve.cjs falls back to its fail-open JS path (the .rpc() call
-- errors → console.warn → fail-open), so teardown/identity still works (just without the
-- atomic-merge race protection).

DROP FUNCTION IF EXISTS clear_coordinator_flag(TEXT);
DROP FUNCTION IF EXISTS set_coordinator_flag(TEXT);

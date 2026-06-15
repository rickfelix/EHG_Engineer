-- SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-C / FR-2 — rollback companion.
-- Reverses 20260615_role_handoff_atomic_adam_flag.sql by dropping the two atomic Adam-flag RPCs.
-- Additive migration → clean reversal, no data to restore. After this DOWN runs, the FR-3
-- adam-register writer falls back to its fail-open JS path (the .rpc() call errors → fail-soft),
-- so registration still works (just without the atomic-merge race protection).

DROP FUNCTION IF EXISTS clear_adam_flag(TEXT);
DROP FUNCTION IF EXISTS set_adam_flag(TEXT);

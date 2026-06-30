-- SD-LEO-INFRA-SOLOMON-CONSULT-001A (Solomon foundation) — faithful copy-rename of 20260615_role_handoff_atomic_adam_flag_DOWN.sql
-- Reverses 20260630_role_handoff_atomic_solomon_flag.sql by dropping the two atomic Solomon-flag RPCs.
-- Additive migration → clean reversal, no data to restore. After this DOWN runs, the Phase A
-- solomon-register writer falls back to its fail-open JS path (the .rpc() call errors → fail-soft),
-- so registration still works (just without the atomic-merge race protection).

DROP FUNCTION IF EXISTS clear_solomon_flag(TEXT);
DROP FUNCTION IF EXISTS set_solomon_flag(TEXT);

-- SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A (Michael foundation, FR-1) — copy-rename of
-- 20260630_role_handoff_atomic_solomon_flag_DOWN.sql.
-- Reverses 20260906_role_handoff_atomic_michael_flag.sql by dropping the two atomic Michael-flag RPCs.
-- Additive migration → clean reversal, no data to restore. After this DOWN runs, the
-- michael-register writer falls back to its fail-soft JS path (the .rpc() call errors → fail-soft),
-- so registration still works (just without the atomic-merge race protection).

DROP FUNCTION IF EXISTS clear_michael_flag(TEXT);
DROP FUNCTION IF EXISTS set_michael_flag(TEXT);

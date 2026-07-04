-- solomon_advice_outcome_ledger -- enforcement-caveat follow-up to the closer-of-record column comments.
-- SD-LEO-INFRA-REWARD-SPINE-ONE-001-B.
--
-- Adversarial code review found the original column-comment text (shipped in
-- 20260704_solomon_ledger_closer_of_record.sql, applied 2026-07-04) incomplete: it did
-- not state that closed_by/closed_at are NOT enforced by a CHECK constraint and that only
-- the reconcile script's auto-close path is guaranteed to stamp them. This migration
-- re-states both column comments with that enforcement caveat.
--
-- COMMENT ON is idempotent; this migration makes no schema or data change. The original
-- applied migration is intentionally NOT edited-and-re-run: apply-migration's prod-deploy
-- TAMPERED guard rejects re-pointing at an already-applied path whose sha256 changed
-- (migration-immutability contract). A forward migration is the governed way to revise
-- comment text after the fact.
--
-- @approved-by: codestreetlabs@gmail.com

COMMENT ON COLUMN solomon_advice_outcome_ledger.closed_by IS 'Identifies the mechanism/actor that set `outcome` away from unknown (e.g. ''solomon-ledger-reconcile.cjs'' for an auto-close, or a human identifier for a manual caused_rework judgment). NULL until closed. NOT enforced by a CHECK constraint -- a manual update to `outcome` can leave this NULL; only the reconcile script''s auto-close path is guaranteed to stamp it. SD-LEO-INFRA-REWARD-SPINE-ONE-001-B.';
COMMENT ON COLUMN solomon_advice_outcome_ledger.closed_at IS 'Timestamp `outcome` was set away from unknown. NULL until closed. Same enforcement caveat as closed_by. SD-LEO-INFRA-REWARD-SPINE-ONE-001-B.';

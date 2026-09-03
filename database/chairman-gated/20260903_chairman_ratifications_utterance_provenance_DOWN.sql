-- @chairman-gated
-- @approved-by: PENDING — rollback for 20260903_chairman_ratifications_utterance_provenance.sql.
-- Applying it requires the same two-invocation ceremony as the forward migration.
-- SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-D
--
-- ORDER MATTERS: drop the constraint BEFORE the columns it references, otherwise the DROP COLUMN
-- would have to cascade to remove it and a CASCADE here could silently take dependent objects a
-- future reader did not intend.
--
-- This rollback is LOSSY BY CONSTRUCTION and that is worth stating plainly rather than discovering
-- later: dropping these columns discards every uttered_at / quote_hash / transcript_ref value
-- recorded since the forward migration applied. Those values are the provenance the forward
-- migration exists to capture, and the append-only freeze trigger means they cannot be
-- reconstructed from the surviving row. Do not run this to "reset and re-apply" once real
-- ratifications have been written against it.

ALTER TABLE chairman_ratifications
  DROP CONSTRAINT IF EXISTS cr_utterance_provenance_present;

ALTER TABLE chairman_ratifications
  DROP COLUMN IF EXISTS transcript_ref;

ALTER TABLE chairman_ratifications
  DROP COLUMN IF EXISTS quote_hash;

ALTER TABLE chairman_ratifications
  DROP COLUMN IF EXISTS uttered_at;

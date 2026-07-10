-- SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001 (FR-2)
--
-- Adds a transport-receipt timestamp distinct from read_at. read_at is
-- reserved for genuine action-required surfacing of a row (per the existing
-- DIRECTIVE_KINDS deliver-not-consume semantics documented in
-- scripts/hooks/coordination-inbox.cjs); delivered_at captures "a consumer's
-- process saw this row exist" (poll/list/render) without implying it was
-- processed. Additive only -- nullable, no default, NO BACKFILL of historical
-- rows (11,202+ existing rows keep delivered_at = NULL; the gap is
-- intentional and documented, not retroactively fabricated).
ALTER TABLE session_coordination
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

COMMENT ON COLUMN session_coordination.delivered_at IS
  'Transport receipt: a consumer''s process saw this row (poll/list/render). '
  'Distinct from read_at, which is reserved for genuine action-required '
  'surfacing. No backfill for historical rows. SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001';

-- ============================================================================
-- SD-MAN-FIX-FIX-ADVANCE-VENTURE-001
-- Drop redundant 4-param overload of fn_advance_venture_stage
-- ============================================================================
-- The 20260406_add_artifact_gate migration created both a 4-param and 5-param
-- overload. PostgREST cannot disambiguate between them when callers send 4
-- params because the 5-param version has DEFAULT values on trailing params.
-- The 5-param version (with p_idempotency_key UUID DEFAULT NULL) is the
-- canonical one — it has FOR UPDATE lock, idempotency, artifact gate, and
-- correct column names. The 4-param version is redundant and buggy.
-- ============================================================================

-- Drop the redundant 4-param overload
DROP FUNCTION IF EXISTS fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB);

-- Revoke any lingering grants on the 4-param signature (no-op if already gone)
-- The 5-param version retains its grants from the earlier migration.

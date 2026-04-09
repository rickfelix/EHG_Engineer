-- ============================================================================
-- SD-LEO-INFRA-UNIFIED-GATE-ENFORCEMENT-001 (follow-up fix)
-- Drop redundant 4-param overload of fn_advance_venture_stage
-- ============================================================================
-- The 5-param version (with p_idempotency_key UUID DEFAULT NULL) is a strict
-- superset. Having both causes PostgREST "Could not choose best candidate
-- function" ambiguity when called via .rpc() without idempotency_key.
-- This bypasses all unified gate enforcement (review-mode, kill, promotion).
-- ============================================================================

DROP FUNCTION IF EXISTS fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB);

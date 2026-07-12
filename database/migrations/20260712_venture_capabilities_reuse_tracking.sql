-- SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-E FR-3: extend venture_capabilities with reuse
-- tracking instead of creating a new venture_capability_ledger table.
--
-- PLAN-TO-EXEC CORRECTION (independently corroborated by DESIGN + DATABASE sub-agents):
-- venture_capabilities already exists live (built by SD-STAGE0-ENVELOPE-REGISTRATION-001,
-- feeds the Stage-0 R6 capability envelope this satellite was meant to feed) with columns
-- name/origin_venture_id/origin_sd_key/capability_type/evidence/consumers/reusability_score.
-- Creating a parallel venture_capability_ledger table would duplicate this SSOT (architecture
-- doc Sec8 consume-not-rebuild violation). This migration extends the existing table in
-- place.
--
-- Mirrors fn_record_capability_reuse()'s existing shape on the ENGINEERING-capability
-- fabric (sd_capabilities/capability_reuse_log): reuse_count (int) + last_reused_at
-- (timestamptz) with NO separate stored decay column -- decay is read-derived from
-- last_reused_at recency, matching the established pattern exactly.
--
-- RLS is already ENABLED on venture_capabilities (3 existing service_role-scoped policies,
-- live-verified) -- ALTER TABLE ADD COLUMN does not require new RLS statements; the
-- existing policies already cover these new columns.

ALTER TABLE venture_capabilities
  ADD COLUMN IF NOT EXISTS reuse_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reused_at TIMESTAMPTZ;

COMMENT ON COLUMN venture_capabilities.reuse_count IS 'FR-3 (SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-E): incremented on each recordCapabilityReuse() call. Mirrors fn_record_capability_reuse pattern on sd_capabilities.';
COMMENT ON COLUMN venture_capabilities.last_reused_at IS 'FR-3 (SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-E): recency of last reuse. Decay is read-derived from this timestamp, not stored -- guard: extraction honesty (a capability with no second consumer within N ventures decays to reference, not asset).';

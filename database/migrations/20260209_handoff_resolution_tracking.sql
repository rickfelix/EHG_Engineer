-- Migration: Add resolution tracking to sd_phase_handoffs
-- RCA: RCA-MULTI-SESSION-CASCADE-001
-- Purpose: Allow rejected/failed handoffs to be marked as resolved
-- instead of permanently blocking future handoff attempts.
--
-- The transition readiness gate should check for UNRESOLVED failures,
-- not ALL historical failures. This enables a proper failure lifecycle:
-- rejected → under_investigation → fix_applied → resolved

-- Add resolution tracking columns
ALTER TABLE sd_phase_handoffs ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE sd_phase_handoffs ADD COLUMN IF NOT EXISTS resolution_type TEXT;
ALTER TABLE sd_phase_handoffs ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

-- Add constraint for valid resolution types
-- DO NOT add constraint yet - let it be freeform initially
-- Types: infrastructure_fix, code_fix, config_change, false_positive, manual_override

-- Resolve all cascaded failures from the multi-session claim conflict
-- These were caused by unstable Windows terminal_id (ppid → console session ID fix)
UPDATE sd_phase_handoffs
SET
  resolved_at = NOW(),
  resolution_type = 'infrastructure_fix',
  resolution_notes = 'RCA-MULTI-SESSION-CASCADE-001: Windows terminal_id stabilized from process.ppid to console session ID. False positives caused by ppid changing per subprocess.'
WHERE
  status IN ('rejected', 'failed', 'blocked')
  AND resolved_at IS NULL
  AND (
    rejection_reason LIKE '%claimed by another active session%'
    OR rejection_reason LIKE '%GATE_MULTI_SESSION_CLAIM_CONFLICT%'
    OR rejection_reason LIKE '%GATE_SD_TRANSITION_READINESS%claimed by another%'
  );

-- Add index for efficient resolution queries
CREATE INDEX IF NOT EXISTS idx_sd_phase_handoffs_unresolved
ON sd_phase_handoffs (sd_id, handoff_type, status)
WHERE resolved_at IS NULL AND status IN ('rejected', 'failed', 'blocked');

-- ============================================================================
-- Migration: Disable GATE_VISION_SCORE for bugfix SDs at LEAD-TO-PLAN
-- SD: SD-LEO-INFRA-VISION-GATE-BUGFIX-EXEMPTION-001
-- Date: 2026-02-19
--
-- Context: During Round 3 orchestrator setup, 3 bugfix-type child SDs were
-- blocked at LEAD-TO-PLAN by GATE_VISION_SCORE_FAILED. Infrastructure SDs
-- already have a DISABLED entry in validation_gate_registry for this gate.
-- Bugfix SDs share the same rationale: they correct broken behavior and
-- should not require a pre-existing vision alignment score.
--
-- This adds a matching DISABLED entry for sd_type='bugfix'.
--
-- ROLLBACK: DELETE FROM validation_gate_registry
--           WHERE gate_key = 'GATE_VISION_SCORE' AND sd_type = 'bugfix';
-- ============================================================================

INSERT INTO validation_gate_registry (gate_key, sd_type, applicability, reason)
VALUES (
  'GATE_VISION_SCORE',
  'bugfix',
  'DISABLED',
  'Bugfix SDs correct broken behavior and should not be blocked by pre-existing vision score requirements. Matches infrastructure exemption policy. Added by SD-LEO-INFRA-VISION-GATE-BUGFIX-EXEMPTION-001.'
)
ON CONFLICT DO NOTHING;

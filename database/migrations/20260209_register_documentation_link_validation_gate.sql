-- Migration: Register GATE_DOCUMENTATION_LINK_VALIDATION in validation_gate_registry
-- SD: SD-LEO-ORCH-QUALITY-GATE-ENHANCEMENTS-001-D
-- Date: 2026-02-09
--
-- This gate scans markdown files changed in the current branch, extracts relative
-- file links, and checks that each referenced path exists on disk.
-- BLOCKING (REQUIRED) for sd_type=documentation/docs, ADVISORY (OPTIONAL) for all other types.

-- Register per SD type (matches existing table pattern)
INSERT INTO validation_gate_registry (gate_key, sd_type, applicability, reason)
VALUES
  ('GATE_DOCUMENTATION_LINK_VALIDATION', 'documentation', 'REQUIRED', 'Documentation SDs require all file links to be valid (BLOCKING)'),
  ('GATE_DOCUMENTATION_LINK_VALIDATION', 'docs', 'REQUIRED', 'Docs SDs require all file links to be valid (BLOCKING)'),
  ('GATE_DOCUMENTATION_LINK_VALIDATION', 'feature', 'OPTIONAL', 'Advisory check for file link validity'),
  ('GATE_DOCUMENTATION_LINK_VALIDATION', 'bugfix', 'OPTIONAL', 'Advisory check for file link validity'),
  ('GATE_DOCUMENTATION_LINK_VALIDATION', 'security', 'OPTIONAL', 'Advisory check for file link validity'),
  ('GATE_DOCUMENTATION_LINK_VALIDATION', 'infrastructure', 'OPTIONAL', 'Advisory check for file link validity'),
  ('GATE_DOCUMENTATION_LINK_VALIDATION', 'refactor', 'OPTIONAL', 'Advisory check for file link validity'),
  ('GATE_DOCUMENTATION_LINK_VALIDATION', 'enhancement', 'OPTIONAL', 'Advisory check for file link validity'),
  ('GATE_DOCUMENTATION_LINK_VALIDATION', 'orchestrator', 'OPTIONAL', 'Advisory check for file link validity'),
  ('GATE_DOCUMENTATION_LINK_VALIDATION', 'uat', 'OPTIONAL', 'Advisory check for file link validity'),
  ('GATE_DOCUMENTATION_LINK_VALIDATION', 'database', 'OPTIONAL', 'Advisory check for file link validity'),
  ('GATE_DOCUMENTATION_LINK_VALIDATION', 'process', 'OPTIONAL', 'Advisory check for file link validity')
ON CONFLICT (gate_key, COALESCE(sd_type, '*'), COALESCE(validation_profile, '*'))
DO NOTHING;

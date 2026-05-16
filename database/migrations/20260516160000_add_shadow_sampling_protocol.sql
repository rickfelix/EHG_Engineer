-- Sibling F FR-F-1 + FR-F-5: app_config rows for shadow-sampling protocol + parent unblock signal scaffold.
-- Ordinal 20260516160000 strictly > Sibling D 20260516150001 (in main via PR #3791). ADDITIVE-ONLY.

INSERT INTO app_config (key, value, description)
VALUES (
  'child_f_shadow_sampling_protocol',
  '{"protocol_version":"1.0.0","lineage_attribution_confidence_storage":"number","pre_registered_at":null,"requires_pre_registration":true}'::jsonb,
  'Sibling F (SD-WRITERCONSUMER-...-001-F) shadow-sampling protocol — confidence stored as NUMBER not boolean per CRO Residual Risk #1. pre_registered_at populated BEFORE any new lineage write (temporal invariant).'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_config (key, value, description)
VALUES (
  'child_f_completed',
  '{"signal_at":null,"sd_key":"SD-WRITERCONSUMER-ASYMMETRY-DETECTION-SCOPECOMPLETION-ORCH-001-F","status":"pending"}'::jsonb,
  'Sibling F parent unblock signal scaffold (FR-F-5). signal_at populated at LEAD-FINAL-APPROVAL by _signal-sibling-f-completed.mjs. Parent orchestrator PLAN-TO-LEAD reads this row.'
)
ON CONFLICT (key) DO NOTHING;

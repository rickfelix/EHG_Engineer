-- Sibling D FR-D-2: D-app feature flag in app_config (D-app week 8 cohort, default OFF)
-- Ordinal 20260516150001 > FR-D-1.

INSERT INTO app_config (key, value, description)
VALUES (
  'contract_chain_d_app_enabled',
  '{"enabled": false, "reason": "D-app week 8 cohort — feature flag default OFF until week 8 activation per parent D-SCHEMA-D-APP-FEATURE-FLAG prd_condition", "flipped_at": null}'::jsonb,
  'Sibling D (SD-WRITERCONSUMER-...-001-D) D-app activation feature flag. Walker module short-circuits when enabled=false.'
)
ON CONFLICT (key) DO NOTHING;

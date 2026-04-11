-- SD-MAN-FIX-S15-DESIGN-STUDIO-001: Set per-stage timeout override for S15
-- S15 Design Studio uniquely runs 4 LLM sub-steps + Stitch screen generation,
-- requiring 600s vs the 300s global default.
UPDATE lifecycle_stage_config
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"stage_timeout_ms": 600000}'::jsonb
WHERE stage_number = 15;

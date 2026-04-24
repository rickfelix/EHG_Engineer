-- SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-127 — Phase 0
-- Add prd_minimum_score column to sd_type_validation_profiles.
-- Canonical source of sd_type-aware PRD threshold, consumed by
-- scripts/modules/handoff/verifiers/plan-to-exec/prd-validation.js (FR-3).
-- Thresholds mirror CLAUDE_CORE.md "SD Type-Aware Workflow Paths".

ALTER TABLE sd_type_validation_profiles
  ADD COLUMN IF NOT EXISTS prd_minimum_score NUMERIC
  CHECK (prd_minimum_score BETWEEN 0 AND 100);

UPDATE sd_type_validation_profiles SET prd_minimum_score = 85 WHERE sd_type = 'feature'         AND prd_minimum_score IS NULL;
UPDATE sd_type_validation_profiles SET prd_minimum_score = 85 WHERE sd_type = 'bugfix'          AND prd_minimum_score IS NULL;
UPDATE sd_type_validation_profiles SET prd_minimum_score = 85 WHERE sd_type = 'database'        AND prd_minimum_score IS NULL;
UPDATE sd_type_validation_profiles SET prd_minimum_score = 90 WHERE sd_type = 'security'        AND prd_minimum_score IS NULL;
UPDATE sd_type_validation_profiles SET prd_minimum_score = 80 WHERE sd_type = 'refactor'        AND prd_minimum_score IS NULL;
UPDATE sd_type_validation_profiles SET prd_minimum_score = 80 WHERE sd_type = 'infrastructure'  AND prd_minimum_score IS NULL;
UPDATE sd_type_validation_profiles SET prd_minimum_score = 60 WHERE sd_type = 'documentation'   AND prd_minimum_score IS NULL;
UPDATE sd_type_validation_profiles SET prd_minimum_score = 70 WHERE sd_type = 'orchestrator'    AND prd_minimum_score IS NULL;
UPDATE sd_type_validation_profiles SET prd_minimum_score = 75 WHERE sd_type = 'enhancement'     AND prd_minimum_score IS NULL;
UPDATE sd_type_validation_profiles SET prd_minimum_score = 85 WHERE sd_type = 'performance'     AND prd_minimum_score IS NULL;
UPDATE sd_type_validation_profiles SET prd_minimum_score = 60 WHERE sd_type = 'docs'            AND prd_minimum_score IS NULL;
UPDATE sd_type_validation_profiles SET prd_minimum_score = 85 WHERE sd_type = 'qa'              AND prd_minimum_score IS NULL;
UPDATE sd_type_validation_profiles SET prd_minimum_score = 75 WHERE sd_type = 'ux_debt'         AND prd_minimum_score IS NULL;
UPDATE sd_type_validation_profiles SET prd_minimum_score = 70 WHERE sd_type = 'quick_fix'       AND prd_minimum_score IS NULL;
UPDATE sd_type_validation_profiles SET prd_minimum_score = 85 WHERE sd_type = 'frontend'        AND prd_minimum_score IS NULL;
UPDATE sd_type_validation_profiles SET prd_minimum_score = 85 WHERE sd_type = 'fix'             AND prd_minimum_score IS NULL;
UPDATE sd_type_validation_profiles SET prd_minimum_score = 85 WHERE sd_type = 'testing'         AND prd_minimum_score IS NULL;
UPDATE sd_type_validation_profiles SET prd_minimum_score = 70 WHERE sd_type = 'uat'             AND prd_minimum_score IS NULL;

-- Verification: all rows non-null
-- SELECT sd_type, prd_minimum_score FROM sd_type_validation_profiles ORDER BY sd_type;

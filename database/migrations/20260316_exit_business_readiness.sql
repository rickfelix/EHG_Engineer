-- Migration: Add business readiness metrics to venture_exit_readiness
-- SD: SD-LEO-INFRA-EXIT-BUSINESS-READINESS-001
-- Date: 2026-03-16
-- Description: Adds 10 columns for ARR tracking, customer counts, growth rates,
--              market multiples, and readiness scoring with chairman escalation.
-- Safety: Table has 0 rows, all changes are additive (ADD COLUMN).

BEGIN;

-- 1. Target Annual Recurring Revenue
ALTER TABLE venture_exit_readiness
  ADD COLUMN IF NOT EXISTS target_arr NUMERIC;

COMMENT ON COLUMN venture_exit_readiness.target_arr
  IS 'Target Annual Recurring Revenue in USD';

-- 2. Actual ARR
ALTER TABLE venture_exit_readiness
  ADD COLUMN IF NOT EXISTS actual_arr NUMERIC;

COMMENT ON COLUMN venture_exit_readiness.actual_arr
  IS 'Actual Annual Recurring Revenue in USD';

-- 3. Target customer count
ALTER TABLE venture_exit_readiness
  ADD COLUMN IF NOT EXISTS target_customer_count INTEGER;

COMMENT ON COLUMN venture_exit_readiness.target_customer_count
  IS 'Target number of customers for exit readiness';

-- 4. Actual customer count
ALTER TABLE venture_exit_readiness
  ADD COLUMN IF NOT EXISTS actual_customer_count INTEGER;

COMMENT ON COLUMN venture_exit_readiness.actual_customer_count
  IS 'Current actual number of customers';

-- 5. Target growth rate (decimal, e.g., 0.20 for 20%)
ALTER TABLE venture_exit_readiness
  ADD COLUMN IF NOT EXISTS growth_rate_target NUMERIC;

COMMENT ON COLUMN venture_exit_readiness.growth_rate_target
  IS 'Target growth rate as decimal (e.g., 0.20 = 20%)';

-- 6. Actual growth rate
ALTER TABLE venture_exit_readiness
  ADD COLUMN IF NOT EXISTS growth_rate_actual NUMERIC;

COMMENT ON COLUMN venture_exit_readiness.growth_rate_actual
  IS 'Actual growth rate as decimal (e.g., 0.15 = 15%)';

-- 7. Current market multiple for the sector
ALTER TABLE venture_exit_readiness
  ADD COLUMN IF NOT EXISTS market_multiple_current NUMERIC;

COMMENT ON COLUMN venture_exit_readiness.market_multiple_current
  IS 'Current market revenue multiple for the venture sector';

-- 8. Computed readiness score (0-100)
ALTER TABLE venture_exit_readiness
  ADD COLUMN IF NOT EXISTS readiness_score NUMERIC DEFAULT 0;

COMMENT ON COLUMN venture_exit_readiness.readiness_score
  IS 'Computed business readiness score (0-100)';

-- 9. Per-venture threshold for chairman escalation
ALTER TABLE venture_exit_readiness
  ADD COLUMN IF NOT EXISTS readiness_threshold NUMERIC DEFAULT 70;

COMMENT ON COLUMN venture_exit_readiness.readiness_threshold
  IS 'Score threshold that triggers chairman review escalation';

-- 10. Chairman review trigger flag
ALTER TABLE venture_exit_readiness
  ADD COLUMN IF NOT EXISTS chairman_review_triggered BOOLEAN DEFAULT false;

COMMENT ON COLUMN venture_exit_readiness.chairman_review_triggered
  IS 'Set true when readiness_score exceeds threshold for 2+ consecutive periods';

COMMIT;

-- Rollback SQL (manual use only):
-- ALTER TABLE venture_exit_readiness DROP COLUMN IF EXISTS target_arr;
-- ALTER TABLE venture_exit_readiness DROP COLUMN IF EXISTS actual_arr;
-- ALTER TABLE venture_exit_readiness DROP COLUMN IF EXISTS target_customer_count;
-- ALTER TABLE venture_exit_readiness DROP COLUMN IF EXISTS actual_customer_count;
-- ALTER TABLE venture_exit_readiness DROP COLUMN IF EXISTS growth_rate_target;
-- ALTER TABLE venture_exit_readiness DROP COLUMN IF EXISTS growth_rate_actual;
-- ALTER TABLE venture_exit_readiness DROP COLUMN IF EXISTS market_multiple_current;
-- ALTER TABLE venture_exit_readiness DROP COLUMN IF EXISTS readiness_score;
-- ALTER TABLE venture_exit_readiness DROP COLUMN IF EXISTS readiness_threshold;
-- ALTER TABLE venture_exit_readiness DROP COLUMN IF EXISTS chairman_review_triggered;

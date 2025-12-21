-- SD-UX-NAV-002: Sidebar Strategic Cleanse
-- Add health metrics columns to ventures table for the Venture Pulse radar widget
-- Date: 2025-12-21

-- Add health_score column (0.0-1.0)
ALTER TABLE ventures ADD COLUMN IF NOT EXISTS health_score DECIMAL(3,2) DEFAULT 0.5;

-- Add calibration_delta column (-1.0 to +1.0)
ALTER TABLE ventures ADD COLUMN IF NOT EXISTS calibration_delta DECIMAL(5,3) DEFAULT 0;

-- Add health_status column
ALTER TABLE ventures ADD COLUMN IF NOT EXISTS health_status VARCHAR(20)
  CHECK (health_status IN ('healthy', 'warning', 'critical'));

-- Create index for health-based sorting
CREATE INDEX IF NOT EXISTS idx_ventures_health_score ON ventures(health_score);

-- Update swarm ventures with their health values
UPDATE ventures SET
  health_score = 0.85,
  calibration_delta = 0.12,
  health_status = 'healthy'
WHERE id = '22222222-2222-2222-2222-222222222222';

UPDATE ventures SET
  health_score = 0.35,
  calibration_delta = -0.08,
  health_status = 'critical'
WHERE id = '33333333-3333-3333-3333-333333333333';

UPDATE ventures SET
  health_score = 0.78,
  calibration_delta = 0.15,
  health_status = 'healthy'
WHERE id = '44444444-4444-4444-4444-444444444444';

UPDATE ventures SET
  health_score = 0.82,
  calibration_delta = 0.22,
  health_status = 'healthy'
WHERE id = '55555555-5555-5555-5555-555555555555';

-- Verification query (run separately)
-- SELECT id, name, health_score, calibration_delta, health_status
-- FROM ventures
-- WHERE id IN (
--   '22222222-2222-2222-2222-222222222222',
--   '33333333-3333-3333-3333-333333333333',
--   '44444444-4444-4444-4444-444444444444',
--   '55555555-5555-5555-5555-555555555555'
-- );

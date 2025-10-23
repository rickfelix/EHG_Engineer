-- Complete SD-2025-1020-UDI by accepting handoffs and marking SD complete
-- Date: 2025-10-20
-- All work complete: code, tests, retrospective, verification

-- Step 1: Accept all handoffs for SD-2025-1020-UDI
UPDATE sd_phase_handoffs
SET status = 'accepted', accepted_at = NOW()
WHERE sd_id = 'SD-2025-1020-UDI'
  AND status = 'pending_acceptance';

-- Step 2: Mark SD as complete
UPDATE strategic_directives_v2
SET
  status = 'completed',
  progress = 100,
  current_phase = 'COMPLETED'
WHERE id = 'SD-2025-1020-UDI';

-- Verification: Check handoffs
SELECT
  'Handoff' as record_type,
  handoff_type,
  status,
  accepted_at::text as timestamp
FROM sd_phase_handoffs
WHERE sd_id = 'SD-2025-1020-UDI'
ORDER BY created_at;

-- Verification: Check SD status
SELECT
  'SD' as record_type,
  title as handoff_type,
  status,
  updated_at::text as timestamp
FROM strategic_directives_v2
WHERE id = 'SD-2025-1020-UDI';

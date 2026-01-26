-- Diagnostic: Check for mismatched UUID usage in sd_wall_states
-- Issue: Application code may be trying to use VARCHAR id instead of UUID uuid_id

-- 1. Verify schema is correct (sd_id should be UUID)
SELECT
  'sd_wall_states.sd_id type' AS check_name,
  data_type AS result
FROM information_schema.columns
WHERE table_name = 'sd_wall_states'
  AND column_name = 'sd_id';

-- 2. Verify foreign key relationship
SELECT
  'Foreign key constraint' AS check_name,
  conname AS constraint_name,
  confrelid::regclass AS references_table,
  af.attname AS references_column
FROM pg_constraint AS c
JOIN pg_attribute AS af ON af.attnum = ANY(c.confkey) AND af.attrelid = c.confrelid
WHERE c.contype = 'f'
  AND c.conrelid::regclass::text = 'sd_wall_states'
  AND c.conname = 'sd_wall_states_sd_id_fkey';

-- 3. Check if any wall states exist with sample data
SELECT
  'Sample wall state entries' AS check_name,
  COUNT(*) AS total_count
FROM sd_wall_states;

-- 4. Show example join between tables (how it SHOULD work)
SELECT
  'Example correct join' AS check_name,
  sd.id AS varchar_id,
  sd.uuid_id AS uuid_id,
  ws.sd_id AS wall_state_sd_id,
  ws.wall_name
FROM strategic_directives_v2 sd
LEFT JOIN sd_wall_states ws ON ws.sd_id = sd.uuid_id
WHERE sd.id = 'SD-LEO-ENH-AUTO-PROCEED-001-12'
LIMIT 5;

-- 5. Identify if there are any orphaned wall states
SELECT
  'Orphaned wall states' AS check_name,
  COUNT(*) AS orphaned_count
FROM sd_wall_states ws
WHERE NOT EXISTS (
  SELECT 1
  FROM strategic_directives_v2 sd
  WHERE sd.uuid_id = ws.sd_id
);

-- SOLUTION GUIDANCE:
-- If the error "invalid input syntax for type uuid: 'SD-LEO-ENH-AUTO-PROCEED-001-12'" occurs,
-- it means application code is doing:
--   ❌ WRONG: INSERT INTO sd_wall_states (sd_id, ...) VALUES ('SD-LEO-ENH-AUTO-PROCEED-001-12', ...)
--   ✅ CORRECT: INSERT INTO sd_wall_states (sd_id, ...) VALUES ((SELECT uuid_id FROM strategic_directives_v2 WHERE id = 'SD-LEO-ENH-AUTO-PROCEED-001-12'), ...)
--
-- Or in Supabase client:
--   ❌ WRONG: supabase.from('sd_wall_states').insert({ sd_id: sdId, ... })
--   ✅ CORRECT: supabase.from('sd_wall_states').insert({ sd_id: sdUuidId, ... })

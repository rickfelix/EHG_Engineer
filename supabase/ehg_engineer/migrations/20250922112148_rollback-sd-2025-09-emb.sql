-- Rollback Script for SD-2025-09-EMB
-- This safely removes only the seeded data, preserving schema
-- Run within a transaction to ensure atomicity

BEGIN;

-- Step 1: Delete tasks (leaf level)
DELETE FROM backlog_tasks_v2
WHERE story_id IN (
    SELECT s.id
    FROM backlog_stories_v2 s
    JOIN backlog_epics_v2 e ON s.epic_id = e.id
    WHERE e.sd_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid
);

-- Step 2: Delete stories
DELETE FROM backlog_stories_v2
WHERE epic_id IN (
    SELECT id
    FROM backlog_epics_v2
    WHERE sd_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid
);

-- Step 3: Delete epics
DELETE FROM backlog_epics_v2
WHERE sd_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid;

-- Step 4: Delete PRD
DELETE FROM prds_v2
WHERE sd_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid;

-- Step 5: Delete Strategic Directive
DELETE FROM strategic_directives_v2
WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid;

-- Verify deletion (should return 0 rows for each)
SELECT 'SD Check' as check_type, COUNT(*) as remaining
FROM strategic_directives_v2
WHERE key = 'SD-2025-09-EMB'
UNION ALL
SELECT 'PRD Check', COUNT(*)
FROM prds_v2
WHERE slug = 'SD-2025-09-EMB-PRD'
UNION ALL
SELECT 'Epic Check', COUNT(*)
FROM backlog_epics_v2
WHERE key LIKE 'E%-EMB-%'
UNION ALL
SELECT 'Story Check', COUNT(*)
FROM backlog_stories_v2
WHERE key LIKE 'S%.%-EMB%'
UNION ALL
SELECT 'Task Check', COUNT(*)
FROM backlog_tasks_v2
WHERE key LIKE 'T%.%.%' AND story_id IN (
    SELECT id FROM backlog_stories_v2 WHERE key LIKE 'S%.%-EMB%'
);

-- If all checks show 0, commit the rollback
-- COMMIT;

-- If any issues, rollback the rollback
-- ROLLBACK;
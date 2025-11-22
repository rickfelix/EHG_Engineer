-- Clean Up Orphaned Records
-- Generated: 2025-11-15T14:13:07.039Z
-- WARNING: Review before executing - deletes orphaned data

-- Delete handoffs for non-existent SDs
DELETE FROM sd_phase_handoffs
WHERE sd_id NOT IN (SELECT id FROM strategic_directives_v2);

-- Delete user stories for non-existent PRDs
-- Consider archiving instead of deleting
-- UPDATE user_stories SET status = 'archived' WHERE prd_id NOT IN (...);
DELETE FROM user_stories
WHERE prd_id NOT IN (SELECT id FROM product_requirements_v2);
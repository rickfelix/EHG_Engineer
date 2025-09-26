-- ============================================================================
-- Migrate existing stories from sd_backlog_map to user_stories table
-- Part of SD-GOVERNANCE-001 implementation
-- ============================================================================

-- Migrate existing governance stories to the new user_stories table
INSERT INTO user_stories (
    story_key,
    prd_id,
    sd_id,
    title,
    user_role,
    user_want,
    user_benefit,
    priority,
    status,
    acceptance_criteria,
    created_at,
    created_by
)
SELECT
    m.story_key,
    m.parent_id as prd_id,
    'SD-GOVERNANCE-001' as sd_id,
    m.backlog_title as title,
    -- Parse user role from description
    COALESCE(
        SUBSTRING(m.item_description FROM 'As a[n]? ([^,]+),'),
        'System User'
    ) as user_role,
    -- Parse user want from description
    COALESCE(
        SUBSTRING(m.item_description FROM 'I want (.+) so that'),
        m.item_description
    ) as user_want,
    -- Parse user benefit from description
    COALESCE(
        SUBSTRING(m.item_description FROM 'so that (.+)$'),
        'business value is delivered'
    ) as user_benefit,
    m.priority,
    'ready' as status, -- Mark as ready since PRDs are enhanced
    '[]'::jsonb as acceptance_criteria,
    NOW() as created_at,
    'MIGRATION' as created_by
FROM sd_backlog_map m
WHERE m.item_type = 'story'
  AND m.story_key LIKE 'SD-GOV%'
  AND NOT EXISTS (
      SELECT 1 FROM user_stories us WHERE us.story_key = m.story_key
  );

-- Add acceptance criteria for the migrated stories
UPDATE user_stories
SET acceptance_criteria = CASE story_key
    WHEN 'SD-GOV-001:US-001' THEN
        '["SD table created with all fields", "Indexes created", "Constraints enforced"]'::jsonb
    WHEN 'SD-GOV-001:US-002' THEN
        '["PRD-SD linkage via foreign key", "Cascade rules working", "Orphan prevention"]'::jsonb
    WHEN 'SD-GOV-001:US-003' THEN
        '["User stories table created", "Story-PRD linkage working", "Story key validation"]'::jsonb
    WHEN 'SD-GOV-001:US-004' THEN
        '["Audit log captures all changes", "Triggers fire correctly", "History preserved"]'::jsonb
    WHEN 'SD-GOV-001:US-005' THEN
        '["State transitions validated", "Invalid transitions blocked", "Role enforcement"]'::jsonb
    WHEN 'SD-GOV-001:US-006' THEN
        '["Proposals can be submitted", "Validation rules applied", "Workflow initiated"]'::jsonb
    WHEN 'SD-GOV-001:US-007' THEN
        '["Approval workflow steps defined", "Role-based approvals", "Notifications sent"]'::jsonb
    WHEN 'SD-GOV-001:US-008' THEN
        '["Stale proposals detected after 30 days", "Automated flagging", "Alert notifications"]'::jsonb
    WHEN 'SD-GOV-001:US-009' THEN
        '["Real-time notifications working", "All stakeholders notified", "Delivery confirmed"]'::jsonb
    WHEN 'SD-GOV-001:US-010' THEN
        '["Bulk approve/reject working", "Transaction safety", "Audit trail maintained"]'::jsonb
    ELSE acceptance_criteria
END
WHERE story_key LIKE 'SD-GOV%';

-- Add technical notes for implementation
UPDATE user_stories
SET technical_notes = CASE
    WHEN story_key IN ('SD-GOV-001:US-001', 'SD-GOV-001:US-002', 'SD-GOV-001:US-003') THEN
        'Core schema implementation - must be completed first. Use PostgreSQL 15+ features.'
    WHEN story_key IN ('SD-GOV-001:US-004', 'SD-GOV-001:US-005') THEN
        'Depends on core schema. Implement triggers and functions for automation.'
    WHEN story_key IN ('SD-GOV-001:US-006', 'SD-GOV-001:US-007', 'SD-GOV-001:US-008') THEN
        'Part of Phase 2 - Proposals Management System. Requires workflow engine.'
    WHEN story_key IN ('SD-GOV-001:US-009', 'SD-GOV-001:US-010') THEN
        'Advanced features - can be implemented after core workflow is stable.'
    ELSE technical_notes
END
WHERE story_key LIKE 'SD-GOV%';

-- Update story points based on complexity
UPDATE user_stories
SET story_points = CASE
    WHEN story_key IN ('SD-GOV-001:US-001', 'SD-GOV-001:US-003') THEN 8  -- Complex schema work
    WHEN story_key IN ('SD-GOV-001:US-002', 'SD-GOV-001:US-004') THEN 5  -- Medium complexity
    WHEN story_key IN ('SD-GOV-001:US-005', 'SD-GOV-001:US-007') THEN 8  -- Complex logic
    WHEN story_key IN ('SD-GOV-001:US-006', 'SD-GOV-001:US-008') THEN 5  -- Medium complexity
    WHEN story_key IN ('SD-GOV-001:US-009', 'SD-GOV-001:US-010') THEN 3  -- Simpler features
    ELSE 5  -- Default
END
WHERE story_key LIKE 'SD-GOV%';

-- Set sprint assignments for Phase 1
UPDATE user_stories
SET sprint = CASE
    WHEN story_key IN ('SD-GOV-001:US-001', 'SD-GOV-001:US-002', 'SD-GOV-001:US-003') THEN 'Sprint 1'
    WHEN story_key IN ('SD-GOV-001:US-004', 'SD-GOV-001:US-005') THEN 'Sprint 2'
    ELSE 'Backlog'
END
WHERE story_key LIKE 'SD-GOV%';

-- Verify migration
DO $$
DECLARE
    migrated_count INTEGER;
    total_stories INTEGER;
BEGIN
    SELECT COUNT(*) INTO migrated_count FROM user_stories WHERE story_key LIKE 'SD-GOV%';
    SELECT COUNT(*) INTO total_stories FROM sd_backlog_map WHERE story_key LIKE 'SD-GOV%' AND item_type = 'story';

    RAISE NOTICE 'Migration complete: % of % governance stories migrated', migrated_count, total_stories;

    IF migrated_count < total_stories THEN
        RAISE WARNING 'Not all stories were migrated. Check for duplicates or errors.';
    END IF;
END $$;

-- Refresh materialized view to include new stories
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_sd_summary;
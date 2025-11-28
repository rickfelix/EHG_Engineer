-- Fix trigger_id column type from INTEGER to UUID
-- The leo_sub_agent_triggers.id is UUID, not SERIAL

BEGIN;

-- Drop the view that depends on the column
DROP VIEW IF EXISTS pattern_subagent_summary;

-- Alter the column type
ALTER TABLE pattern_subagent_mapping
ALTER COLUMN trigger_id TYPE UUID USING NULL;

-- Recreate the view
CREATE OR REPLACE VIEW pattern_subagent_summary AS
SELECT
    ip.pattern_id,
    ip.category,
    ip.severity,
    ip.issue_summary,
    ip.status,
    ip.trend,
    ip.occurrence_count,
    ip.related_sub_agents,
    COALESCE(
        (SELECT array_agg(DISTINCT psm.sub_agent_code)
         FROM pattern_subagent_mapping psm
         WHERE psm.pattern_id = ip.pattern_id),
        ip.related_sub_agents
    ) AS all_related_subagents,
    (SELECT COUNT(*) FROM pattern_subagent_mapping psm WHERE psm.pattern_id = ip.pattern_id) AS mapping_count,
    (SELECT COUNT(*) FROM pattern_subagent_mapping psm WHERE psm.pattern_id = ip.pattern_id AND psm.trigger_id IS NOT NULL) AS trigger_count
FROM issue_patterns ip
WHERE ip.status = 'active'
ORDER BY ip.occurrence_count DESC;

COMMIT;

-- Verify
DO $$
BEGIN
  RAISE NOTICE 'trigger_id column type changed to UUID';
END $$;

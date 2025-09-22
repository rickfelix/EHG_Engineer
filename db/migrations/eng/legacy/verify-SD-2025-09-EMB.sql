-- Verification Script for SD-2025-09-EMB
-- Run this after applying the migration to verify all artifacts

-- 1. Verify Strategic Directive exists
SELECT
    key,
    title,
    status,
    priority,
    target_release,
    array_to_string(tags, ', ') as tags
FROM strategic_directives_v2
WHERE key = 'SD-2025-09-EMB';

-- 2. Verify PRD linkage
SELECT
    prd.slug,
    prd.title,
    prd.status,
    prd.version,
    sd.key as sd_key
FROM prds_v2 prd
JOIN strategic_directives_v2 sd ON prd.sd_id = sd.id
WHERE sd.key = 'SD-2025-09-EMB';

-- 3. Verify backlog structure and counts
SELECT
    e.key as epic_key,
    e.seq_no,
    e.title as epic_title,
    e.priority,
    e.estimate_points,
    COUNT(DISTINCT s.id) as story_count,
    COUNT(DISTINCT t.id) as task_count
FROM backlog_epics_v2 e
LEFT JOIN backlog_stories_v2 s ON s.epic_id = e.id
LEFT JOIN backlog_tasks_v2 t ON t.story_id = s.id
WHERE e.sd_id = (SELECT id FROM strategic_directives_v2 WHERE key = 'SD-2025-09-EMB')
GROUP BY e.key, e.seq_no, e.title, e.priority, e.estimate_points
ORDER BY e.seq_no;

-- 4. Verify views return correct data
SELECT
    sd_key,
    sd_title,
    prd_slug,
    prd_status,
    prd_version
FROM v_prd_sd_payload
WHERE sd_key = 'SD-2025-09-EMB';

-- 5. Detailed story breakdown by epic
SELECT
    e.key as epic_key,
    s.key as story_key,
    s.title as story_title,
    s.priority,
    s.estimate_points,
    s.seq_no
FROM backlog_stories_v2 s
JOIN backlog_epics_v2 e ON s.epic_id = e.id
JOIN strategic_directives_v2 sd ON e.sd_id = sd.id
WHERE sd.key = 'SD-2025-09-EMB'
ORDER BY e.seq_no, s.seq_no;

-- 6. Total effort and scope summary
SELECT
    'SD-2025-09-EMB' as sd_key,
    SUM(e.estimate_points) as total_epic_points,
    COUNT(DISTINCT e.id) as epic_count,
    COUNT(DISTINCT s.id) as story_count,
    COUNT(DISTINCT t.id) as task_count,
    MIN(e.seq_no) as first_epic_seq,
    MAX(e.seq_no) as last_epic_seq
FROM backlog_epics_v2 e
LEFT JOIN backlog_stories_v2 s ON s.epic_id = e.id
LEFT JOIN backlog_tasks_v2 t ON t.story_id = s.id
WHERE e.sd_id = (SELECT id FROM strategic_directives_v2 WHERE key = 'SD-2025-09-EMB');

-- 7. Verify acceptance criteria and KPIs
SELECT
    key,
    jsonb_pretty(acceptance_criteria) as acceptance_criteria,
    jsonb_pretty(kpis) as kpis
FROM strategic_directives_v2
WHERE key = 'SD-2025-09-EMB';

-- 8. Check for any duplicate keys (should return 0 rows)
SELECT key, COUNT(*) as count
FROM strategic_directives_v2
WHERE key = 'SD-2025-09-EMB'
GROUP BY key
HAVING COUNT(*) > 1;

-- 9. Verify RLS policies are in place
SELECT
    schemaname,
    tablename,
    policyname,
    cmd,
    permissive
FROM pg_policies
WHERE tablename IN ('prds_v2', 'backlog_epics_v2', 'backlog_stories_v2', 'backlog_tasks_v2')
ORDER BY tablename, policyname;

-- 10. Verify all foreign key relationships are valid
SELECT
    'PRD→SD' as relationship,
    COUNT(*) as count
FROM prds_v2 p
JOIN strategic_directives_v2 s ON p.sd_id = s.id
WHERE s.key = 'SD-2025-09-EMB'
UNION ALL
SELECT
    'Epic→SD' as relationship,
    COUNT(*) as count
FROM backlog_epics_v2 e
JOIN strategic_directives_v2 s ON e.sd_id = s.id
WHERE s.key = 'SD-2025-09-EMB'
UNION ALL
SELECT
    'Story→Epic' as relationship,
    COUNT(*) as count
FROM backlog_stories_v2 st
JOIN backlog_epics_v2 e ON st.epic_id = e.id
JOIN strategic_directives_v2 s ON e.sd_id = s.id
WHERE s.key = 'SD-2025-09-EMB';
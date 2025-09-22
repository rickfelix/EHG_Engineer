#!/usr/bin/env bash
set -euo pipefail

echo "=== Running VH Linkage Hydration ==="
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

# Source environment
ENV_FILE="${PSQL_ENV:-.env.staging}"
echo "Using environment: $ENV_FILE"

# Create hydration SQL
TEMP_SQL=$(mktemp /tmp/hydrate_linkage.XXXXXX.sql)
trap "rm -f $TEMP_SQL" EXIT

cat > "$TEMP_SQL" <<'EOSQL'
-- VH Linkage Hydration Script
\set ON_ERROR_STOP on
\timing on

BEGIN;

\echo '=== Creating Governance Views for VH Access ==='

-- Create read-only view of eng governance for vh
CREATE OR REPLACE VIEW views.eng_governance_summary AS
SELECT
    sd.id as sd_id,
    sd.title as sd_title,
    sd.status as sd_status,
    sd.priority as sd_priority,
    p.id as prd_id,
    p.title as prd_title,
    p.status as prd_status,
    COUNT(b.id) as backlog_count
FROM eng.strategic_directives_v2 sd
LEFT JOIN eng.prds p ON p.sd_id = sd.id
LEFT JOIN eng.backlog_items b ON b.prd_id = p.id
GROUP BY sd.id, sd.title, sd.status, sd.priority, p.id, p.title, p.status;

-- Create linkage status view
CREATE OR REPLACE VIEW views.vh_linkage_status AS
SELECT
    p.id as project_id,
    p.name as project_name,
    p.eng_sd_id,
    sd.title as sd_title,
    COUNT(t.id) as task_count,
    COUNT(t.id) FILTER (WHERE t.status = 'completed') as completed_tasks
FROM vh.projects p
LEFT JOIN eng.strategic_directives_v2 sd ON sd.id = p.eng_sd_id
LEFT JOIN vh.tasks t ON t.project_id = p.id
GROUP BY p.id, p.name, p.eng_sd_id, sd.title;

\echo '=== Validating Linkage Integrity ==='

-- Check for orphaned vh.projects (no matching SD)
WITH orphaned AS (
    SELECT p.id, p.name, p.eng_sd_id
    FROM vh.projects p
    WHERE p.eng_sd_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM eng.strategic_directives_v2 sd
        WHERE sd.id = p.eng_sd_id
      )
)
SELECT
    CASE
        WHEN COUNT(*) = 0 THEN 'PASS: No orphaned projects'
        ELSE 'FAIL: ' || COUNT(*) || ' orphaned projects found'
    END as integrity_check
FROM orphaned;

-- Check for orphaned vh.tasks (no matching backlog)
WITH orphaned_tasks AS (
    SELECT t.id, t.title, t.eng_backlog_id
    FROM vh.tasks t
    WHERE t.eng_backlog_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM eng.backlog_items b
        WHERE b.id = t.eng_backlog_id
      )
)
SELECT
    CASE
        WHEN COUNT(*) = 0 THEN 'PASS: No orphaned tasks'
        ELSE 'FAIL: ' || COUNT(*) || ' orphaned tasks found'
    END as task_integrity_check
FROM orphaned_tasks;

\echo '=== Creating Linkage Audit Trail ==='

-- Create linkage audit table if not exists
CREATE TABLE IF NOT EXISTS audit.linkage_verification (
    id SERIAL PRIMARY KEY,
    verification_time TIMESTAMPTZ DEFAULT NOW(),
    total_projects INTEGER,
    linked_projects INTEGER,
    total_tasks INTEGER,
    linked_tasks INTEGER,
    orphaned_count INTEGER DEFAULT 0
);

-- Record current linkage state
INSERT INTO audit.linkage_verification (
    total_projects, linked_projects, total_tasks, linked_tasks, orphaned_count
)
SELECT
    (SELECT COUNT(*) FROM vh.projects),
    (SELECT COUNT(*) FROM vh.projects WHERE eng_sd_id IS NOT NULL),
    (SELECT COUNT(*) FROM vh.tasks),
    (SELECT COUNT(*) FROM vh.tasks WHERE eng_backlog_id IS NOT NULL),
    (
        SELECT COUNT(*) FROM vh.projects p
        WHERE p.eng_sd_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM eng.strategic_directives_v2 sd
            WHERE sd.id = p.eng_sd_id
          )
    );

-- Record in migration log
INSERT INTO audit.migration_log (version) VALUES ('vh_linkage_hydration_v1');

COMMIT;

\echo '=== Linkage Summary ==='
SELECT
    'Projects' as entity,
    COUNT(*) as total,
    COUNT(eng_sd_id) as linked,
    ROUND(100.0 * COUNT(eng_sd_id) / NULLIF(COUNT(*), 0), 1) || '%' as link_rate
FROM vh.projects
UNION ALL
SELECT
    'Tasks',
    COUNT(*),
    COUNT(eng_backlog_id),
    ROUND(100.0 * COUNT(eng_backlog_id) / NULLIF(COUNT(*), 0), 1) || '%'
FROM vh.tasks;

\echo '=== View Access Test ==='
SELECT COUNT(*) as governance_records FROM views.eng_governance_summary;
SELECT COUNT(*) as linkage_records FROM views.vh_linkage_status;

\echo '=== Hydration Complete ==='
EOSQL

# Run hydration
PSQL_ENV="$ENV_FILE" bash ops/scripts/psql_exec.sh -f "$TEMP_SQL"

echo "=== VH Linkage Hydration Complete ==="
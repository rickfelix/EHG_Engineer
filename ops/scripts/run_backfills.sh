#!/usr/bin/env bash
set -euo pipefail

echo "=== Running Staging Database Backfills ==="
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

# Source environment
ENV_FILE="${PSQL_ENV:-.env.staging}"
echo "Using environment: $ENV_FILE"

# Create backfill SQL
TEMP_SQL=$(mktemp /tmp/staging_backfill.XXXXXX.sql)
trap "rm -f $TEMP_SQL" EXIT

cat > "$TEMP_SQL" <<'EOSQL'
-- Staging Backfill Script
\set ON_ERROR_STOP on
\timing on

BEGIN;

\echo '=== Backfilling Engineering Governance Data ==='

-- Insert sample strategic directives
INSERT INTO eng.strategic_directives_v2 (title, description, status, priority) VALUES
    ('Implement Two-App Boundary', 'Enforce strict separation between EHG_Engineering and EHG apps', 'active', 90),
    ('Database-First Architecture', 'All state management through database with proper RLS', 'active', 85),
    ('Automated Housekeeping', 'Enable Codex-driven database maintenance', 'in_progress', 75),
    ('CI/CD Pipeline Enhancement', 'Add boundary checks and automated verification', 'draft', 60);

-- Insert sample PRDs
INSERT INTO eng.prds (sd_id, title, content, status)
SELECT
    sd.id,
    'PRD: ' || sd.title,
    'Implementation plan for: ' || sd.description,
    CASE WHEN sd.status = 'active' THEN 'approved' ELSE 'draft' END
FROM eng.strategic_directives_v2 sd;

-- Insert sample backlog items
INSERT INTO eng.backlog_items (prd_id, title, description, priority, status)
SELECT
    p.id,
    'Task ' || ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY p.id) || ': ' || p.title,
    'Implementation task for ' || p.title,
    FLOOR(RANDOM() * 50 + 50)::INT,
    CASE WHEN RANDOM() > 0.5 THEN 'completed' ELSE 'pending' END
FROM eng.prds p;

\echo '=== Backfilling Venture Hub Data ==='

-- Insert sample projects
INSERT INTO vh.projects (name, eng_sd_id, status) VALUES
    ('Alpha Initiative',
     (SELECT id FROM eng.strategic_directives_v2 WHERE title = 'Implement Two-App Boundary'),
     'active'),
    ('Beta Program',
     (SELECT id FROM eng.strategic_directives_v2 WHERE title = 'Database-First Architecture'),
     'active'),
    ('Gamma Development',
     (SELECT id FROM eng.strategic_directives_v2 WHERE title = 'Automated Housekeeping'),
     'planning');

-- Insert sample tasks
INSERT INTO vh.tasks (project_id, title, eng_backlog_id, status)
SELECT
    p.id,
    'VH Task ' || ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY p.id),
    b.id,
    CASE WHEN RANDOM() > 0.7 THEN 'completed' ELSE 'pending' END
FROM vh.projects p
CROSS JOIN LATERAL (
    SELECT id FROM eng.backlog_items
    ORDER BY RANDOM()
    LIMIT 2
) b;

-- Record backfill
INSERT INTO audit.migration_log (version) VALUES ('staging_backfill_v1');

COMMIT;

\echo '=== Backfill Summary ==='
SELECT
    'eng.strategic_directives_v2' as table_name,
    COUNT(*) as row_count
FROM eng.strategic_directives_v2
UNION ALL
SELECT
    'eng.prds',
    COUNT(*)
FROM eng.prds
UNION ALL
SELECT
    'eng.backlog_items',
    COUNT(*)
FROM eng.backlog_items
UNION ALL
SELECT
    'vh.projects',
    COUNT(*)
FROM vh.projects
UNION ALL
SELECT
    'vh.tasks',
    COUNT(*)
FROM vh.tasks
ORDER BY table_name;

\echo '=== Backfill Complete ==='
EOSQL

# Run backfill
PSQL_ENV="$ENV_FILE" bash ops/scripts/psql_exec.sh -f "$TEMP_SQL"

echo "=== Staging Backfill Complete ==="
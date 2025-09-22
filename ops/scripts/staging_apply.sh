#!/usr/bin/env bash
set -euo pipefail

echo "=== Starting Staging Database Apply ==="
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

# Source environment
ENV_FILE="${PSQL_ENV:-.env.staging}"
echo "Using environment: $ENV_FILE"

# Create temporary SQL file for all migrations
TEMP_SQL=$(mktemp /tmp/staging_apply.XXXXXX.sql)
trap "rm -f $TEMP_SQL" EXIT

cat > "$TEMP_SQL" <<'EOSQL'
-- Staging Apply Script
\set ON_ERROR_STOP on
\timing on

BEGIN;

-- Engineering schema setup
CREATE SCHEMA IF NOT EXISTS eng;
CREATE SCHEMA IF NOT EXISTS vh;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS views;

-- Sample eng tables (governance)
CREATE TABLE IF NOT EXISTS eng.strategic_directives_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft',
    priority INTEGER DEFAULT 50,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eng.prds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id UUID REFERENCES eng.strategic_directives_v2(id),
    title TEXT NOT NULL,
    content TEXT,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eng.backlog_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prd_id UUID REFERENCES eng.prds(id),
    title TEXT NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 50,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sample vh tables (venture hub)
CREATE TABLE IF NOT EXISTS vh.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    eng_sd_id UUID, -- Linkage to eng, no FK (boundary enforcement)
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vh.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES vh.projects(id),
    title TEXT NOT NULL,
    eng_backlog_id UUID, -- Linkage to eng, no FK
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit table
CREATE TABLE IF NOT EXISTS audit.migration_log (
    id SERIAL PRIMARY KEY,
    version TEXT NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    applied_by TEXT DEFAULT current_user
);

INSERT INTO audit.migration_log (version) VALUES ('staging_base_schema_v1');

COMMIT;

\echo 'Base schema applied successfully'
EOSQL

# Apply using psql wrapper
PSQL_ENV="$ENV_FILE" bash ops/scripts/psql_exec.sh -f "$TEMP_SQL"

echo "=== Staging Apply Complete ==="
#!/bin/bash
set -e

echo "=== Starting EHG Staging Database Bootstrap ==="
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

# Create roles
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create service roles
    CREATE ROLE eng_service WITH LOGIN PASSWORD 'eng_stg_2025';
    CREATE ROLE vh_service WITH LOGIN PASSWORD 'vh_stg_2025';
    CREATE ROLE analyst_ro WITH LOGIN PASSWORD 'analyst_stg_2025';

    -- Grant basic permissions
    GRANT CONNECT ON DATABASE ehg_stage TO eng_service, vh_service, analyst_ro;

    -- Create schemas
    CREATE SCHEMA IF NOT EXISTS eng;
    CREATE SCHEMA IF NOT EXISTS vh;
    CREATE SCHEMA IF NOT EXISTS audit;
    CREATE SCHEMA IF NOT EXISTS views;

    -- Schema ownership
    GRANT ALL ON SCHEMA eng TO eng_service;
    GRANT USAGE ON SCHEMA eng TO analyst_ro;

    GRANT ALL ON SCHEMA vh TO vh_service;
    GRANT USAGE ON SCHEMA vh TO analyst_ro;

    GRANT ALL ON SCHEMA audit TO eng_service;
    GRANT USAGE ON SCHEMA audit TO analyst_ro;

    GRANT USAGE ON SCHEMA views TO analyst_ro;
    GRANT CREATE ON SCHEMA views TO eng_service, vh_service;

    -- Install extensions
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    -- Enable RLS by default on new tables
    ALTER DATABASE ehg_stage SET row_security = on;

    -- Audit function for tracking changes
    CREATE OR REPLACE FUNCTION audit.log_change()
    RETURNS TRIGGER AS \$\$
    BEGIN
        INSERT INTO audit.change_log (
            table_name, operation, user_name, timestamp, row_data
        ) VALUES (
            TG_TABLE_NAME, TG_OP, current_user, now(), row_to_json(NEW)
        );
        RETURN NEW;
    END;
    \$\$ LANGUAGE plpgsql;

    -- Create audit log table
    CREATE TABLE IF NOT EXISTS audit.change_log (
        id SERIAL PRIMARY KEY,
        table_name TEXT NOT NULL,
        operation TEXT NOT NULL,
        user_name TEXT NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,
        row_data JSONB
    );

    GRANT SELECT ON audit.change_log TO analyst_ro;
    GRANT INSERT ON audit.change_log TO eng_service, vh_service;

    -- Success marker
    CREATE TABLE IF NOT EXISTS audit.bootstrap_status (
        completed_at TIMESTAMPTZ DEFAULT NOW(),
        version TEXT DEFAULT 'staging_2025_09_22'
    );

    INSERT INTO audit.bootstrap_status DEFAULT VALUES;
EOSQL

echo "=== Bootstrap completed successfully ==="
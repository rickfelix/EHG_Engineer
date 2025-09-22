-- Create time-boxed Codex staging user with least privileges
-- Generated: 2025-09-22
-- Expires: 8 hours from creation

DO $$
DECLARE
    codex_pwd TEXT := 'cdx_K9mN3pQ7wL5xR2vT8bF6hJ4sD1aG';
    expire_time TIMESTAMP := NOW() + INTERVAL '8 hours';
BEGIN
    -- Create the codex_staging user with time-boxed access
    IF NOT EXISTS (SELECT 1 FROM pg_user WHERE usename = 'codex_staging') THEN
        EXECUTE format('CREATE USER codex_staging WITH LOGIN PASSWORD %L VALID UNTIL %L',
                      codex_pwd, expire_time::TEXT);
    END IF;

    -- Grant database connection
    GRANT CONNECT ON DATABASE ehg_stage TO codex_staging;

    -- Schema access
    GRANT USAGE ON SCHEMA eng, vh, audit, views TO codex_staging;

    -- eng_* table permissions (housekeeping focus)
    -- Strategic directives and PRDs
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA eng TO codex_staging;
    ALTER DEFAULT PRIVILEGES IN SCHEMA eng GRANT SELECT, INSERT, UPDATE ON TABLES TO codex_staging;

    -- vh_* table permissions (limited to linkage hydration)
    GRANT SELECT ON ALL TABLES IN SCHEMA vh TO codex_staging;
    GRANT INSERT, UPDATE ON ALL TABLES IN SCHEMA vh TO codex_staging; -- For hydration only
    ALTER DEFAULT PRIVILEGES IN SCHEMA vh GRANT SELECT ON TABLES TO codex_staging;

    -- Views access (read-only verification)
    GRANT SELECT ON ALL TABLES IN SCHEMA views TO codex_staging;
    ALTER DEFAULT PRIVILEGES IN SCHEMA views GRANT SELECT ON TABLES TO codex_staging;

    -- Audit trail access (append-only)
    GRANT SELECT, INSERT ON audit.change_log TO codex_staging;
    GRANT SELECT ON audit.bootstrap_status TO codex_staging;

    -- Sequence usage for inserts
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA eng TO codex_staging;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA vh TO codex_staging;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA audit TO codex_staging;

    -- Explicitly DENY DDL operations
    REVOKE CREATE ON SCHEMA eng, vh, audit, views FROM codex_staging;
    REVOKE ALL ON DATABASE ehg_stage FROM codex_staging;
    GRANT CONNECT ON DATABASE ehg_stage TO codex_staging; -- Re-grant only connect

    -- Log user creation
    INSERT INTO audit.change_log (table_name, operation, user_name, timestamp, row_data)
    VALUES (
        'pg_user',
        'CREATE_CODEX_USER',
        current_user,
        NOW(),
        jsonb_build_object(
            'username', 'codex_staging',
            'expires_at', expire_time,
            'granted_schemas', ARRAY['eng', 'vh', 'audit', 'views'],
            'permission_level', 'restricted_housekeeping'
        )
    );

    RAISE NOTICE 'Codex staging user created. Expires at: %', expire_time;
END $$;
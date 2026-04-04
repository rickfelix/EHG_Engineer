-- Migration: Retention policy for permission_audit_log table
-- QF: QF-20260403-718
-- Purpose: Prevent unbounded table growth by deleting rows older than 90 days.
--          Safe to run multiple times (idempotent).
-- Scheduling: This function is designed to be invoked by a GitHub Actions
--             scheduled workflow (e.g., daily at 03:00 UTC). pg_cron is not
--             currently enabled in this environment.

-- Create (or replace) the cleanup function
CREATE OR REPLACE FUNCTION cleanup_permission_audit_log()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM permission_audit_log
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;

-- Grant execute to service_role so the scheduled caller can invoke it
GRANT EXECUTE ON FUNCTION cleanup_permission_audit_log() TO service_role;

-- =============================================================================
-- SCHEDULING NOTE
-- To run this daily, add the following GitHub Actions step to your scheduler:
--
--   - name: Trim permission_audit_log (90-day retention)
--     run: |
--       psql "$SUPABASE_POOLER_URL" -c "SELECT cleanup_permission_audit_log();"
--
-- For pg_cron (if enabled in future):
--   SELECT cron.schedule(
--     'cleanup-permission-audit-log',
--     '0 3 * * *',
--     $$SELECT cleanup_permission_audit_log()$$
--   );
-- =============================================================================

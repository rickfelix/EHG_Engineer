-- @approved-by: rickfelix@example.com
-- =============================================================================
-- ROLLBACK D. Restore the exact pre-migration write policies from the snapshot
-- captured in migration_backup.rls_policy_backup_20260603. For each backed-up
-- policy: drop whatever currently bears that name (e.g. the SELECT-only conversion)
-- and recreate the original policy verbatim (command, roles, USING, WITH CHECK).
-- Idempotent and guarded (skips tables/policies that no longer exist).
-- =============================================================================
DO $rb$
DECLARE
  b RECORD;
  v_cmd TEXT;
  v_sql TEXT;
  v_count INTEGER := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'migration_backup' AND c.relname = 'rls_policy_backup_20260603'
  ) THEN
    RAISE NOTICE 'ROLLBACK D: no snapshot table found — nothing to restore.';
    RETURN;
  END IF;

  FOR b IN
    SELECT * FROM migration_backup.rls_policy_backup_20260603 ORDER BY tbl, polname
  LOOP
    -- Skip if the table is gone.
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE n.nspname = 'public' AND c.relname = b.tbl) THEN
      CONTINUE;
    END IF;

    v_cmd := CASE b.polcmd
               WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
               WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' WHEN '*' THEN 'ALL' END;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', b.polname, b.tbl);

    v_sql := format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
                    b.polname, b.tbl,
                    CASE WHEN b.permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
                    v_cmd, b.roles_sql);

    -- USING applies to SELECT / UPDATE / DELETE / ALL.
    IF b.using_expr IS NOT NULL AND b.polcmd IN ('r','w','d','*') THEN
      v_sql := v_sql || format(' USING (%s)', b.using_expr);
    END IF;
    -- WITH CHECK applies to INSERT / UPDATE / ALL.
    IF b.withcheck_expr IS NOT NULL AND b.polcmd IN ('a','w','*') THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', b.withcheck_expr);
    END IF;

    EXECUTE v_sql;
    v_count := v_count + 1;
    RAISE NOTICE 'ROLLBACK D: restored public.%."%" (%)', b.tbl, b.polname, v_cmd;
  END LOOP;

  RAISE NOTICE 'ROLLBACK D COMPLETE: restored % policy(ies).', v_count;
END
$rb$;

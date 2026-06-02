-- ============================================================================
-- ROLLBACK for 20260602_fix_security_definer_views_and_rls_recurrence.sql
-- ============================================================================
-- WARNING: Running this rollback RE-OPENS the Supabase linter SECURITY findings
-- it remediated (security_definer_view, rls_disabled_in_public,
-- sensitive_columns_exposed). Only run it to recover from an unexpected
-- application breakage caused by the forward migration.
--
-- This rollback reverses ONLY what the forward migration added/changed:
--   - Drops the leo_enforce_view_security_invoker event trigger + function (PART E1)
--   - Restores security_audit_events_create_partition() to its pre-migration body
--     (no RLS on new partitions) (PART E2)
--   - Drops the 'service_role_full_access' policies created by this migration and
--     disables RLS on tables/partitions, then RE-GRANTS the Supabase default
--     blanket grants to anon, authenticated (PART B/C/D reversal)
--   - Removes security_invoker=on from public views (PART A reversal)
--
-- It is intentionally CONSERVATIVE for tables that may have had pre-existing
-- 'service_role_full_access' policies from earlier migrations (e.g. the Feb fix):
-- it only DISABLES RLS where this migration enabled it is NOT individually
-- tracked, so this rollback disables RLS broadly across public r/p tables. Prefer
-- a targeted manual revert for a single object over running this whole file.
-- ============================================================================

-- ---- Reverse PART E1: drop the view-invoker event trigger + function --------
DROP EVENT TRIGGER IF EXISTS leo_enforce_view_security_invoker;
DROP FUNCTION IF EXISTS public.leo_enforce_view_security_invoker();

-- ---- Reverse PART E2: restore original partition routine (no RLS) -----------
CREATE OR REPLACE FUNCTION public.security_audit_events_create_partition(p_month date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_start    date := date_trunc('month', p_month)::date;
  v_end      date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_partname text := format('security_audit_events_%s', to_char(v_start, 'YYYY_MM'));
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.security_audit_events ' ||
    'FOR VALUES FROM (%L) TO (%L);',
    v_partname, v_start::timestamptz, v_end::timestamptz
  );
END
$fn$;

-- ---- Reverse PART B/C/D: disable RLS + drop our policy + re-grant defaults ---
-- Child partitions of security_audit_events
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT child.relname
    FROM pg_inherits i
    JOIN pg_class parent ON parent.oid = i.inhparent
    JOIN pg_class child ON child.oid = i.inhrelid
    JOIN pg_namespace n ON n.oid = parent.relnamespace
    WHERE n.nspname='public' AND parent.relname='security_audit_events'
    ORDER BY child.relname
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service_role_full_access" ON public.%I', c.relname);
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', c.relname);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I TO anon, authenticated', c.relname);
    RAISE NOTICE 'ROLLBACK: reverted child partition %', c.relname;
  END LOOP;
END $$;

-- Ordinary public tables (relkind='r') that currently have the policy we created
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN
    SELECT DISTINCT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_policies pol ON pol.schemaname='public' AND pol.tablename=c.relname
                        AND pol.policyname='service_role_full_access'
    WHERE n.nspname='public' AND c.relkind='r'
    ORDER BY c.relname
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service_role_full_access" ON public.%I', t.relname);
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t.relname);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I TO anon, authenticated', t.relname);
    RAISE NOTICE 'ROLLBACK: reverted table %', t.relname;
  END LOOP;
END $$;

-- Parent partitioned table: drop only the policy this migration may have added
-- (leave parent RLS enabled+forced as it pre-existed the forward migration)
DROP POLICY IF EXISTS "service_role_full_access" ON public.security_audit_events;

-- ---- Reverse PART A: remove security_invoker=on from public views -----------
DO $$
DECLARE v RECORD;
BEGIN
  FOR v IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relkind='v'
      AND (COALESCE(c.reloptions,'{}') @> ARRAY['security_invoker=on'])
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER VIEW public.%I RESET (security_invoker)', v.relname);
    RAISE NOTICE 'ROLLBACK: reset security_invoker on view %', v.relname;
  END LOOP;
END $$;

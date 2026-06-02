-- @approved-by: rickfelix@example.com
-- ============================================================================
-- LEO Protocol - Fix Security Definer Views + RLS (RECURRENCE remediation)
-- Migration: 20260602_fix_security_definer_views_and_rls_recurrence.sql
-- Supersedes the static-list approach of:
--   20251216_fix_security_definer_views.sql
--   20260211_fix_security_definer_views_and_rls.sql
-- ============================================================================
-- Purpose: Remediate a RECURRENCE of Supabase database-linter SECURITY errors:
--   (1) security_definer_view      -- 30 public views lacking security_invoker=on
--   (2) rls_disabled_in_public     -- 45 public base tables with RLS disabled
--   (3) sensitive_columns_exposed  -- session_id exposed (STRICT SUBSET of #2;
--                                     resolved transitively by enabling RLS)
--
-- ROOT CAUSES (confirmed against the LIVE database 2026-06-02):
--   RC1  View recreation drops the option. Of 162 public views, 132 still carry
--        security_invoker=on (Feb fix) and 30 do NOT. The 30 lost it because later
--        migrations used CREATE OR REPLACE VIEW / DROP+CREATE without re-applying
--        SET (security_invoker=on). Verified: v_active_sessions,
--        chairman_pending_decisions, prds, v_story_test_coverage,
--        v_patterns_with_decay all have reloptions = NULL (option absent).
--   RC2  New objects. Many flagged objects were created after Feb and never had
--        security_invoker / RLS to begin with.
--   RC3  No enforcement. The Feb migration left only an advisory comment. Nothing
--        auto-corrects or fails CI, so findings re-accumulate. -> PART E + Phase 3.
--   RC4  Partition routine. public.security_audit_events is a partitioned parent
--        (relkind=p) that ALREADY has RLS enabled+forced, but its 13 monthly child
--        partitions have RLS OFF. security_audit_events_create_partition() runs
--        CREATE TABLE ... PARTITION OF with NO subsequent ENABLE ROW LEVEL SECURITY,
--        so every new partition is born insecure. PART D backfills the children;
--        PART E hardens the routine at the source.
--   RC5  Stale backup tables. backup_leo_* were created via CREATE TABLE AS SELECT
--        (no RLS copied) and left in public. They are stale (1-12 rows) and have
--        ZERO code references. Per "default to securing, not dropping", PART C
--        ENABLES RLS on them rather than dropping (fully reversible). A separate
--        human decision can drop them later.
--
-- ACCESS-MODEL SAFETY (why service_role-only policies are safe here):
--   - EHG_Engineer's server-side loader (src/services/database-loader/connections.js)
--     uses SUPABASE_SERVICE_ROLE_KEY ("bypass RLS"); SERVICE_ROLE_KEY is set in env.
--   - service_role and postgres both have rolbypassrls=true -> unaffected by RLS.
--   - anon/authenticated have rolbypassrls=false, BUT the blanket GRANT ALL ... TO
--     anon, authenticated exists on 847/849 public objects (Supabase default), NOT
--     intentional per-table browser access. None of the 30 views / 45 tables are
--     referenced by any client/browser/React code.
--   - The Feb migration already enabled RLS+REVOKE on 11 such tables with no app
--     breakage -> empirical proof the service_role-only model holds.
--   => Enabling RLS + service_role-only policies will NOT break any reader.
--
-- IDEMPOTENT + DYNAMIC: safe to re-run. PART A and PART B/C/D self-heal whatever
-- the live DB currently shows (not a hand-copied static name list).
-- ============================================================================

-- ============================================================================
-- PART A: FIX SECURITY DEFINER VIEWS (dynamic -- every public view lacking it)
-- Self-heals RC1 + RC2; covers all 30 flagged + anything the snapshot missed.
-- ============================================================================
DO $$
DECLARE
  v RECORD;
  fixed_count INT := 0;
BEGIN
  FOR v IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND NOT (COALESCE(c.reloptions, '{}') @> ARRAY['security_invoker=on'])
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', v.relname);
    RAISE NOTICE 'PART A: set security_invoker=on for view %', v.relname;
    fixed_count := fixed_count + 1;
  END LOOP;
  RAISE NOTICE 'PART A COMPLETE: % views fixed', fixed_count;
END $$;

-- ============================================================================
-- PART C: SECURE STALE BACKUP TABLES (backup_leo_*)
-- Default-to-securing (NOT dropping). Enables RLS + service_role-only policy.
-- Done BEFORE PART B's blanket loop so they get an explicit, auditable record
-- (PART B would also catch them, but naming them documents the RC5 decision).
-- ============================================================================
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'backup_leo_%'
      AND c.relrowsecurity = false
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t.relname);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t.relname
        AND policyname = 'service_role_full_access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "service_role_full_access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t.relname);
    END IF;
    RAISE NOTICE 'PART C: secured stale backup table %', t.relname;
  END LOOP;
  RAISE NOTICE 'PART C COMPLETE';
END $$;

-- ============================================================================
-- PART B: ENABLE RLS ON PUBLIC BASE TABLES LACKING IT (dynamic)
-- Covers all currently-RLS-off ordinary tables (relkind='r'). Self-heals RC2/RC5.
-- EXCLUDES the partition PARENT (relkind='p', already RLS-enabled) and partition
-- CHILDREN (handled explicitly in PART D so the parent/child relationship is
-- documented). Rationale for blanket-over-curated: every RLS-off public table on
-- this DB is a service_role-only governance/internal table (see ACCESS-MODEL note);
-- a curated list would only diverge from the dynamic set for FUTURE tables, which
-- are handled by Phase-3 prevention instead.
-- ============================================================================
DO $$
DECLARE
  t RECORD;
  fixed_count INT := 0;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'                 -- ordinary tables only (not 'p' parents)
      AND c.relrowsecurity = false
      -- exclude partition children of security_audit_events (PART D owns them)
      AND NOT EXISTS (
        SELECT 1
        FROM pg_inherits i
        JOIN pg_class p ON p.oid = i.inhparent
        WHERE i.inhrelid = c.oid
          AND p.relname = 'security_audit_events'
      )
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t.relname);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t.relname
        AND policyname = 'service_role_full_access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "service_role_full_access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t.relname);
    END IF;
    fixed_count := fixed_count + 1;
    RAISE NOTICE 'PART B: enabled RLS (service_role only) on %', t.relname;
  END LOOP;
  RAISE NOTICE 'PART B COMPLETE: % tables secured', fixed_count;
END $$;

-- ============================================================================
-- PART D: PARTITIONED AUDIT TABLE -- backfill RLS on all child partitions (RC4)
-- Parent public.security_audit_events already has RLS enabled+forced, but direct
-- access to a child partition bypasses the parent's RLS unless the child also has
-- RLS. We enable RLS on every existing child (without FORCE, matching their owner
-- posture; postgres/service_role bypass RLS so SECURITY DEFINER inserts are fine)
-- and attach a service_role policy. We also ensure a service_role policy exists on
-- the parent for completeness.
-- ============================================================================
DO $$
DECLARE
  c RECORD;
BEGIN
  -- Ensure parent has a service_role policy (idempotent)
  IF EXISTS (SELECT 1 FROM pg_class p JOIN pg_namespace n ON n.oid=p.relnamespace
             WHERE n.nspname='public' AND p.relname='security_audit_events') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='security_audit_events'
        AND policyname='service_role_full_access'
    ) THEN
      EXECUTE 'CREATE POLICY "service_role_full_access" ON public.security_audit_events FOR ALL TO service_role USING (true) WITH CHECK (true)';
      RAISE NOTICE 'PART D: added service_role policy on parent security_audit_events';
    END IF;
  END IF;

  -- Enable RLS + policy on every child partition lacking it
  FOR c IN
    SELECT child.relname
    FROM pg_inherits i
    JOIN pg_class parent ON parent.oid = i.inhparent
    JOIN pg_class child ON child.oid = i.inhrelid
    JOIN pg_namespace n ON n.oid = parent.relnamespace
    WHERE n.nspname = 'public'
      AND parent.relname = 'security_audit_events'
      AND child.relrowsecurity = false
    ORDER BY child.relname
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', c.relname);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', c.relname);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=c.relname
        AND policyname='service_role_full_access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "service_role_full_access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        c.relname);
    END IF;
    RAISE NOTICE 'PART D: enabled RLS on child partition %', c.relname;
  END LOOP;
  RAISE NOTICE 'PART D COMPLETE';
END $$;

-- ============================================================================
-- PART E: PREVENT RECURRENCE AT THE SOURCE
--   E1. Event trigger: auto-apply security_invoker=on to any newly created/
--       replaced public VIEW (permanently kills RC1 regardless of who recreates
--       a view later). Verified: postgres can create event triggers on this DB.
--   E2. Harden security_audit_events_create_partition() so FUTURE partitions are
--       born with RLS enabled + service_role policy (fixes RC4 at the source).
-- ============================================================================

-- E1: view-invoker auto-enforcement event trigger ----------------------------
CREATE OR REPLACE FUNCTION public.leo_enforce_view_security_invoker()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  obj RECORD;
  has_invoker BOOLEAN;
BEGIN
  FOR obj IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE VIEW', 'ALTER VIEW')
      AND object_type = 'view'
      AND schema_name = 'public'
  LOOP
    -- Re-entrancy guard: only ALTER when the option is currently absent. Our own
    -- ALTER VIEW re-fires this trigger, but by then the option is present -> skip.
    SELECT (COALESCE(c.reloptions, '{}') @> ARRAY['security_invoker=on'])
      INTO has_invoker
    FROM pg_class c
    WHERE c.oid = obj.objid AND c.relkind = 'v';

    IF has_invoker IS NOT NULL AND has_invoker = false THEN
      EXECUTE format('ALTER VIEW %s SET (security_invoker = on)', obj.object_identity);
      RAISE NOTICE 'leo_enforce_view_security_invoker: auto-applied security_invoker=on to %', obj.object_identity;
    END IF;
  END LOOP;
END
$fn$;

DROP EVENT TRIGGER IF EXISTS leo_enforce_view_security_invoker;
CREATE EVENT TRIGGER leo_enforce_view_security_invoker
  ON ddl_command_end
  WHEN TAG IN ('CREATE VIEW', 'ALTER VIEW')
  EXECUTE FUNCTION public.leo_enforce_view_security_invoker();

COMMENT ON FUNCTION public.leo_enforce_view_security_invoker() IS
  'RC1/RC3 prevention (20260602): auto-applies security_invoker=on to any newly created/replaced public view so the security_definer_view linter finding cannot re-accumulate.';

-- E2: harden the partition-creation routine to birth partitions with RLS ------
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

  -- RC4 fix: born-secure partitions. RLS + service_role policy on the new child.
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', v_partname);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated;', v_partname);
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = v_partname
      AND policyname = 'service_role_full_access'
  ) THEN
    EXECUTE format(
      'CREATE POLICY "service_role_full_access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
      v_partname);
  END IF;
END
$fn$;

COMMENT ON FUNCTION public.security_audit_events_create_partition(date) IS
  'RC4 fix (20260602): each new monthly partition is born with RLS enabled + service_role-only policy so security_audit_events_* partitions never trip the rls_disabled_in_public / sensitive_columns_exposed linter.';

-- ============================================================================
-- PART F: VERIFICATION -- assert 0 findings remain
-- ============================================================================
DO $$
DECLARE
  bad_views INT;
  bad_tables INT;
BEGIN
  SELECT COUNT(*) INTO bad_views
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v'
    AND NOT (COALESCE(c.reloptions, '{}') @> ARRAY['security_invoker=on']);

  SELECT COUNT(*) INTO bad_tables
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
    AND c.relrowsecurity = false;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'VERIFICATION: public views WITHOUT security_invoker = %', bad_views;
  RAISE NOTICE 'VERIFICATION: public r/p tables WITHOUT RLS         = %', bad_tables;
  RAISE NOTICE '============================================================';

  IF bad_views <> 0 OR bad_tables <> 0 THEN
    RAISE EXCEPTION 'Remediation incomplete: % views and % tables still insecure', bad_views, bad_tables;
  END IF;
  RAISE NOTICE 'SUCCESS: 0 insecure views, 0 RLS-off tables.';
END $$;

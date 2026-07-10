-- SD-LEO-INFRA-CHAIRMAN-GAUGE-RLS-REPAIR-001
-- Gauge fix 3: RLS repairs (gauge-trust map findings B1 + B2, chairman-ratified PR #5847).
--
-- B1: stage_executions has RLS enabled with a service-role-only policy, so authenticated
--     console count queries return a SILENT 0 (no error) over 3,170 real rows — the ops
--     scorecard renders a dead pipeline. Fix: authenticated READ policy (matches the live
--     convention on ventures/workflow_executions; writes remain service-role-only).
-- B2: six tables gate chairman access on the LITERAL email rick@emeraldholdingsgroup.com,
--     while the chairman's live login is rickfelix2000@gmail.com. Live pg_policies sweep
--     found 6 such tables (the SD named 2; the sweep is the authority): objectives,
--     key_results, kr_progress_snapshots, monthly_ceo_reports, sd_key_result_alignment,
--     strategic_vision. Fix: role-based access via a SECURITY DEFINER helper reading
--     auth.users.raw_APP_meta_data (service-role-only writable — NOT the user-editable
--     raw_user_meta_data, which would be a self-service privilege escalation via
--     supabase.auth.updateUser). A direct EXISTS-on-auth.users predicate inside the policy
--     does NOT work: authenticated has no SELECT on auth.users, so the policy would
--     hard-error 42501 on every query (adversarial review round-1 CRITICAL — the seemingly
--     equivalent predicate on archetype_benchmarks only "works" because a sibling
--     USING(true) policy constant-folds it away). The definer function closes both holes
--     and has no JWT-refresh dependency (reads the table live).
--     The chairman's app_metadata role is seeded in the same migration BY UUID (verified
--     live 2026-07-10: id 69c8aa7a-7661-48ed-9779-746fa6290873, the only real user) — no
--     literal email anywhere.
--
-- APPLY IS CHAIRMAN-GATED (requires_chairman_apply): node scripts/apply-migration.js
-- --prod-deploy with @approved-by stamp. The runner wraps this file in its own
-- transaction — no BEGIN/COMMIT here. Idempotent: DROP IF EXISTS before every CREATE.
-- No data change beyond the one app_metadata role seed.
--
-- ─── ROLLBACK (verbatim prior policies, captured from live pg_policies 2026-07-10) ───
-- DROP POLICY IF EXISTS "Authenticated read on stage_executions" ON public.stage_executions;
-- -- (stage_executions had NO authenticated policy before; "Service role full access on
-- --  stage_executions" (ALL, roles {public}, qual auth.role() = 'service_role') is untouched
-- --  by this migration and needs no restore.)
-- For each table T in (objectives, key_results, kr_progress_snapshots, monthly_ceo_reports,
-- sd_key_result_alignment, strategic_vision):
--   DROP POLICY IF EXISTS "Chairman role access on <T>" ON public.<T>;
--   CREATE POLICY "<original name — see list below>" ON public.<T>
--     FOR ALL TO authenticated
--     USING ((auth.jwt() ->> 'email') = 'rick@emeraldholdingsgroup.com')
--     WITH CHECK ((auth.jwt() ->> 'email') = 'rick@emeraldholdingsgroup.com');
-- Original policy names: "Chairman full access on objectives", "Chairman full access on
-- key_results", "Chairman full access on kr_progress_snapshots",
-- "chairman_full_access_monthly_ceo_reports", "Chairman full access on
-- sd_key_result_alignment", "Chairman full access on strategic_vision".
-- DROP FUNCTION IF EXISTS public.is_chairman_role();
-- UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data - 'role'
--   WHERE id = '69c8aa7a-7661-48ed-9779-746fa6290873';
-- ──────────────────────────────────────────────────────────────────────────────────────

-- B2 helper: SECURITY DEFINER so the predicate can read auth.users, which the
-- authenticated role cannot SELECT directly. Keys on raw_APP_meta_data (service-role-only
-- writable). Empty search_path per definer hardening convention.
CREATE OR REPLACE FUNCTION public.is_chairman_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND (raw_app_meta_data ->> 'role') = ANY (ARRAY['admin','chairman'])
  );
$$;

REVOKE ALL ON FUNCTION public.is_chairman_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_chairman_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_chairman_role() TO service_role;

-- Seed the chairman's app_metadata role BY UUID (no literal email; verified live login,
-- raw_user_meta_data.role='admin' already, app metadata previously unset). Idempotent.
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
WHERE id = '69c8aa7a-7661-48ed-9779-746fa6290873'
  AND COALESCE(raw_app_meta_data ->> 'role', '') <> 'admin';

-- B1: stage_executions — authenticated read (write path stays service-role-only).
DROP POLICY IF EXISTS "Authenticated read on stage_executions" ON public.stage_executions;
CREATE POLICY "Authenticated read on stage_executions"
  ON public.stage_executions
  FOR SELECT
  TO authenticated
  USING (true);

-- B2: literal-email → role-based (via the definer helper) on all six swept tables.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('objectives',              'Chairman full access on objectives'),
      ('key_results',             'Chairman full access on key_results'),
      ('kr_progress_snapshots',   'Chairman full access on kr_progress_snapshots'),
      ('monthly_ceo_reports',     'chairman_full_access_monthly_ceo_reports'),
      ('sd_key_result_alignment', 'Chairman full access on sd_key_result_alignment'),
      ('strategic_vision',        'Chairman full access on strategic_vision')
    ) AS v(tbl, old_policy)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t.old_policy, t.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Chairman role access on ' || t.tbl, t.tbl);
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I
        FOR ALL
        TO authenticated
        USING (public.is_chairman_role())
        WITH CHECK (public.is_chairman_role())
    $p$, 'Chairman role access on ' || t.tbl, t.tbl);
  END LOOP;
END $$;

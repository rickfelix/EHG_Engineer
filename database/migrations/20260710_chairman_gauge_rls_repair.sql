-- SD-LEO-INFRA-CHAIRMAN-GAUGE-RLS-REPAIR-001
-- Gauge fix 3: RLS repairs (gauge-trust map findings B1 + B2, chairman-ratified PR #5847).
--
-- B1: stage_executions has RLS enabled with a service-role-only policy, so authenticated
--     console count queries return a SILENT 0 (no error) over 3,170 real rows — the ops
--     scorecard renders a dead pipeline. Fix: authenticated READ policy (ops telemetry the
--     chairman console is entitled to display; writes remain service-role-only).
-- B2: six tables gate chairman access on the LITERAL email rick@emeraldholdingsgroup.com,
--     while the chairman's live login is rickfelix2000@gmail.com (raw_user_meta_data.role
--     = 'admin', verified 2026-07-10). Live pg_policies sweep found 6 such tables (the SD
--     named 2; the sweep is the authority): objectives, key_results, kr_progress_snapshots,
--     monthly_ceo_reports, sd_key_result_alignment, strategic_vision. Fix: role-based
--     predicate matching the convention already live on sibling chairman tables
--     (auth.users.raw_user_meta_data->>'role' IN ('admin','chairman') — reads auth.users
--     live, so no JWT refresh dependency). Service-role bypass policies untouched.
--
-- APPLY IS CHAIRMAN-GATED (requires_chairman_apply): node scripts/apply-migration.js
-- --prod-deploy with @approved-by stamp. No data change at any point.
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
-- ──────────────────────────────────────────────────────────────────────────────────────

BEGIN;

-- B1: stage_executions — authenticated read (write path stays service-role-only)
CREATE POLICY "Authenticated read on stage_executions"
  ON public.stage_executions
  FOR SELECT
  TO authenticated
  USING (true);

-- B2: literal-email → role-based on all six swept tables
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
    -- Convention match: the role-based chairman predicate already live on sibling tables.
    -- Reads auth.users live (no JWT-claim refresh dependency for an already-issued token).
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I
        FOR ALL
        TO authenticated
        USING (EXISTS (
          SELECT 1 FROM auth.users
          WHERE auth.uid() = users.id
            AND (users.raw_user_meta_data ->> 'role') = ANY (ARRAY['admin','chairman'])
        ))
        WITH CHECK (EXISTS (
          SELECT 1 FROM auth.users
          WHERE auth.uid() = users.id
            AND (users.raw_user_meta_data ->> 'role') = ANY (ARRAY['admin','chairman'])
        ))
    $p$, 'Chairman role access on ' || t.tbl, t.tbl);
  END LOOP;
END $$;

COMMIT;

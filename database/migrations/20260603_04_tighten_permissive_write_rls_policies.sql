-- @approved-by: rickfelix@example.com
-- =============================================================================
-- D. Tighten permissive "always true" WRITE policies (rls_policy_always_true)
-- =============================================================================
-- Supabase linter `rls_policy_always_true` flags PERMISSIVE non-SELECT policies
-- whose decision side is literally `true`, for a NON-bypass role
-- (anon / authenticated / PUBLIC) — i.e. RLS is effectively off for writes:
--   * INSERT: WITH CHECK = true
--   * UPDATE: USING = true (and/or WITH CHECK = true)
--   * DELETE: USING = true
--   * ALL   : USING = true (and/or WITH CHECK = true)
-- (Pure SELECT `USING (true)` is intentionally NOT flagged — public read is fine.)
-- Live-verified: 125 such policies (104 write-only INSERT/UPDATE/DELETE + 21 FOR ALL),
-- spanning anon / authenticated / PUBLIC roles. NOTE: several are MISNAMED
-- (`*_service_all`, "Service role full access") yet actually target PUBLIC, not
-- service_role — a latent hole the linter correctly catches. The ~581 genuine
-- service_role permissive policies are the INTENDED backend pattern and are NOT
-- flagged / NOT touched here (service_role bypasses RLS regardless).
--
-- ROOT CAUSE: legacy hand-written `USING/WITH CHECK (true)` write policies that
-- predate the service_role-only access model. The server writes with the
-- service_role key (bypasses RLS); the only anon consumer (realtime-dashboard.js)
-- reads via subscriptions and never writes. So no legitimate flow depends on these.
--
-- UNIFORM, READ-PRESERVING TRANSFORM (per flagged policy P on public table T):
--   * P is FOR ALL  -> DROP P, then RECREATE it FOR SELECT (same name, same roles,
--     original USING expr) so the read access ALL granted via USING is preserved,
--     while INSERT/UPDATE/DELETE for that role are removed. This keeps the anon
--     Realtime SELECT path and authenticated browser reads working, and also closes
--     the `deny_write_*` ALL policies (USING true / CHECK false) whose ALL command
--     silently allowed DELETE.
--   * P is INSERT / UPDATE / DELETE -> DROP P (write-only; no read impact).
--   service_role keeps its own policies and bypasses RLS regardless.
--
-- We only touch PERMISSIVE policies whose clause is LITERALLY `true`, so a policy
-- with any real predicate (e.g. venture-scoped fn_user_has_venture_access) is never
-- affected. Every change is snapshotted to migration_backup.* for exact rollback.
--
-- ATOMIC: the drop+recreate loop runs inside ONE DO block (one transaction), so a
-- mid-run failure rolls back entirely — a table can never be left without the read
-- policy its ALL policy provided. IDEMPOTENT: recreated policies are FOR SELECT and
-- fall out of the flagged set; the snapshot INSERT is ON CONFLICT DO NOTHING.
-- =============================================================================

-- 0. Backup target in a NON-API-exposed schema (so the backup table itself does not
--    trip rls_disabled_in_public). Idempotent.
CREATE SCHEMA IF NOT EXISTS migration_backup;
REVOKE ALL ON SCHEMA migration_backup FROM anon, authenticated;
GRANT USAGE ON SCHEMA migration_backup TO service_role;

CREATE TABLE IF NOT EXISTS migration_backup.rls_policy_backup_20260603 (
  id              serial PRIMARY KEY,
  tbl             text NOT NULL,
  polname         text NOT NULL,
  polcmd          "char" NOT NULL,
  permissive      boolean NOT NULL,
  roles_sql       text NOT NULL,    -- 'public' or 'role_a, role_b'
  using_expr      text,             -- NULL if the policy had no USING clause
  withcheck_expr  text,             -- NULL if the policy had no WITH CHECK clause
  backed_up_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tbl, polname)
);

-- 1. Snapshot the exact policies we are about to change (runs BEFORE the loop).
INSERT INTO migration_backup.rls_policy_backup_20260603
  (tbl, polname, polcmd, permissive, roles_sql, using_expr, withcheck_expr)
SELECT c.relname, pol.polname, pol.polcmd, pol.polpermissive,
       CASE WHEN pol.polroles = '{0}' THEN 'public'
            ELSE (SELECT string_agg(quote_ident(rolname), ', ') FROM pg_roles WHERE oid = ANY(pol.polroles)) END,
       pg_get_expr(pol.polqual,      pol.polrelid),
       pg_get_expr(pol.polwithcheck, pol.polrelid)
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND pol.polpermissive
  AND pol.polcmd <> 'r'
  AND (pg_get_expr(pol.polqual, pol.polrelid) = 'true'
       OR pg_get_expr(pol.polwithcheck, pol.polrelid) = 'true')
  AND NOT (pol.polroles <> '{0}'
           AND (SELECT bool_and(rolname = 'service_role') FROM pg_roles WHERE oid = ANY(pol.polroles)))
ON CONFLICT (tbl, polname) DO NOTHING;

-- 2. Apply the transform atomically.
DO $tighten$
DECLARE
  p RECORD;
  v_roles_sql TEXT;
  v_using TEXT;
  v_dropped INTEGER := 0;
  v_converted INTEGER := 0;
BEGIN
  FOR p IN
    SELECT pol.polname, c.relname AS tbl, pol.polcmd, pol.polroles,
           coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') AS using_expr
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND pol.polpermissive
      AND pol.polcmd <> 'r'
      AND (pg_get_expr(pol.polqual, pol.polrelid) = 'true'
           OR pg_get_expr(pol.polwithcheck, pol.polrelid) = 'true')
      AND NOT (pol.polroles <> '{0}'
               AND (SELECT bool_and(rolname = 'service_role') FROM pg_roles WHERE oid = ANY(pol.polroles)))
    ORDER BY c.relname, pol.polname
  LOOP
    IF p.polroles = '{0}' THEN
      v_roles_sql := 'public';
    ELSE
      SELECT string_agg(quote_ident(rolname), ', ') INTO v_roles_sql
      FROM pg_roles WHERE oid = ANY(p.polroles);
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.polname, p.tbl);

    IF p.polcmd = '*' THEN
      v_using := CASE WHEN p.using_expr = '' THEN 'true' ELSE p.using_expr END;
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR SELECT TO %s USING (%s)',
        p.polname, p.tbl, v_roles_sql, v_using);
      v_converted := v_converted + 1;
      RAISE NOTICE 'D: ALL->SELECT public.%."%" (roles: %)', p.tbl, p.polname, v_roles_sql;
    ELSE
      v_dropped := v_dropped + 1;
      RAISE NOTICE 'D: dropped write policy public.%."%" (cmd: %, roles: %)', p.tbl, p.polname, p.polcmd, v_roles_sql;
    END IF;
  END LOOP;

  RAISE NOTICE 'D COMPLETE: % write policies dropped, % ALL policies converted to SELECT-only.', v_dropped, v_converted;
END
$tighten$;

-- 3. Verification: ZERO permissive non-SELECT always-true policies for a
--    non-service_role role remain.
DO $verify$
DECLARE
  v_bad INTEGER;
  v_detail TEXT;
BEGIN
  SELECT count(*), string_agg(format('%s.%s', c.relname, pol.polname), ', ')
    INTO v_bad, v_detail
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND pol.polpermissive
    AND pol.polcmd <> 'r'
    AND (pg_get_expr(pol.polqual, pol.polrelid) = 'true'
         OR pg_get_expr(pol.polwithcheck, pol.polrelid) = 'true')
    AND NOT (pol.polroles <> '{0}'
             AND (SELECT bool_and(rolname = 'service_role') FROM pg_roles WHERE oid = ANY(pol.polroles)));

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'D NOT cleared: % permissive always-true write policy(ies) remain: %', v_bad, v_detail;
  END IF;
  RAISE NOTICE 'D VERIFIED: 0 permissive always-true write policies for non-service_role remain.';
END
$verify$;

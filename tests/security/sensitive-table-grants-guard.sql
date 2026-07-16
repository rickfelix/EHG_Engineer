-- FR-4 STANDING GUARD — SD-LEO-INFRA-GOV-TABLE-WRITE-GRANT-REVOKE-001.
--
-- Asserts the 6 chairman-authority / kill-switch tables carry NO anon/authenticated write grant
-- (INSERT/UPDATE/DELETE/TRUNCATE) in pg_class.relacl, EXCEPT the ONE legitimate carve-out:
-- chairman_directives authenticated INSERT + UPDATE (the RLS fn_is_chairman()-gated chairman path).
--
-- RAISEs EXCEPTION on any violation, so a future migration or a Supabase default-privilege re-grant
-- that silently re-broadens the write surface fails this guard. Intended to run:
--   (a) POST-APPLY once, to confirm the REVOKE migration achieved the target state; and
--   (b) as a recurring CI/probe check thereafter.
--
-- NOTE: run PRE-APPLY it will (correctly) RAISE — the current state has all 6 tables fully write-granted
-- to anon + authenticated; that IS the vulnerability this SD closes.

DO $$
DECLARE
  v_violations text;
BEGIN
  SELECT string_agg(format('%s:%s:%s', tbl, grantee, priv), ', ' ORDER BY tbl, grantee, priv)
  INTO v_violations
  FROM (
    SELECT c.relname AS tbl, g.grantee::regrole::text AS grantee, g.privilege_type AS priv
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    CROSS JOIN LATERAL aclexplode(c.relacl) AS g
    WHERE c.relname IN ('protocol_constitution','leo_feature_flags','eva_vision_documents',
                        'chairman_decisions','chairman_directives','ventures_kill_log')
      AND g.grantee::regrole::text IN ('anon','authenticated')
      AND g.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
      -- Carve-out: chairman_directives authenticated INSERT+UPDATE is the ONE legitimate exception.
      AND NOT (c.relname = 'chairman_directives'
               AND g.grantee::regrole::text = 'authenticated'
               AND g.privilege_type IN ('INSERT','UPDATE'))
  ) v;

  IF v_violations IS NOT NULL THEN
    RAISE EXCEPTION 'FR-4 GUARD FAILED — sensitive-table write grant present/re-broadened: %', v_violations;
  END IF;
  RAISE NOTICE 'FR-4 GUARD PASSED — no anon/authenticated write grant on the 6 sensitive tables (except chairman_directives authenticated INSERT/UPDATE carve-out).';
END $$;

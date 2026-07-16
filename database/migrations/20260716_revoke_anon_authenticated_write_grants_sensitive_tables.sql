-- Defense-in-depth: REVOKE redundant anon/authenticated write grants on chairman-authority + kill-switch tables.
-- SD-LEO-INFRA-GOV-TABLE-WRITE-GRANT-REVOKE-001 (F7 security, coordinator-directed).
--
-- WHY: all 6 tables carry the Supabase-default base grant giving anon AND authenticated FULL write+truncate
-- (INSERT/UPDATE/DELETE/TRUNCATE) at the GRANT layer (verified live via pg_class.relacl 2026-07-16). RLS is
-- ENABLED on all 6 and is the SOLE write barrier — a single RLS misconfig/policy bug would expose these to
-- anon writes. This adds a SECOND layer: the GRANT layer ALSO denies. RLS is unchanged. service_role (the
-- only legitimate writer, which also BYPASSes RLS) is UNTOUCHED. Complements SD-LEO-INFRA-FN-IS-CHAIRMAN-
-- APP-METADATA-001 (identity layer); this SD hardens the GRANT layer.
--
-- NON-BREAKING (verified live): the 5 FR-1 tables have service_role-only / deny-for-public write RLS (no
-- anon/authenticated permissive write policy), so revoking their anon/authenticated write grants changes
-- nothing a legitimate caller could do. chairman_directives is the ONE exception (FR-2) — it has a
-- legitimate authenticated write path (chairman_directives_insert / _update, WITH CHECK fn_is_chairman());
-- because GRANT is checked BEFORE RLS, its authenticated INSERT+UPDATE grants are KEPT.
--
-- IDEMPOTENT: REVOKE of an absent privilege is a harmless no-op. Order-independent; no dependency on the
-- fn_is_chairman migration (independent layer).
--
-- ROLLBACK (chairman-gated): re-GRANT the exact revoked privileges per table if a legitimate anon/
-- authenticated write path is later discovered (none exists today).
--
-- STAGED, NOT YET APPROVED FOR APPLY. APPLY IS CHAIRMAN-ONLY / NON-DELEGATABLE (REVOKE = access-control /
-- permission change, fail-closed, outside the Adam @delegated-by additive tier). Intentionally omits the
-- @approved-by tag until the chairman explicitly applies it.
--
-- requires-chairman-apply

-- FR-1: tables with NO legitimate non-service_role writer — revoke all write from anon AND authenticated.
-- (SELECT intentionally kept; write-hardening only.)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.protocol_constitution  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.leo_feature_flags      FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.eva_vision_documents   FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.chairman_decisions     FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ventures_kill_log      FROM anon, authenticated;

-- FR-2: chairman_directives SPECIAL CASE — it HAS a legitimate authenticated write path
-- (chairman_directives_insert / _update, WITH CHECK fn_is_chairman()). Do NOT revoke authenticated
-- INSERT/UPDATE (GRANT is checked before RLS; a blanket revoke would break the chairman app write path).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.chairman_directives FROM anon;            -- anon: zero legit access
REVOKE DELETE, TRUNCATE               ON public.chairman_directives FROM authenticated;     -- no legit authenticated delete
-- KEEP: authenticated INSERT, UPDATE on chairman_directives (RLS-gated by fn_is_chairman()).

COMMENT ON TABLE public.chairman_directives IS
  'Write grants hardened by SD-LEO-INFRA-GOV-TABLE-WRITE-GRANT-REVOKE-001: anon has no write; authenticated keeps only INSERT+UPDATE (RLS fn_is_chairman()-gated); DELETE/TRUNCATE revoked. service_role unaffected.';

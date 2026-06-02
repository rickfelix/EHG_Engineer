-- @approved-by: rickfelix@example.com
-- =============================================================================
-- Pin search_path on SECURITY INVOKER functions (function_search_path_mutable)
-- =============================================================================
-- Companion to 20260602_pin_search_path_security_definer_functions.sql (PR #4168),
-- which closed the 14 SECURITY DEFINER findings. This migration clears the
-- application-owned remainder of the public functions that still trip the
-- Supabase linter `function_search_path_mutable`. These are all SECURITY INVOKER.
--
-- TARGET-SET ARITHMETIC (live-verified):
--   751 public SECURITY INVOKER functions currently have a MUTABLE search_path.
--   That set partitions CLEANLY by owner + extension membership:
--     * 526 owned by `postgres` (our role) and NOT extension members -> PIN here.
--     * 225 owned by `supabase_admin` and members of an extension installed into
--       `public` (pgvector/`vector`: 114, `ltree`: 80, `pg_trgm`: 31) -> HELD.
--   The two groups are perfectly disjoint (0 owned-by-us-but-extension, 0
--   not-owned-but-not-extension), so the discriminator is unambiguous.
--
-- WHY THE 225 EXTENSION FUNCTIONS ARE HELD (deliberate, not a gap):
--   (1) OWNERSHIP — `ALTER FUNCTION ... SET search_path` requires ownership.
--       These are owned by `supabase_admin`; the pooler `postgres` role we deploy
--       with CANNOT alter them (verified: ALTER raises "must be owner of function").
--   (2) EXTENSION-MANAGED — they are C-language extension internals
--       (vector_*/halfvec_*/l2_distance, ltree_*/lca, gtrgm_*/similarity, …).
--       Their search_path is the extension's concern; pinning would be fragile
--       (potentially reverted on extension upgrade) and out of scope for an
--       application migration. They are flagged by the linter only because these
--       extensions are installed into `public` rather than `extensions`.
--   They are reported as HELD; the verification below expects exactly 225 to
--   remain mutable after this migration.
--
-- WHY THIS IS LINT HYGIENE, NOT A SECURITY CONTROL:
-- A SECURITY INVOKER function runs as the CALLER, so an unpinned search_path is
-- NOT the CVE-2018-1058 escalation vector it is for SECURITY DEFINER. The linter
-- still flags it because a pinned path makes name resolution DETERMINISTIC and
-- independent of session state. Goal: give every owned function a NON-MUTABLE
-- search_path WITHOUT changing its runtime name resolution.
--
-- BEHAVIOR-PRESERVING PINNED PATH:  public, extensions
--   * `public` FIRST  -> every unqualified reference to a public table/function
--     resolves exactly as it does today (these functions currently inherit the
--     caller's path, which for the app/service roles is public-first).
--   * `extensions`    -> unqualified extension-function calls keep working. Live
--     analysis of the owned set found unqualified `digest()` and
--     `gen_random_uuid()`; both resolve to the `extensions` schema
--     (extensions.digest / extensions.gen_random_uuid). gen_random_uuid also
--     exists in pg_catalog, which stays implicitly first regardless — so this is
--     belt-and-suspenders, never a behavior change.
--   * pg_catalog and pg_temp are NOT listed: Postgres always searches pg_catalog
--     implicitly FIRST (so all builtins — jsonb_*, NOW(), format(), to_jsonb(),
--     current_setting(), EXTRACT(), CAST, etc. — resolve unchanged) and appends
--     pg_temp; leaving them implicit preserves the exact default ordering.
--   * information_schema is reachable by QUALIFIED name regardless of path. The
--     only dynamic-SQL function in the owned set, validate_schema_expectation(uuid),
--     EXECUTEs stored queries that reference information_schema.columns /
--     information_schema.tables fully-qualified — so pinning does not change its
--     resolution.
--
-- ANALYSIS THAT JUSTIFIES A SINGLE UNIFORM PATH FOR THE OWNED SET (no extra
-- schemas needed): live scan of all 526 owned target functions
-- (pg_get_functiondef, comment-stripped) found:
--     - QUALIFIED references to non-public/non-extensions schemas
--       (auth/vault/cron/net/graphql/realtime/storage/governance/portfolio/
--        runtime/staging/supabase_migrations): ZERO.
--     - Functions that SET search_path in their own body: ZERO.
--     - Functions using current_schema() or building bare object names whose
--       schema depends on the caller's path: ZERO genuine cases.
--   => Every owned function takes `public, extensions`. ZERO owned functions held
--      for behavioral reasons; the only holds are the 225 extension/ownership ones.
--
-- We do NOT rewrite function bodies. `ALTER FUNCTION ... SET search_path` is
-- non-destructive to the body and takes effect on the next call.
--
-- IDEMPOTENT: the DO-block selects the "owned SECURITY INVOKER + mutable" target
-- set by predicate, so re-running after a partial apply is a no-op for any
-- function already pinned, and ALTER ... SET search_path is itself idempotent.
-- OVERLOAD-SAFE: iterates pg_proc using pg_get_function_identity_arguments(), so
-- every overload is pinned by its full identity signature.
-- SCOPE GUARDS:
--   * prosecdef = false      -> SECURITY DEFINER handled by companion migration.
--   * owner = current role   -> never attempt to ALTER a function we cannot own.
--   * NOT an extension member -> never touch extension-managed internals.
--
-- SD: function_search_path_mutable hardening (SECURITY INVOKER remainder)
-- =============================================================================

DO $pin$
DECLARE
  r RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef = false                       -- SECURITY INVOKER only.
      AND pg_get_userbyid(p.proowner) = current_user -- only functions we own (ALTER requires ownership).
      AND NOT EXISTS (                               -- not an extension member.
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
      )
      AND NOT EXISTS (                               -- not already pinned (idempotent re-run).
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) x
        WHERE x LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public, extensions',
      r.proname, r.args
    );
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Pinned search_path = public, extensions on % owned SECURITY INVOKER function(s).', v_count;
END
$pin$;

-- -----------------------------------------------------------------------------
-- Verification: after this migration, the ONLY public functions left with a
-- mutable search_path must be the deliberately-HELD extension-member /
-- non-owned functions. We assert:
--   (a) ZERO owned, non-extension SECURITY INVOKER functions remain mutable
--       (i.e. this migration fully cleared its responsibility set), and
--   (b) every remaining mutable public function IS an extension member (the
--       expected held population) — fail loudly if a non-extension function
--       somehow slipped through.
-- The expected remaining count is the held set (225 at authoring time); we do
-- NOT hard-code it, we assert the STRUCTURAL property (all remaining are
-- extension members) which is the durable invariant.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_owned_nonext_mutable INTEGER;
  v_nonext_mutable       INTEGER;
  v_held_total           INTEGER;
  v_detail               TEXT;
BEGIN
  -- (a) owned, non-extension, INVOKER, still mutable -> must be 0.
  SELECT count(*)
    INTO v_owned_nonext_mutable
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND p.prosecdef = false
    AND pg_get_userbyid(p.proowner) = current_user
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.classid='pg_proc'::regclass AND d.deptype='e')
    AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}'::text[])) x WHERE x LIKE 'search_path=%');

  IF v_owned_nonext_mutable > 0 THEN
    RAISE EXCEPTION 'function_search_path_mutable NOT cleared: % owned non-extension SECURITY INVOKER function(s) still mutable.', v_owned_nonext_mutable;
  END IF;

  -- (b) any remaining mutable public function that is NOT an extension member -> fail.
  SELECT count(*), string_agg(p.oid::regprocedure::text, ', ')
    INTO v_nonext_mutable, v_detail
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}'::text[])) x WHERE x LIKE 'search_path=%')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.classid='pg_proc'::regclass AND d.deptype='e');

  IF v_nonext_mutable > 0 THEN
    RAISE EXCEPTION 'Unexpected mutable non-extension public function(s) remain (% ): %', v_nonext_mutable, v_detail;
  END IF;

  -- Informational: report the held (extension-member) population.
  SELECT count(*)
    INTO v_held_total
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}'::text[])) x WHERE x LIKE 'search_path=%');

  RAISE NOTICE 'Verification passed: 0 owned/non-extension functions mutable; % extension-member function(s) HELD (expected ~225, extension-managed/non-owned).', v_held_total;
END
$verify$;

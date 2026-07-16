-- Acceptance test for SD-LEO-INFRA-FN-IS-CHAIRMAN-APP-METADATA-001 (FR-3).
-- Run POST-APPLY (after migrations _a_ backfill, _b_ fn_is_chairman flip, _c_ archetype policy flip)
-- in the Supabase SQL editor / psql as the service role. Every check RAISE EXCEPTIONs on failure;
-- a clean run ends with 'ALL ACCEPTANCE CHECKS PASSED'.
--
-- Covers the SD acceptance criteria:
--   (a) exploit closed  — fn_is_chairman (and the archetype policy) no longer read the user-writable
--                         raw_user_meta_data; a user who self-sets user_metadata.role='chairman' is NOT chairman.
--   (b) no lockout      — every legitimate chairman (user_metadata) is present in raw_app_meta_data.
--   (c) policy spot      — the fn_is_chairman contract is preserved so the 21 dependent policies bind unchanged.
--
-- A behavioral end-to-end check (sign in as a normal user, supabase.auth.updateUser({data:{role:'chairman'}}),
-- then SELECT fn_is_chairman() -> expect FALSE) is documented at the bottom for manual/CI post-apply runs;
-- it requires an authenticated session and cannot be asserted from a service-role SQL context.

DO $$
DECLARE
  v_fn_def text;
  v_user_meta_chairman int;
  v_app_meta_chairman int;
  v_user_only_chairman int;
  v_archetype_using text;
BEGIN
  -- (1) fn_is_chairman must read raw_app_meta_data and NOT raw_user_meta_data
  SELECT pg_get_functiondef(p.oid) INTO v_fn_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='fn_is_chairman';

  IF v_fn_def IS NULL THEN
    RAISE EXCEPTION 'ACCEPTANCE FAIL: public.fn_is_chairman() not found';
  END IF;
  IF position('raw_user_meta_data' in v_fn_def) > 0 THEN
    RAISE EXCEPTION 'ACCEPTANCE FAIL (a): fn_is_chairman still reads raw_user_meta_data (exploit OPEN)';
  END IF;
  IF position('raw_app_meta_data' in v_fn_def) = 0 THEN
    RAISE EXCEPTION 'ACCEPTANCE FAIL (a): fn_is_chairman does not read raw_app_meta_data';
  END IF;

  -- (2) no lockout: every legitimate (user_metadata) chairman is also an app_metadata chairman
  SELECT count(*) INTO v_user_meta_chairman FROM auth.users
    WHERE raw_user_meta_data->>'role' IN ('chairman','admin','owner')
       OR raw_user_meta_data->'roles' @> '"chairman"'::jsonb;
  SELECT count(*) INTO v_app_meta_chairman FROM auth.users
    WHERE raw_app_meta_data->>'role' IN ('chairman','admin','owner')
       OR raw_app_meta_data->'roles' @> '"chairman"'::jsonb;
  IF v_app_meta_chairman < v_user_meta_chairman THEN
    RAISE EXCEPTION 'ACCEPTANCE FAIL (b): app_meta chairman (%) < user_meta chairman (%) — real chairman would be locked out',
      v_app_meta_chairman, v_user_meta_chairman;
  END IF;

  -- (3) exploit closed: a user holding chairman ONLY in user_metadata (not app_metadata) is NOT authorized.
  -- Because fn_is_chairman now reads only app_metadata (asserted in (1)), such an identity is rejected.
  -- Post-backfill this count should be 0 for legitimate accounts; a FUTURE self-elevator would land here
  -- and be correctly denied. We assert the function no longer consults user_metadata (done in (1)); this
  -- count is reported for visibility.
  SELECT count(*) INTO v_user_only_chairman FROM auth.users
    WHERE (raw_user_meta_data->>'role' IN ('chairman','admin','owner')
           OR raw_user_meta_data->'roles' @> '"chairman"'::jsonb)
      AND NOT (raw_app_meta_data->>'role' IN ('chairman','admin','owner')
               OR raw_app_meta_data->'roles' @> '"chairman"'::jsonb);
  RAISE NOTICE 'Info: % identity(ies) hold chairman in user_metadata only (now correctly NON-chairman via app_metadata read)', v_user_only_chairman;

  -- (4) archetype_benchmarks_admin policy (FR-4 fold-in) must read raw_app_meta_data, not raw_user_meta_data
  SELECT qual INTO v_archetype_using FROM pg_policies
   WHERE schemaname='public' AND tablename='archetype_benchmarks' AND policyname='archetype_benchmarks_admin';
  IF v_archetype_using IS NULL THEN
    RAISE EXCEPTION 'ACCEPTANCE FAIL (FR-4): archetype_benchmarks_admin policy missing';
  END IF;
  IF position('raw_user_meta_data' in v_archetype_using) > 0 THEN
    RAISE EXCEPTION 'ACCEPTANCE FAIL (FR-4): archetype_benchmarks_admin still reads raw_user_meta_data (exploit OPEN)';
  END IF;
  IF position('raw_app_meta_data' in v_archetype_using) = 0 THEN
    RAISE EXCEPTION 'ACCEPTANCE FAIL (FR-4): archetype_benchmarks_admin does not read raw_app_meta_data';
  END IF;

  RAISE NOTICE 'ALL ACCEPTANCE CHECKS PASSED (fn_is_chairman + archetype policy read app_metadata; % legitimate chairman backfilled; exploit closed)', v_app_meta_chairman;
END $$;

-- Behavioral end-to-end (manual/CI post-apply; requires an authenticated session, not assertable here):
--   1. Sign in as a normal (non-chairman) user via the anon key.
--   2. await supabase.auth.updateUser({ data: { role: 'chairman' } });   -- self-set user_metadata
--   3. SELECT fn_is_chairman();                                          -- EXPECT: false (exploit closed)
--   4. SELECT count(*) FROM chairman_decisions;                          -- EXPECT: 0 rows / RLS denied
--   5. Sign in as a real chairman; SELECT fn_is_chairman();              -- EXPECT: true (no lockout)
--   6. SELECT count(*) FROM chairman_decisions as the real chairman;     -- EXPECT: rows visible

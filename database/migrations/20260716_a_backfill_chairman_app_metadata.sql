-- Backfill legitimate chairman/admin identities into auth.users.raw_app_meta_data.
-- SD-LEO-INFRA-FN-IS-CHAIRMAN-APP-METADATA-001 (FR-1). Coordinator-sourced SECURITY-CRITICAL.
--
-- WHY: fn_is_chairman() and the archetype_benchmarks_admin RLS policy currently authorize the
-- chairman/admin role off auth.users.raw_user_meta_data — the Supabase USER-WRITABLE user_metadata
-- surface (any authenticated user can self-set it via supabase.auth.updateUser({data:{role:'chairman'}})).
-- The fix (migrations _b_ and _c_) flips both reads to raw_app_meta_data (service-role-only, NOT
-- user-writable). SEQUENCING HAZARD (verified live at filing): user_meta_chairman=2, app_meta_chairman=0
-- — flipping the reads BEFORE this backfill would strand BOTH real chairman accounts and lock everyone
-- out of all 21 fn_is_chairman-gated policies + the archetype policy. THIS MIGRATION MUST BE APPLIED
-- FIRST (before _b_ and _c_).
--
-- Method: copy the qualifying role (and roles array, if present) from raw_user_meta_data into
-- raw_app_meta_data for exactly the identities that currently hold chairman/admin/owner in user_metadata.
-- Idempotent (re-run is a no-op once backfilled) and readback-verified (raises if app_meta chairman
-- count < user_meta chairman count after the update). Merge-preserves any pre-existing app_metadata keys.
--
-- STAGED, NOT YET APPROVED FOR APPLY. APPLY IS CHAIRMAN-ONLY / NON-DELEGATABLE (this is an
-- access-control change — permission class, outside the @delegated-by additive tier). This file
-- intentionally omits the @approved-by tag until the chairman explicitly applies it (staged, pending
-- explicit chairman GO — see check-migration-readiness.mjs). The build worker STAGES; the chairman APPLIES.
--
-- requires-chairman-apply
--
-- SUPERSEDED — DO NOT APPLY (SD-LEO-FIX-IDENTIFY-RETIRE-TEST-001, 2026-08-22):
-- Applying this migration REVERSES the chairman-approved fix in
-- database/migrations/20260731_fix_chairman_privilege_app_metadata.sql, which flipped
-- fn_is_chairman()/is_chairman_role() to read raw_app_meta_data ONLY and deliberately left
-- test@ehg.dev un-backfilled because that account is approved for deletion (chairman decision
-- d11b99a0, 2026-07-31). Running this UPDATE today would copy raw_user_meta_data.role='owner'
-- into raw_app_meta_data for test@ehg.dev, re-granting chairman-equivalent privilege across the
-- 29 RLS policies + 22 functions that consume fn_is_chairman()/is_chairman_role() (per the
-- 20260731 migration's own header) — to the exact account slated for deletion. The guard below
-- makes this file a hard no-op; the original staged body is preserved beneath it, unreachable,
-- for historical record only.

DO $$
BEGIN
  RAISE EXCEPTION 'SUPERSEDED: this migration would reverse the chairman-approved 20260731_fix_chairman_privilege_app_metadata.sql fix and re-grant privilege to test@ehg.dev (approved for deletion, decision d11b99a0). DO NOT APPLY. See SD-LEO-FIX-IDENTIFY-RETIRE-TEST-001.';
END $$;

DO $$
DECLARE
  v_user_meta_chairman int;
  v_app_meta_before    int;
  v_app_meta_after     int;
  v_updated            int;
BEGIN
  SELECT count(*) INTO v_user_meta_chairman FROM auth.users
    WHERE raw_user_meta_data->>'role' IN ('chairman','admin','owner')
       OR raw_user_meta_data->'roles' @> '"chairman"'::jsonb;

  SELECT count(*) INTO v_app_meta_before FROM auth.users
    WHERE raw_app_meta_data->>'role' IN ('chairman','admin','owner')
       OR raw_app_meta_data->'roles' @> '"chairman"'::jsonb;

  -- Copy the qualifying role (and roles, when present) into app_metadata, merge-preserving
  -- any existing app_metadata keys. Idempotency guard: skip rows whose app_metadata role already
  -- equals the user_metadata role (re-run is a no-op).
  UPDATE auth.users u
  SET raw_app_meta_data =
        COALESCE(u.raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('role', u.raw_user_meta_data->>'role')
        || CASE WHEN u.raw_user_meta_data ? 'roles'
                THEN jsonb_build_object('roles', u.raw_user_meta_data->'roles')
                ELSE '{}'::jsonb END
  WHERE (u.raw_user_meta_data->>'role' IN ('chairman','admin','owner')
         OR u.raw_user_meta_data->'roles' @> '"chairman"'::jsonb)
    AND COALESCE(u.raw_app_meta_data->>'role','') IS DISTINCT FROM u.raw_user_meta_data->>'role';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT count(*) INTO v_app_meta_after FROM auth.users
    WHERE raw_app_meta_data->>'role' IN ('chairman','admin','owner')
       OR raw_app_meta_data->'roles' @> '"chairman"'::jsonb;

  RAISE NOTICE 'chairman/admin app_metadata backfill: user_meta_chairman=%, app_meta_before=%, rows_updated=%, app_meta_after=%',
    v_user_meta_chairman, v_app_meta_before, v_updated, v_app_meta_after;

  -- Readback assertion: after backfill, every legitimate (user_meta) chairman MUST also be an
  -- app_meta chairman, so the subsequent read-flip cannot lock anyone out.
  IF v_app_meta_after < v_user_meta_chairman THEN
    RAISE EXCEPTION 'Backfill readback FAILED: app_meta chairman count (%) < user_meta chairman count (%) — DO NOT apply migrations _b_/_c_ until resolved',
      v_app_meta_after, v_user_meta_chairman;
  END IF;
END $$;

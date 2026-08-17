-- Migration: set_venture_pbn_verdict_stage_zero(uuid, jsonb) — narrow, safe retroactive PBN write.
-- SD-FDBK-FIX-VENTURE-CRACK-GATE-001 FR-6.
--
-- Not chairman-gated: this is a plain FUNCTION with no RLS policy or trigger attached (unlike
-- the two companion migrations in database/chairman-gated/), so it is additive-only in the
-- sense isDelegatableForApply() scopes to Adam-delegated apply.
--
-- WHY A NARROW, NAMED FUNCTION AND NOT A GENERIC "set jsonb path on any table" RPC: a generic
-- writer parameterized by table name and path would be a standing arbitrary-write capability
-- with no fixed blast radius — every future caller inherits whatever privilege the function
-- runs with, against any table it names. This function does exactly one thing: it sets
-- ventures.metadata->stage_zero->pbn_verdict for one venture, via jsonb_set with create_missing
-- so intermediate keys are created if absent, and it touches no other path in metadata.
--
-- WHY jsonb_set AND NOT A JS SPREAD: jsonb_set is a single atomic UPDATE ... SET metadata =
-- jsonb_set(metadata, ...) — no read-modify-write race, no risk of clobbering a concurrent
-- writer's change to a sibling key (a JS-side `{...existing, stage_zero: {...existing.stage_zero,
-- pbn_verdict}}` spread is a read-then-write and can lose an interleaved update).

BEGIN;

CREATE OR REPLACE FUNCTION public.set_venture_pbn_verdict_stage_zero(p_venture_id uuid, p_pbn_verdict jsonb)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $fn$
  UPDATE public.ventures
  SET metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{stage_zero,pbn_verdict}',
    p_pbn_verdict,
    true  -- create_missing: creates the "stage_zero" key too if a venture somehow lacks it
  )
  WHERE id = p_venture_id;
$fn$;

COMMENT ON FUNCTION public.set_venture_pbn_verdict_stage_zero(uuid, jsonb) IS
  'SD-FDBK-FIX-VENTURE-CRACK-GATE-001 FR-6. Retroactive PBN write for pre-gate ventures. '
  'Sets ONLY metadata->stage_zero->pbn_verdict via jsonb_set (atomic, no read-modify-write race, '
  'never touches sibling metadata keys). Narrow and single-purpose by design — not a generic '
  'jsonb-path writer.';

-- pg_default_acl grants EXECUTE on new public functions to anon AND authenticated by default —
-- this function writes to ventures, so leaving that default would let the anon key retroactively
-- stamp a PBN verdict on any venture.
REVOKE ALL ON FUNCTION public.set_venture_pbn_verdict_stage_zero(uuid, jsonb) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_venture_pbn_verdict_stage_zero(uuid, jsonb) TO service_role;

DO $verify$
BEGIN
  IF to_regprocedure('public.set_venture_pbn_verdict_stage_zero(uuid, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'set_venture_pbn_verdict_stage_zero did not land';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public' AND routine_name = 'set_venture_pbn_verdict_stage_zero'
      AND grantee IN ('anon', 'authenticated', 'PUBLIC')
  ) THEN
    RAISE EXCEPTION 'set_venture_pbn_verdict_stage_zero: a non-service grant is present — this function writes venture metadata and must not be anon/authenticated-executable';
  END IF;
END
$verify$;

COMMIT;

-- ROLLBACK:  DROP FUNCTION IF EXISTS public.set_venture_pbn_verdict_stage_zero(uuid, jsonb);

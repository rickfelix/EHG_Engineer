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
--
-- ADVERSARIAL REVIEW FIX (post-merge SECURITY pass, finding S1): the caller
-- (scripts/eva/retroactive-pbn-score.mjs) already refuses to call this RPC when
-- ventures.metadata.stage_zero.pbn_verdict is already populated — but that check runs in JS,
-- entirely client-side. Nothing stopped a direct `supabase.rpc('set_venture_pbn_verdict_stage_zero', ...)`
-- call from silently clobbering an existing verdict; the do-not-overwrite invariant this SD's PBN
-- design depends on (evaluateCrackGateStatus/venture_pbn_status both treat metadata as
-- authoritative) was enforced by convention, not by the database. The guard now lives here too,
-- so it holds regardless of which caller reaches the function.
--
-- WHY THE GUARD IS IN THE UPDATE'S WHERE CLAUSE, NOT A SEPARATE SELECT-THEN-CHECK: a first draft
-- of this fix did `SELECT ... INTO v_existing` followed by `IF v_existing IS NOT NULL THEN RAISE`
-- then a plain UPDATE. That is a check-then-act race — under READ COMMITTED (the default), two
-- concurrent calls for the SAME p_venture_id can both pass the SELECT while v_existing is still
-- NULL, and the second call's UPDATE then silently overwrites the first call's just-committed
-- write once it acquires the row lock, without ever re-running the check. Folding the guard into
-- the UPDATE's own WHERE predicate makes the check-and-write one atomic statement: Postgres
-- serializes concurrent UPDATEs on the same row via row-level locking, and the blocked statement
-- re-evaluates its WHERE clause against the fresh committed row once unblocked — so a second
-- caller for an already-scored venture always updates zero rows, never a stale-read overwrite.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_venture_pbn_verdict_stage_zero(p_venture_id uuid, p_pbn_verdict jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.ventures
  SET metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{stage_zero,pbn_verdict}',
    p_pbn_verdict,
    true  -- create_missing: creates the "stage_zero" key too if a venture somehow lacks it
  )
  WHERE id = p_venture_id
    -- Atomic already-scored guard: absent-path (no key) and explicit jsonb null are both
    -- "not scored yet", mirroring venture_pbn_status(uuid)'s own treatment of the same field
    -- (a jsonb `null` there is likewise never read as a real verdict).
    AND (
      metadata #> '{stage_zero,pbn_verdict}' IS NULL
      OR jsonb_typeof(metadata #> '{stage_zero,pbn_verdict}') = 'null'
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 AND EXISTS (SELECT 1 FROM public.ventures WHERE id = p_venture_id) THEN
    -- The venture exists but the UPDATE touched no rows, so the WHERE guard is what excluded
    -- it: a pbn_verdict is already present. (A nonexistent p_venture_id also updates zero rows
    -- and is deliberately left as a silent no-op, unchanged from this function's prior behavior.)
    RAISE EXCEPTION 'set_venture_pbn_verdict_stage_zero: venture % already has a pbn_verdict — refusing to overwrite; the guard is enforced atomically by the UPDATE...WHERE predicate above, not a separate check-then-act SELECT, so it holds under concurrent callers too', p_venture_id;
  END IF;
END
$fn$;

COMMENT ON FUNCTION public.set_venture_pbn_verdict_stage_zero(uuid, jsonb) IS
  'SD-FDBK-FIX-VENTURE-CRACK-GATE-001 FR-6. Retroactive PBN write for pre-gate ventures. '
  'Sets ONLY metadata->stage_zero->pbn_verdict via an atomic UPDATE...WHERE (both the '
  'jsonb_set write and the already-scored guard live in one statement — no read-modify-write '
  'race, no risk of clobbering a concurrent writer, no check-then-act TOCTOU gap between two '
  'concurrent calls for the same venture). Never touches sibling metadata keys. Narrow and '
  'single-purpose by design — not a generic jsonb-path writer. RAISES if a pbn_verdict already '
  'exists for the venture (server-side already-scored guard — the caller in '
  'scripts/eva/retroactive-pbn-score.mjs also checks this client-side first, but the guard here '
  'holds even for a direct RPC call, and holds under concurrent callers).';

-- pg_default_acl grants EXECUTE on new public functions to anon AND authenticated by default —
-- this function writes to ventures, so leaving that default would let the anon key retroactively
-- stamp a PBN verdict on any venture.
REVOKE ALL ON FUNCTION public.set_venture_pbn_verdict_stage_zero(uuid, jsonb) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_venture_pbn_verdict_stage_zero(uuid, jsonb) TO service_role;

DO $verify$
DECLARE
  v_test_id uuid;
  v_raised boolean := false;
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

  -- BEHAVIOURAL (finding S1 fix): a venture that already carries a pbn_verdict must be refused,
  -- never silently overwritten. Seeded and cleaned up entirely inside this migration's own
  -- transaction (BEGIN at the top of this file / COMMIT at the bottom) — nothing persists past
  -- COMMIT either way, so this is safe against a live database.
  --
  -- ADVERSARIAL REVIEW FIX (post-merge deep-tier review, PR3): a raw INSERT INTO ventures here
  -- is blocked by TWO pre-existing BEFORE INSERT triggers, both confirmed live —
  --   (a) trg_enforce_stage0_origin (database/migrations/20260330_stage_zero_enforcement.sql)
  --       raises unless leo.stage0_bypass is set — its own service_role bypass checks
  --       request.jwt.claims, a PostgREST-only GUC this direct-connection migration runner
  --       never sets, so that bypass path does not apply here;
  --   (b) auto_populate_venture_company_id raises for a NULL company_id once it falls through
  --       to its auth.uid()-based lookup, which has no result outside a real user session.
  -- Both are already the documented, precedented shape for a raw ventures INSERT inside a
  -- migration — see database/migrations/20260610_purge_parity_fixture_ventures_DOWN.sql:125-134,
  -- which hits the identical pair. That file disables trigger (b) for a bulk restore; here it is
  -- simpler and lower-risk (no DISABLE/ENABLE window to leave mismatched if this block errors) to
  -- just supply a non-null company_id, which trigger (b) accepts immediately without ever
  -- reaching the auth.uid() branch. company_id has no FK constraint (verified live via
  -- information_schema), so a fresh gen_random_uuid() is valid and this throwaway row is deleted
  -- before COMMIT regardless.
  SET LOCAL leo.stage0_bypass = 'true';
  INSERT INTO public.ventures (name, company_id, metadata)
  VALUES (
    'SD-FDBK-FIX-VENTURE-CRACK-GATE-001 verify-block throwaway venture',
    gen_random_uuid(),
    jsonb_build_object('stage_zero', jsonb_build_object('pbn_verdict', jsonb_build_object('verdict', 'PASS')))
  )
  RETURNING id INTO v_test_id;

  BEGIN
    PERFORM public.set_venture_pbn_verdict_stage_zero(v_test_id, jsonb_build_object('verdict', 'REJECT'));
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;

  DELETE FROM public.ventures WHERE id = v_test_id;

  IF NOT v_raised THEN
    RAISE EXCEPTION 'set_venture_pbn_verdict_stage_zero: overwrote an existing pbn_verdict without raising — the already-scored guard (finding S1 fix) is not actually enforced';
  END IF;
END
$verify$;

COMMIT;

-- ROLLBACK:  DROP FUNCTION IF EXISTS public.set_venture_pbn_verdict_stage_zero(uuid, jsonb);

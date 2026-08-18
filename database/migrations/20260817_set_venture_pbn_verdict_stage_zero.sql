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
-- ventures.metadata->stage_zero->pbn_verdict for one venture (via a single-level jsonb_set on
-- stage_zero merged with `||` — see the "ADVERSARIAL REVIEW FIX (round-2...)" comment below for
-- why it is not a two-level jsonb_set), and it touches no other path in metadata.
--
-- WHY jsonb_set AND NOT A JS SPREAD: jsonb_set is a single atomic UPDATE ... SET metadata =
-- jsonb_set(metadata, ...) — no read-modify-write race, no risk of clobbering a concurrent
-- writer's change to a sibling key (a JS-side `{...existing, stage_zero: {...existing.stage_zero,
-- pbn_verdict}}` spread is a read-then-write and can lose an interleaved update).
--
-- ADVERSARIAL REVIEW FIX (round-2 post-merge review, PR3): the ORIGINAL PR2 write, shipped and
-- live in main, called jsonb_set(metadata, '{stage_zero,pbn_verdict}', p_pbn_verdict, true) — a
-- TWO-level path. create_missing=true does NOT auto-vivify a missing INTERMEDIATE container; per
-- the Postgres docs, "non-existing items are only created if the LAST element of the path is a
-- key". Verified empirically against this repo's live DB (read-only literal SELECT, no table
-- touched): jsonb_set('{}'::jsonb, '{stage_zero,pbn_verdict}', '1'::jsonb, true) returns '{}'
-- COMPLETELY UNCHANGED — no error, no write. Per 20260817_venture_pbn_status_read.sql's own live
-- measurement (its header comment), only 38 of 152 ventures have ANY 'stage_zero' key today — so
-- for the other 114 (precisely the "predates the gate" population FR-6 exists to retroactively
-- score), this write was a silent no-op: the caller (scripts/eva/retroactive-pbn-score.mjs) sees
-- no writeError and reports success for a verdict that was never persisted. Fixed by collapsing
-- to a SINGLE-level jsonb_set on '{stage_zero}' (create_missing correctly creates a single,
-- final path element), merging the existing stage_zero object (if any) with the new pbn_verdict
-- key via `||` so sibling stage_zero keys (solution, target_market, ...) are preserved exactly as
-- the file's original design intent already promised, just via a call shape that actually works
-- for a venture with no stage_zero key at all. Re-verified empirically across all four shapes
-- (no metadata, metadata with unrelated keys, stage_zero with sibling keys, stage_zero already
-- carrying a verdict) before landing this fix.
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
    '{stage_zero}',
    -- Single-level path: create_missing correctly creates "stage_zero" itself when absent (a
    -- two-level path here would silently fail to — see header comment). The || merge preserves
    -- any other keys already inside stage_zero (solution, target_market, ...); only pbn_verdict
    -- is set/overwritten.
    COALESCE(metadata -> 'stage_zero', '{}'::jsonb) || jsonb_build_object('pbn_verdict', p_pbn_verdict),
    true
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
  v_test_id  uuid;
  v_test_id2 uuid;
  v_raised   boolean := false;
  v_after    jsonb;
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

  -- Both behavioural proofs below need a raw INSERT INTO ventures, which two pre-existing
  -- BEFORE INSERT triggers on this table would otherwise reject (both confirmed live via
  -- pg_trigger/pg_get_functiondef, not read from a file) —
  --   (a) trg_enforce_stage0_origin (database/migrations/20260330_stage_zero_enforcement.sql)
  --       raises unless leo.stage0_bypass is set — its own service_role bypass checks
  --       request.jwt.claims, a PostgREST-only GUC this direct-connection migration runner
  --       never sets, so that bypass path does not apply here;
  --   (b) auto_populate_company_id_trigger raises for a NULL company_id once it falls through
  --       to its auth.uid()-based lookup, which has no result outside a real user session.
  -- A FIRST DRAFT of this fix supplied a fabricated gen_random_uuid() as company_id to satisfy
  -- trigger (b) without disabling it, reasoning "company_id has no FK constraint" from an
  -- information_schema.table_constraints/key_column_usage/constraint_column_usage join — THAT
  -- WAS WRONG. Re-checked directly against pg_constraint (the authoritative catalog; the
  -- information_schema join above silently missed it): ventures.company_id carries a live FK,
  -- `ventures_company_id_fkey: FOREIGN KEY (company_id) REFERENCES companies(id)`, so a random
  -- UUID would have raised 23503 and reintroduced the exact deploy-blocking failure class this
  -- whole comment is already about. Disabling trigger (b) for this transaction only — rolled
  -- back automatically along with everything else in this file if this block ever raises before
  -- reaching the matching ENABLE below — is the same, precedented shape
  -- database/migrations/20260610_purge_parity_fixture_ventures_DOWN.sql:125-134 already uses for
  -- the identical pair of triggers, and sidesteps the FK question entirely (company_id stays
  -- NULL, which the column allows).
  SET LOCAL leo.stage0_bypass = 'true';
  ALTER TABLE public.ventures DISABLE TRIGGER auto_populate_company_id_trigger;

  -- BEHAVIOURAL 1 (finding S1 fix): a venture that already carries a pbn_verdict must be
  -- refused, never silently overwritten. Seeded and cleaned up entirely inside this migration's
  -- own transaction (BEGIN at the top of this file / COMMIT at the bottom) — nothing persists
  -- past COMMIT either way, so this is safe against a live database.
  INSERT INTO public.ventures (name, metadata)
  VALUES (
    'SD-FDBK-FIX-VENTURE-CRACK-GATE-001 verify-block throwaway venture (already scored)',
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

  -- BEHAVIOURAL 2 (round-2 adversarial review fix): a venture with NO existing stage_zero key
  -- at all must have pbn_verdict actually land, and any unrelated top-level metadata key must
  -- survive untouched. This is exactly the case the ORIGINAL PR2 write
  -- (jsonb_set(metadata, '{stage_zero,pbn_verdict}', p_pbn_verdict, true) — a two-level path)
  -- silently broke for 114 of 152 live ventures (see this file's header comment): create_missing
  -- does not auto-vivify a missing intermediate path element, so that call was a no-op, with no
  -- error, wherever stage_zero did not already exist. This proof exists specifically so that bug
  -- class cannot recur unnoticed — BEHAVIOURAL 1 above never exercises it, since its fixture
  -- already has a stage_zero key at INSERT time.
  INSERT INTO public.ventures (name, metadata)
  VALUES (
    'SD-FDBK-FIX-VENTURE-CRACK-GATE-001 verify-block throwaway venture (no stage_zero key)',
    jsonb_build_object('unrelated_key', 'should_survive')
  )
  RETURNING id INTO v_test_id2;

  PERFORM public.set_venture_pbn_verdict_stage_zero(v_test_id2, jsonb_build_object('verdict', 'PASS'));

  SELECT metadata INTO v_after FROM public.ventures WHERE id = v_test_id2;

  DELETE FROM public.ventures WHERE id = v_test_id2;

  ALTER TABLE public.ventures ENABLE TRIGGER auto_populate_company_id_trigger;

  IF v_after -> 'stage_zero' -> 'pbn_verdict' ->> 'verdict' IS DISTINCT FROM 'PASS' THEN
    RAISE EXCEPTION 'set_venture_pbn_verdict_stage_zero: did not persist a pbn_verdict for a venture with no pre-existing stage_zero key — the jsonb_set intermediate-key bug is back. got metadata=%', v_after;
  END IF;

  IF v_after ->> 'unrelated_key' IS DISTINCT FROM 'should_survive' THEN
    RAISE EXCEPTION 'set_venture_pbn_verdict_stage_zero: clobbered an unrelated top-level metadata key while writing stage_zero.pbn_verdict. got metadata=%', v_after;
  END IF;
END
$verify$;

COMMIT;

-- ROLLBACK:  DROP FUNCTION IF EXISTS public.set_venture_pbn_verdict_stage_zero(uuid, jsonb);

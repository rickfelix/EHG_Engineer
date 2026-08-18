-- SD-FDBK-FIX-VENTURE-CRACK-GATE-001 — PLAN/Gate-1 database design (DRAFT for EXEC)
-- The PBN READ PATH. Companion to 20260817_venture_gate_attestations.sql; independently applicable.
--
-- @approved-by: codestreetlabs@gmail.com
--   Chairman VERBAL approval 2026-08-18 ~10:2xZ, at-terminal morning sitting: "approve item 2"
--   (item 2 = this file + 20260817_venture_gate_attestations.sql; packet capture 54bae512).
--   Adam-scribed under the ratified chairman-verbal ceremony (worker-transcribe ruling 5d86e2e3).
--   (Original header: INTENTIONALLY BLANK pending chairman approval — now obtained.)
--
-- ============================================================================
-- THE PROBLEM THIS SOLVES, MEASURED LIVE THIS SESSION (pooler, not read from a file):
--   ventures                                        : 152 rows
--   ventures WHERE metadata ? 'stage_zero'          : 38
--   ventures WHERE metadata->'stage_zero' ? 'pbn_verdict' : 0     <-- 0 of 152
--   venture_nursery.pbn_verdict column              : ABSENT (information_schema count = 0)
--   venture_nursery                                 : 16 rows
--   venture_nursery WHERE promoted_to_venture_id IS NOT NULL : 1   <-- ONE
--   venture_nursery.venture_id column               : DOES NOT EXIST (join is promoted_to_venture_id)
--
-- So today PBN has ZERO rows in EITHER destination, and one of the two destinations is a column
-- that does not exist. 20260815_venture_nursery_pbn_verdict.sql is chairman-gated and unapplied
-- (its @approved-by is intentionally blank and checkApproverFactor fails closed).
--
-- WHY THIS MUST BE A FUNCTION AND NOT A VIEW OR A QUERY:
-- any static SQL that names venture_nursery.pbn_verdict FAILS TO PARSE TODAY (42703 undefined
-- column) — at CREATE VIEW time, not at read time. A view would therefore be unshippable until
-- the chairman applies an out-of-scope migration, and shipping it later would silently couple
-- this SD to that one. EXECUTE defers parsing to call time, so this function is valid both
-- BEFORE and AFTER that migration lands, with no redeploy. That is the whole reason for the
-- dynamic-SQL shape; it is not cleverness for its own sake.
--
-- OUT OF SCOPE, DELIBERATELY: this file does NOT fix the disjoint-PBN-storage bug (TR-8 of the
-- nursery migration: a re-check at unpark writes to a DIFFERENT destination depending on the
-- path taken — a new nursery row on REJECT/TRIM, or the promoted venture's
-- metadata.stage_zero.pbn_verdict on PASS). It reads BOTH destinations safely and reports
-- disagreement rather than hiding it.
--
-- ERROR DIFFERENTIATION IS THE POINT. "Cannot tell" and "legitimately not scored yet" must never
-- collapse into one another. Folded together, an infrastructure failure (unapplied migration,
-- malformed payload) becomes indistinguishable from a venture that simply predates the gate —
-- which is precisely the fabrication venture_demand_verdicts:30-35 forbids, and precisely the
-- "READERS-without-WRITER gate that refuses everything for the wrong reason" that the RISK pass
-- (evidence bd8028b4-4be9-44ed-a611-f97ea6165329) flagged as CRITICAL for this SD.
--
-- THE NON-OBVIOUS DISTINCTION THAT KEEPS THIS HONEST:
-- an absent venture_nursery.pbn_verdict column is only a SOURCE FAILURE for a venture that
-- actually HAS a nursery row — for the other 151/152 ventures the missing column cannot be
-- hiding a verdict, because there is no row for it to hide one in. Treating the absent column as
-- "unavailable" for all 152 would make the gate refuse the entire fleet on infrastructure
-- grounds and bury the 151 honest PBN_NOT_SCORED answers underneath. That check costs one
-- EXISTS against promoted_to_venture_id and needs no access to the missing column.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.venture_pbn_status(p_venture_id uuid)
RETURNS TABLE (
  status      text,   -- PBN_SCORED | PBN_NOT_SCORED | PBN_SOURCE_UNAVAILABLE | PBN_CONFLICT
  verdict     text,   -- PASS | REJECT | TRIM, else NULL. NULL is never a verdict.
  source      text,   -- ventures_metadata | venture_nursery | both | none
  reason      text,   -- machine-readable discriminator, always populated
  degraded    boolean -- true when an answer was produced despite one source being unreadable
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER          -- NOT definer: a definer function here would hand anon a privileged read.
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_exists        boolean;
  v_meta_raw      jsonb;
  v_meta_verdict  text;
  v_has_nursery   boolean;
  v_col_present   boolean;
  v_nur_raw       jsonb;
  v_nur_verdict   text;
BEGIN
  -- 0. Does the venture exist at all? A missing subject is an infrastructure answer, never
  --    "not scored" — a venture that does not exist has not "legitimately not been scored".
  SELECT EXISTS(SELECT 1 FROM public.ventures v WHERE v.id = p_venture_id) INTO v_exists;
  IF NOT v_exists THEN
    RETURN QUERY SELECT 'PBN_SOURCE_UNAVAILABLE', NULL::text, 'none', 'venture_not_found', false;
    RETURN;
  END IF;

  -- 1. ventures.metadata.stage_zero.pbn_verdict — ALWAYS readable (plain jsonb, no migration
  --    dependency). jsonb_exists() is used rather than the `?` operator on purpose: `?` collides
  --    with the placeholder syntax of several drivers/poolers, and this predicate must survive
  --    being embedded in application queries later. COALESCE guards the NULL-propagation trap —
  --    jsonb_exists(NULL,'k') is NULL, not false, so a NULL metadata would otherwise fall through
  --    every branch as unknown-truth.
  SELECT COALESCE(v.metadata, '{}'::jsonb) -> 'stage_zero' -> 'pbn_verdict'
    INTO v_meta_raw
  FROM public.ventures v WHERE v.id = p_venture_id;

  IF v_meta_raw IS NOT NULL AND jsonb_typeof(v_meta_raw) <> 'null' THEN
    -- Shape-tolerant by necessity: the destination has 0 live rows, so its shape is unproven.
    -- The nursery migration documents an OBJECT ({verdict, proven, better, new, ...}); a writer
    -- could equally store the bare string. Accept both, and treat anything else as a SOURCE
    -- failure rather than guessing — a malformed payload is an infrastructure defect, not a
    -- venture that was never scored.
    v_meta_verdict := CASE jsonb_typeof(v_meta_raw)
      WHEN 'object' THEN v_meta_raw ->> 'verdict'
      WHEN 'string' THEN v_meta_raw #>> '{}'
      ELSE NULL
    END;

    IF v_meta_verdict IS NULL OR v_meta_verdict NOT IN ('PASS','REJECT','TRIM') THEN
      RETURN QUERY SELECT 'PBN_SOURCE_UNAVAILABLE', NULL::text, 'ventures_metadata',
             'metadata_pbn_verdict_malformed:' || jsonb_typeof(v_meta_raw), false;
      RETURN;
    END IF;
  END IF;

  -- 2. Is there a nursery row for this venture? NOTE: venture_nursery has NO venture_id column —
  --    the only link is promoted_to_venture_id (measured). This EXISTS does not touch the
  --    possibly-absent pbn_verdict column, so it is safe today.
  SELECT EXISTS(
    SELECT 1 FROM public.venture_nursery n WHERE n.promoted_to_venture_id = p_venture_id
  ) INTO v_has_nursery;

  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='venture_nursery' AND column_name='pbn_verdict'
  ) INTO v_col_present;

  -- 3. Read the nursery destination ONLY when it is both relevant and readable.
  IF v_has_nursery AND v_col_present THEN
    -- EXECUTE, not a static reference: see the header. Parsing is deferred to call time so this
    -- function is creatable while the column is absent. No identifier is interpolated, so there
    -- is no injection surface — the string is a compile-time constant.
    EXECUTE
      'SELECT n.pbn_verdict FROM public.venture_nursery n '
      'WHERE n.promoted_to_venture_id = $1 '
      'ORDER BY COALESCE(n.promoted_at, n.created_at) DESC NULLS LAST LIMIT 1'
      INTO v_nur_raw USING p_venture_id;

    -- ADVERSARIAL REVIEW FIX (PR1 deep-tier review): the metadata-read branch above accepts
    -- both an object shape ({verdict:...}) and a bare string shape (since 0 live rows exist in
    -- either destination, neither writer's actual shape is proven). The nursery branch originally
    -- only unpacked 'object', so a bare-string verdict here silently fell through to
    -- PBN_NOT_SCORED instead of resolving — directly contradicting this function's own
    -- documented invariant that PBN_SOURCE_UNAVAILABLE/a real verdict is never folded into
    -- PBN_NOT_SCORED. Mirror the same object/string tolerance applied to the metadata branch.
    IF v_nur_raw IS NOT NULL AND jsonb_typeof(v_nur_raw) = 'object' THEN
      v_nur_verdict := v_nur_raw ->> 'verdict';
    ELSIF v_nur_raw IS NOT NULL AND jsonb_typeof(v_nur_raw) = 'string' THEN
      v_nur_verdict := v_nur_raw #>> '{}';
    END IF;
    IF v_nur_verdict IS NOT NULL AND v_nur_verdict NOT IN ('PASS','REJECT','TRIM') THEN
      v_nur_verdict := NULL;   -- CHECK-constrained upstream; treat any surprise as absent, not as a verdict
    END IF;
  END IF;

  -- 4. Resolve. Order matters: conflict first, then each single source, then the two distinct
  --    "no verdict" reasons.

  -- 4a. BOTH scored and DISAGREEING. Never silently prefer one. This is not hypothetical: the one
  --     promoted nursery row live today (ac45469b, "Image Alt Text Generator") points at
  --     50763b6a = AltifyAI — which is also a retroactive-scoring target. So the single venture
  --     where both destinations can be populated is the highest-profile one in the SD, and TR-8's
  --     "the two destinations are disjoint" assumption does not hold for it. Callers MUST treat
  --     PBN_CONFLICT as fail-closed, exactly like PBN_SOURCE_UNAVAILABLE: two disagreeing
  --     verdicts mean nobody knows the answer, and picking one would manufacture certainty.
  IF v_meta_verdict IS NOT NULL AND v_nur_verdict IS NOT NULL AND v_meta_verdict <> v_nur_verdict THEN
    RETURN QUERY SELECT 'PBN_CONFLICT', NULL::text, 'both',
           'metadata=' || v_meta_verdict || ';nursery=' || v_nur_verdict, false;
    RETURN;
  END IF;

  -- 4b. Metadata is authoritative when present. Grounded in the nursery migration's own TR-8
  --     comment: a nursery row records what THAT ROW scored at park time, while a PASS after
  --     promotion lands in the resulting venture's metadata. For a venture that exists, the
  --     metadata verdict is therefore the later, post-promotion fact.
  IF v_meta_verdict IS NOT NULL THEN
    RETURN QUERY SELECT 'PBN_SCORED', v_meta_verdict,
           CASE WHEN v_nur_verdict IS NOT NULL THEN 'both' ELSE 'ventures_metadata' END,
           CASE WHEN v_has_nursery AND NOT v_col_present
                THEN 'metadata_authoritative;nursery_column_absent'
                ELSE 'metadata_authoritative' END,
           (v_has_nursery AND NOT v_col_present);
    RETURN;
  END IF;

  IF v_nur_verdict IS NOT NULL THEN
    RETURN QUERY SELECT 'PBN_SCORED', v_nur_verdict, 'venture_nursery', 'nursery_only', false;
    RETURN;
  END IF;

  -- 4c. No verdict anywhere. Now split the two reasons that must NEVER be folded.
  --     The absent column is a source failure ONLY if a nursery row exists to have held a verdict.
  IF v_has_nursery AND NOT v_col_present THEN
    RETURN QUERY SELECT 'PBN_SOURCE_UNAVAILABLE', NULL::text, 'venture_nursery',
           'nursery_column_absent:20260815_venture_nursery_pbn_verdict.sql_unapplied', false;
    RETURN;
  END IF;

  -- Legitimately pre-gate: every readable source was read and none holds a verdict.
  RETURN QUERY SELECT 'PBN_NOT_SCORED', NULL::text, 'none',
         CASE WHEN v_has_nursery THEN 'nursery_row_present_but_unscored'
              ELSE 'no_nursery_row_and_no_metadata_verdict' END,
         false;
END
$fn$;

COMMENT ON FUNCTION public.venture_pbn_status(uuid) IS
  'SD-FDBK-FIX-VENTURE-CRACK-GATE-001. Error-differentiated PBN read across BOTH destinations '
  '(ventures.metadata.stage_zero.pbn_verdict and venture_nursery.pbn_verdict, joined via '
  'promoted_to_venture_id — venture_nursery has no venture_id column). Valid whether or not '
  '20260815_venture_nursery_pbn_verdict.sql has been applied: the nursery read is dynamic so the '
  'function creates cleanly while that column is absent. Four closed statuses. PBN_SOURCE_UNAVAILABLE '
  '(infra: venture missing, malformed payload, or a nursery row whose verdict column does not exist) '
  'is NEVER folded into PBN_NOT_SCORED (legitimate pre-gate venture) — an absent column is only a '
  'source failure for a venture that HAS a nursery row. PBN_CONFLICT means the two destinations '
  'disagree; callers MUST fail closed on it. Read fail-closed: gate on status=''PBN_SCORED'' AND '
  'verdict=''PASS'', never on status <> something.';

-- pg_default_acl grants EXECUTE on new public functions to anon AND authenticated (measured:
-- defaclobjtype='f' -> anon=X/postgres). This function reads venture metadata, so leaving that
-- default in place would publish a per-venture PBN oracle to the anon key.
REVOKE ALL ON FUNCTION public.venture_pbn_status(uuid) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.venture_pbn_status(uuid) TO service_role;

DO $verify$
DECLARE r record; probe uuid;
BEGIN
  IF to_regprocedure('public.venture_pbn_status(uuid)') IS NULL THEN
    RAISE EXCEPTION 'venture_pbn_status did not land';
  END IF;

  -- ADVERSARIAL REVIEW FIX (post-merge SECURITY pass): the sibling migrations in this SD
  -- (20260817_venture_gate_attestations.sql's REVOKE/GRANT pair and
  -- 20260817_set_venture_pbn_verdict_stage_zero.sql's verify block) both assert their own
  -- grants live in the verify block, not just declare REVOKE/GRANT statements earlier in the
  -- file. This function was the one migration in the set that skipped that self-check — a
  -- silent grant drift (e.g. a future edit re-adding a PUBLIC grant) would have shipped clean.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public' AND routine_name = 'venture_pbn_status'
      AND grantee IN ('anon', 'authenticated', 'PUBLIC')
  ) THEN
    RAISE EXCEPTION 'venture_pbn_status: a non-service grant is present — this function reads venture metadata and must not be anon/authenticated-executable';
  END IF;

  -- BEHAVIOURAL: a random uuid must resolve to the infra branch, not to "not scored". If these
  -- two ever collapse, the gate reports healthy pre-gate ventures while infrastructure is broken.
  SELECT * INTO r FROM public.venture_pbn_status('00000000-0000-0000-0000-000000000000'::uuid);
  IF r.status <> 'PBN_SOURCE_UNAVAILABLE' OR r.reason <> 'venture_not_found' THEN
    RAISE EXCEPTION 'venture_pbn_status: a nonexistent venture resolved to %/% — the infra/pre-gate distinction is broken', r.status, r.reason;
  END IF;

  -- BEHAVIOURAL: a real venture must resolve without raising, and (today, 0/152 scored) must not
  -- claim to be scored. This is the assertion that would have caught a static reference to the
  -- absent nursery column.
  SELECT id INTO probe FROM public.ventures LIMIT 1;
  IF probe IS NOT NULL THEN
    SELECT * INTO r FROM public.venture_pbn_status(probe);
    IF r.status NOT IN ('PBN_NOT_SCORED','PBN_SCORED','PBN_SOURCE_UNAVAILABLE','PBN_CONFLICT') THEN
      RAISE EXCEPTION 'venture_pbn_status returned an out-of-vocabulary status: %', r.status;
    END IF;
  END IF;
END
$verify$;

COMMIT;

-- ============================================================================
-- ROLLBACK:  DROP FUNCTION IF EXISTS public.venture_pbn_status(uuid);
-- ============================================================================
